---
name: offline-pwa
description: >
  Turn a server-first edge app into an installable, offline-capable PWA without breaking the
  spine: a web app manifest, a service worker with a real install/activate/update lifecycle,
  per-request-class cache strategies (cache-first for static assets, stale-while-revalidate
  for public data, network-first for the app shell), an offline fallback page, and an offline
  mutation queue that replays idempotently on reconnect. Keeps authed/secret responses out of
  the shared SW cache and scopes offline data to the signed-in user. This is an opt-in
  deviation from the server-first default — worth it for field/mobile/flaky-network apps, not
  a reliably-online dashboard.
  Use when: "make it a PWA", "offline support", "service worker", "installable app",
  "background sync", "work offline".
  Do NOT use for: server-side caching/ISR/revalidate (use data-fetching-cache); the edge
  runtime's own API constraints (use edge-runtime-constraints); making a replay safe to dedup
  (use idempotency-keys, which this skill hands the queued mutation to).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the naive-PWA failure class: a service worker that caches
    authed/per-user responses into the shared cache (Rule 9/2), naive cache-first with no
    version/cleanup/skipWaiting (stale forever), offline mutations dropped or replayed with no
    idempotency key (double-submit), no offline fallback, and a manifest with hardcoded hex.
    Baseline observed (clean-room capture).
---

# offline-pwa

The opt-in layer that makes a server-first edge app installable and usable offline: a manifest, a
service worker with a real update story, per-request cache strategies, an offline fallback, and an
offline mutation queue that replays idempotently. It exists because the naive version caches authed
responses into a shared cache, serves stale assets forever after a deploy, and double-submits queued
mutations on reconnect. A deliberate deviation from the server-first default in `../../CLAUDE.md` —
record the opt-in and offline scope in `DECISIONS.md`. The spine and nine rules live there; don't restate them.

---

## Non-Negotiable Rules

A service worker is a powerful, persistent interception layer; its failures are invisible in a
single online dev session and surface only offline, after a deploy, or on a reconnect:

- **Never cache an authed or secret-bearing response in the shared SW cache.** Cache Storage is
  per-origin and shared app-wide; an authed `/api/trpc` response cached there is serveable to any
  later request and outlives sign-out (Rule 9, Rule 2). Cache only public static assets; keep
  per-user data in user-scoped IndexedDB.
- **Never replay a queued offline mutation that isn't idempotent.** Background Sync is at-least-once
  — it can fire more than once and across tabs. Every queued mutation carries a client-generated
  `Idempotency-Key`; the *server* dedups it (hand to `idempotency-keys`).
- **Never ship a SW without a versioned-cache + activate-cleanup + update story.** Naive cache-first
  with no version serves stale assets forever — users get a broken app after every deploy. Version
  the cache, delete old caches on `activate`, run a controlled `skipWaiting` + reload — never
  auto-`skipWaiting` silently mid-session.
- **Never let the SW treat user-owned data as a static asset or intercept the auth flow.** Scope
  offline data to the current user and clear it on sign-out; exclude Clerk auth routes from SW
  handling (Rule 2). One user's offline data must never surface for another.

Refuse these rationalizations: "caching the API response makes offline snappier"; "the user
won't be on two tabs and sync only fires once"; "I'll bump the cache name later"; "offline data
is just the user's own data, the shared cache is fine."

---

## When to Use

- The app is used in the field, on mobile, or on flaky/no connectivity (delivery, inspection,
  warehouse, transit, events) and must keep working offline.
- You want installability — add-to-home-screen, a standalone window, an app icon — with or
  without full offline.
- A user must queue an action offline (log a delivery, submit a form) and have it sync on reconnect,
  or you want a precached app-shell for instant repeat loads on slow networks.

## When NOT to Use

- **First: is this even worth it?** A server-first edge app is online-by-default; a SW adds a
  cache-coherence and update burden for an offline path most apps never exercise. If your users
  are reliably online (internal dashboard, marketing site, desktop SaaS), the honest answer is
  don't — ship a manifest for installability at most. Record the call in `DECISIONS.md`.
- Server-side caching, ISR, `revalidate`, the `fetch` cache → `data-fetching-cache` (this skill
  owns the *client/SW* cache; that one owns the *server* cache — opposite sides).
- The edge runtime's own API constraints (Node built-ins, drivers) → `edge-runtime-constraints`.
- Making a queued mutation safe to replay (dedup store, fingerprint, atomic claim) →
  `idempotency-keys`; this skill queues and replays, that one guarantees exactly-once *effect*.
