Purpose: the offline mutation queue, client Idempotency-Key generation, Background Sync replay (at-least-once), the reconnect fallback, and the hand-off to idempotency-keys.

# Why the queue is dangerous: replay is at-least-once

The offline mutation queue is the part of a PWA most likely to corrupt data. The Background Sync API
fires the `sync` event **at least once** — it can fire more than once for the same registration, and
the same queue can be drained by more than one tab. So the queue's job is *delivery*, not *exactly
once*. Exactly-once is the **server's** job, via an `Idempotency-Key` the server dedups on — exactly
what `idempotency-keys` builds. This skill produces the key and replays; it never re-implements dedup.

# Enqueue with a client-generated key

When a mutation fails because the device is offline, store the intent — including a key generated
**at enqueue time** (not at replay time, or a double-drain makes two keys for one action).

```ts
// src/lib/offline-queue.ts  (runs in the page, writes to IndexedDB)
import { openDB } from "idb";
import { uuidv7 } from "~/lib/uuidv7"; // client UUIDv7 (uuidv7-ids) — sortable, unguessable

// Scope the store to the signed-in user (Rule 2): the DB name carries the user id so one user's
// queue can never be drained as another. Clear this DB on sign-out / user change.
const dbName = (userId: string) => `offline-queue:${userId}`;

export async function enqueueMutation(userId: string, op: QueuedOp) {
  const db = await openDB(dbName(userId), 1, {
    upgrade(d) { d.createObjectStore("ops", { keyPath: "key" }); },
  });
  await db.put("ops", {
    key: op.key ?? uuidv7(),     // the Idempotency-Key — minted once, here
    path: op.path,               // e.g. "delivery.log"
    input: op.input,             // the validated tRPC input
    version: op.version,         // payload schema version (see "deploy changed the shape")
    enqueuedAt: new Date().toISOString(),
  });
  await requestSync();           // ask the browser to replay when there's connectivity
}
```

# Request a Background Sync, with a reconnect fallback

The service worker's `sync` event runs in the *worker* scope — no `window`, no tRPC client, and no
knowledge of which user is signed in. So the SW does **not** drain the queue itself; it only *wakes
the page*, and the page (which has the tRPC client and the known `userId`) does the replay. Background
Sync is the trigger; the page is the drain site. The same page drain runs from `online`/`visibilitychange`
on browsers without Background Sync (notably iOS Safari).

```ts
// page side: register a sync if available, and listen for the SW's wake + the no-sync fallbacks.
async function requestSync() {
  const reg = await navigator.serviceWorker.ready;
  // SyncManager isn't in lib.dom yet — narrow once, don't reach for `any` (Rule 1).
  const withSync = reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } };
  if (withSync.sync) {
    try { await withSync.sync.register("flush-mutations"); } catch { /* fall through to listeners */ }
  }
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.type === "FLUSH_QUEUE") void flushCurrentUser();
  });
  window.addEventListener("online", () => void flushCurrentUser());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.onLine) void flushCurrentUser();
  });
}
```

```js
// public/sw.js — the sync handler only wakes clients; it never replays the mutation itself.
self.addEventListener("sync", (event) => {
  if (event.tag === "flush-mutations") event.waitUntil(wakeClientsToFlush());
});
async function wakeClientsToFlush() {
  const all = await self.clients.matchAll({ includeUncontrolled: true });
  for (const c of all) c.postMessage({ type: "FLUSH_QUEUE" });
}
```

# Replay: through the tRPC client, forwarding the key

Replay through the **vanilla tRPC client**, not a hand-built `fetch` to `/api/trpc` — the HTTP adapter
expects tRPC's envelope (and the superjson transformer wraps inputs), so a raw POST is fragile and
breaks the type chain (Rule 1). Forward the `Idempotency-Key` as a header; the procedure Zod-parses it
and the body (Rule 8) and claims it atomically before the effect — that is `idempotency-keys`' contract.
A `sync` that fires twice, or two tabs draining together, both forward the *same* key, so the server
runs the effect once and replays the stored result.

```ts
import { createTRPCClient, httpLink } from "@trpc/client";
import superjson from "superjson";
import { TRPCClientError } from "@trpc/client";
import type { AppRouter } from "~/server/api/root";

// One non-batching client per op so each call carries its own key. Clerk's cookie rides same-origin.
const clientForKey = (key: string) =>
  createTRPCClient<AppRouter>({
    links: [httpLink({
      url: "/api/trpc",
      transformer: superjson,
      headers: () => ({ "Idempotency-Key": key }),
      fetch: (u, o) => fetch(u, { ...o, credentials: "include" }),
    })],
  });

async function flush(userId: string) {
  const db = await openDB(dbName(userId), 1);
  for (const op of await db.getAll("ops")) {
    try {
      // `op` is a discriminated union keyed by `path`, so `op.input` stays typed (Rule 1) — switch,
      // don't dispatch a stringly path. e.g. case "delivery.log": await client.delivery.log.mutate(op.input)
      await replayTyped(clientForKey(op.key), op);
      await db.delete("ops", op.key);                  // ran or replayed → drop it
    } catch (err) {
      if (err instanceof TRPCClientError && err.data?.code === "CONFLICT") {
        await db.delete("ops", op.key);                // same key, different body — client bug, don't loop
      } else if (isTransient(err)) {
        break;                                         // network / 5xx → leave queued, retry next trigger
      } else {
        await markFailed(db, op);                      // other 4xx (shape rejected after a deploy) → surface
      }
    }
  }
}
```

`event.waitUntil` in the SW keeps the worker alive only long enough to post the wake message; the page
keeps itself alive while draining. Replaying one op at a time (not a batch) lets each call carry its own
key cleanly.

# The rules this enforces (so the queue can't corrupt data)

- **Key minted at enqueue, once.** Two replays of one action share one key → one server effect.
- **Server dedups, not the client.** The client cannot guarantee single delivery; `idempotency-keys`
  guarantees single *effect*. Never "fix" double-submit by trying to make the client fire once.
- **Drop on 2xx/409, retry on 5xx, surface on other 4xx.** A 409 (fingerprint mismatch) is a client
  bug, not a transient error — looping on it never succeeds. A 4xx shape rejection after a deploy is
  recoverable-by-human, not silently-droppable.
- **User-scoped store, cleared on auth change.** The queue DB name carries the user id; sign-out and
  user-switch wipe it so a queued op never replays as the wrong user (Rule 2).

# Id reconciliation for offline-created chains

If an offline action creates a row that a later offline action references (a parent and its child),
don't wait for a server id. Mint the parent's id client-side with UUIDv7 (`uuidv7-ids`) at creation,
reference that id in the child op, and send both ids on replay. Because UUIDv7 is generated client-side
and is globally unique, the server accepts the client's id and the chain reconciles without a
round-trip between the two replays.
