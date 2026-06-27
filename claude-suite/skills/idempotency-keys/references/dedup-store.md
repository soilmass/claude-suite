Purpose: the `request_idempotency` Drizzle table, the atomic `onConflictDoNothing` claim and its branch, the per-table unique-key variant, and the TTL sweep.

# The dedup store and the atomic claim

## The table

The store records one row per `(scope, key)`: the fingerprint to detect body mismatches, a
status, the stored result to replay, and a TTL. It is keyed UNIQUE on `(scope_id,
idempotency_key)` — that unique index is the entire concurrency-safety mechanism.

```ts
// src/db/schema/idempotency.ts
import { pgEnum, pgTable, text, jsonb, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

export const idempotencyStatus = pgEnum("idempotency_status", ["pending", "completed"]);

export const requestIdempotency = pgTable(
  "request_idempotency",
  {
    // Scope keys per caller (Rule 2): ctx.auth.userId, an org id, or a "webhook:stripe" sentinel.
    scopeId: text("scope_id").notNull(),
    // The caller-chosen opaque key (see when-and-fingerprint.md).
    idempotencyKey: text("idempotency_key").notNull(),
    // sha-256 of the canonical, validated body. Mismatch on replay => 409.
    fingerprint: text("fingerprint").notNull(),
    status: idempotencyStatus("status").notNull().default("pending"),
    // The stored prior result, returned verbatim on replay. null while pending.
    response: jsonb("response").$type<unknown>(),
    // The outcome code to replay alongside the body (e.g. 200). null while pending.
    responseStatus: integer("response_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // TTL (Rule 6). Match the provider window (~24h). Swept; see below.
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    // THE safety mechanism: two concurrent claims for the same (scope, key) cannot both insert.
    byKey: uniqueIndex("request_idempotency_key_uq").on(t.scopeId, t.idempotencyKey),
    byExpiry: index("request_idempotency_expiry_idx").on(t.expiresAt),
  }),
);
```

Edge note: this is a plain unique-row claim — no advisory lock, no `SELECT … FOR UPDATE` held
open across a connection, so it works under the serverless HTTP driver (no long-lived TCP, per
`../../CLAUDE.md`). An edge KV (`set` with `nx: true` + a TTL) is an equivalent claim primitive
when you want the dedup record off the primary DB; the branch logic below is identical.

## The atomic claim

Claim with `onConflictDoNothing` and inspect `.returning()`. A non-empty result means *this*
call won the race and owns the effect; an empty result means the key already existed.

```ts
// src/server/idempotency/claim.ts
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { requestIdempotency } from "~/db/schema/idempotency";
import type { Db } from "~/db";

const TTL_MS = 24 * 60 * 60 * 1000; // 24h — record the window in DECISIONS.md

type ClaimResult =
  | { outcome: "claimed" } // we own the effect; run it, then complete()
  | { outcome: "replay"; response: unknown; status: number | null }; // return the stored result

export async function claimKey(
  db: Db,
  scopeId: string,
  key: string,
  fingerprint: string,
): Promise<ClaimResult> {
  const claimed = await db
    .insert(requestIdempotency)
    .values({ scopeId, idempotencyKey: key, fingerprint, expiresAt: new Date(Date.now() + TTL_MS) })
    .onConflictDoNothing({ target: [requestIdempotency.scopeId, requestIdempotency.idempotencyKey] })
    .returning({ key: requestIdempotency.idempotencyKey });

  if (claimed.length > 0) return { outcome: "claimed" };

  // Key already exists — read it and branch.
  const [existing] = await db
    .select()
    .from(requestIdempotency)
    .where(and(eq(requestIdempotency.scopeId, scopeId), eq(requestIdempotency.idempotencyKey, key)));

  if (!existing) {
    // Raced + swept between insert and select — extremely rare; treat as retryable.
    throw new TRPCError({ code: "CONFLICT", message: "Idempotency key contended; retry." });
  }
  if (existing.fingerprint !== fingerprint) {
    throw new TRPCError({ code: "CONFLICT", message: "Idempotency-Key reused with a different request body." });
  }
  if (existing.status === "completed") {
    return { outcome: "replay", response: existing.response, status: existing.responseStatus };
  }
  // status === "pending": the original is still in flight. Don't run the effect; tell the caller to retry.
  throw new TRPCError({ code: "CONFLICT", message: "Original request still processing; retry shortly." });
}
```

Why `onConflictDoNothing` and not check-then-act: under concurrency, two retries that both
`SELECT` (find nothing) and then both `INSERT` would both proceed. The unique index makes the
second `INSERT` a no-op, so exactly one call returns a row and owns the effect.

## Completing the claim

After the effect succeeds, flip the row to `completed` with the result via a `completeKey` helper
(the one `safe-retry.md` imports; a `completeKeyTx` variant takes a `tx` instead of `db`):

```ts
// src/server/idempotency/complete.ts
export async function completeKey(db: Db, scopeId: string, key: string, result: unknown) {
  await db
    .update(requestIdempotency)
    .set({ status: "completed", response: result, responseStatus: 200 })
    .where(and(eq(requestIdempotency.scopeId, scopeId), eq(requestIdempotency.idempotencyKey, key)));
}
```

## The per-table unique-key variant (pure DB writes)

When the effect *is* a single DB insert (create-order), you don't need the separate store: carry
`idempotency_key` on the table itself and put the dedup in a unique index. The `onConflictDoNothing`
upsert plus a read-after-write guard returns the existing row. This keeps the effect and the dedup
in one atomic statement. See `safe-retry.md` for the code.

## TTL and the sweep

Keys are not kept forever — `expires_at` bounds them to the provider's retry window. Sweep
expired rows from an off-edge job (cron/queue worker, the same place `data-backfill` runs),
never inline in a request:

```ts
await db.delete(requestIdempotency).where(lt(requestIdempotency.expiresAt, new Date()));
```

Record the TTL window in `DECISIONS.md` — it is a real trade-off (longer = more dedup safety,
more storage; shorter = keys recycle sooner). After expiry, the same key is treated as a fresh
request, which is correct because the retry window has closed.