- The App Router static/dynamic boundary and route handlers → `nextjs-app-router`.

---

## Procedure

1. **Decide if a PWA earns its place, then scope "offline" (high-interrogation — load-bearing).**
   Which screens must work offline, which data must be available, which actions must queue. If
   users are reliably online, stop at the manifest. Record the opt-in and the offline scope in
   `DECISIONS.md`. See `references/manifest-and-install.md`.
2. **Author the manifest and installability (low).** `app/manifest.ts` with
   `name`/`short_name`/`start_url`/`display: "standalone"`, `theme_color`/`background_color` from
   the `@theme` tokens (Rule 3 — never raw hex), and maskable + any-purpose icons (192/512). See
   `references/manifest-and-install.md`.
3. **Register the SW and own its lifecycle (medium).** Register after load from a client leaf; handle
   `install` (precache the versioned shell), `activate` (delete old caches, `clients.claim()`), and a
   controlled update (waiting worker → prompt → `skipWaiting` → reload). See
   `references/service-worker-and-cache.md`.
4. **Assign a cache strategy per request class, keep authed/secret out (high — Rule 9/2).** Static
   build assets (`/_next/static`, fonts, icons) → cache-first, versioned. App-shell navigations →
   network-first so a deploy reaches users. Public GETs → SWR. Authed/per-user/secret responses and
   all mutations → network-only, never shared-cached; per-user data → user-scoped IndexedDB. See
   `references/service-worker-and-cache.md`.
5. **Build the offline fallback (medium — Rule 4).** A precached `/offline` route the navigation
   handler serves when the network fails and nothing is cached — an honest no-network state, not a
   white screen. The whole-app offline state, distinct from a data view's four states.
6. **Queue offline mutations and replay them idempotently (high — at-least-once).** When a mutation
   fails offline, enqueue it (IndexedDB / Background Sync) with a client-generated `Idempotency-Key`;
   on reconnect replay it against the tRPC mutation, which dedups on that key. Background Sync may
   fire more than once — the server's store guarantees once. See `references/offline-mutations.md`.
7. **Verify offline and update for real (medium).** DevTools offline; hard-reload after a deploy to
   confirm the new SW activates and old caches are gone; confirm no authed response sits in Cache
   Storage; confirm a queued mutation replays once. Hand the SW surface to `security-pass`, the
   install/offline UI to `a11y-gate`.

---

## Composes With

- **Consumes:** `nextjs-app-router` — the `app/manifest.ts`, route handlers, and static/dynamic boundary
  the SW caches against; the `/offline` route is an ordinary App Router segment.
- **Pairs with:** `data-fetching-cache` — it owns the *server* cache (ISR/`revalidate`/tags); this owns
  the *client/SW* cache. Read its boundary so a response isn't double-cached or wrongly shared.
- **Depends on:** `idempotency-keys` — the offline queue replays at-least-once; that skill makes each
  replay safe (key + atomic claim + dedup store). This skill never re-implements dedup.
- **Pairs with:** `image-optimization` — precaching caches the *optimized* `next/image` variants and the
  manifest icons; the SW serves them, it doesn't bypass the pipeline.
- **Hands off:** SW interception threat-model + headers → `security-pass`; install/offline UI a11y →
  `a11y-gate`; edge runtime API questions → `edge-runtime-constraints`. Runs against `../../CLAUDE.md`
  (server-first default — this opt-in deviation is recorded in `DECISIONS.md`).

---

## Baseline failure (observed 2026-06-27)

> Captured clean-room: a general-purpose agent told to build the PWA as a normal developer from
> general knowledge, explicitly *not* reading this repo's `.claude/` or `CLAUDE.md`. The imagined
> catastrophe (authed responses cached, no idempotency key, no update story, no offline fallback)
> did NOT occur — a capable base model is better than that. A **narrower** class was confirmed.

**Observed run.** Prompt: "make our Next.js app a PWA that works offline and syncs the
`delivery.log` mutation on reconnect." The agent produced a competent design: a versioned SW with
`activate` cleanup, network-first navigations, cache-first hashed assets, an `/offline` fallback, a
client `clientId` per queued mutation, and a server `onConflictDoNothing` on it — and it
deliberately kept mutations *out* of the SW. But the quiet disciplines were missing:

```js
// stale-while-revalidate catch-all — caches EVERY other GET, including authed /api/trpc queries
event.respondWith(caches.open(RUNTIME_CACHE).then(async (cache) => { /* no /api/ exclusion */ }));
self.skipWaiting(); // called unconditionally in install — silent mid-session controller swap
// manifest + viewport: theme_color "#0b0f17" — raw hex, not a design token (Rule 3)
// outbox DB "fleetlog" is shared across users on the device, never cleared on sign-out (Rule 2)
.onConflictDoNothing({ target: deliveries.clientId }) // no body fingerprint; nullable unique
```

**Failure class (confirmed, narrowed).** Not "double-charges and leaks everything" — "a plausible
PWA with the safety disciplines skipped." tRPC *queries are GETs*, so the SWR catch-all caches authed
`/api/trpc` reads into the shared cache (Rule 9/2); `skipWaiting()` fires silently instead of a
controlled update; the manifest hardcodes hex (Rule 3); the offline queue's input type is
hand-redeclared parallel to the Zod schema (Rule 1) and its outbox isn't user-scoped or cleared on
sign-out (Rule 2); and dedup is a fingerprint-less unique column — same key + different body silently
no-ops, never a 409, on a nullable column that doesn't dedupe online writes. This skill closes each.

---

## Examples

**Input:** "Drivers lose signal in the field; they must log deliveries offline and sync on reconnect."
**Output:** Scopes offline to the delivery-log screen (`DECISIONS.md`). `app/manifest.ts` + standalone
install; SW precaches the versioned shell with network-first navigations (so a deploy lands) and
cache-first `/_next/static`. The log-delivery mutation, when offline, enqueues to IndexedDB with a
generated `Idempotency-Key`; on reconnect Background Sync wakes the page, which replays it through the
tRPC client, and the server dedups (`idempotency-keys`) so a double-fire logs once. Authed data lives
in user-scoped IndexedDB, cleared on sign-out.

**Input:** "Make our SaaS installable as an app." (reliably-online dashboard)
**Output:** Honest call — they want installability, not offline. Ship `app/manifest.ts` with maskable
icons + `display: "standalone"` and the install prompt; do *not* add a service worker, because a SW
would add a stale-cache and update burden for an offline path this app never exercises (`DECISIONS.md`).

**Input:** "Cache the dashboard so it loads instantly even after a deploy."
**Output:** SWR for the public shell + cache-first versioned `/_next/static`, but the per-user
dashboard *data* is never in the shared SW cache (Rule 2/9) — read fresh or from user-scoped IndexedDB
— and navigations are network-first so a new deploy reaches users. Server cache → `data-fetching-cache`.

---

## Edge Cases

- **Background Sync isn't supported (e.g. iOS Safari)** → don't rely on the `sync` event; fall back
  to replay-on-reconnect via the `online`/`visibilitychange` events. The queue must not assume
  Background Sync exists.
- **A queued create depends on a server-generated id** (an offline-created child of an
  offline-created parent) → assign a client UUIDv7 at enqueue time so parent and child reconcile on
  replay without a server round-trip (`uuidv7-ids`); reconcile ids on sync.
- **The user signs out (or a different user signs in) while offline data sits in IndexedDB** → clear
  all user-scoped caches/stores on the auth change; never let one user's offline data surface for
  another (Rule 2).
- **A deploy changes the tRPC input shape while a mutation is still queued** → version the queued
  payload; on replay, if the server rejects the shape, surface a recoverable error rather than
  dropping it silently or replaying blindly forever.

---

## References

- `references/manifest-and-install.md` — the worth-it / scope decision, the `app/manifest.ts` manifest
  (tokens not hex, maskable icons, installability criteria), and the installability-only path.
- `references/service-worker-and-cache.md` — SW registration, the install/activate/update lifecycle,
  versioned caches + `skipWaiting`, the per-request-class cache strategy table, the authed-response
  boundary, and the offline fallback route.
- `references/offline-mutations.md` — the offline mutation queue, client `Idempotency-Key` generation,
  Background Sync replay (at-least-once), the reconnect fallback, and the hand-off to `idempotency-keys`.

## Scripts

`scripts/` is reserved. A signal that would justify one: a static check flagging a SW `fetch`
handler that caches a response whose request URL matches an authed/API path (`/api/`, `/trpc/`), or
a SW file with no `caches.delete` in an `activate` handler (no cache-cleanup/version story) — both
greppable tells of the Rule 9/2 and stale-forever failures. Until reliably detectable, reserved.
