# Backfill patterns — keyset batching, idempotency, resume, throttling, runnable skeleton

The mechanics of a safe backfill on the edge stack (Drizzle + serverless/HTTP driver). Every
pattern here exists to satisfy the four hard lines in the SKILL: bounded batches, off-edge
execution, idempotency, and keyset (never OFFSET) paging.

## Why not the obvious one-liner

```ts
// WRONG: one unbounded statement.
await db.update(users).set({ fullName: sql`first_name || ' ' || last_name` });
```

On Neon/Turso-class drivers this is a single HTTP statement with a timeout (seconds, not
minutes). On a large table it (a) acquires row locks across the table, blocking concurrent
writers, and (b) is killed mid-statement when it exceeds the timeout — committing nothing or,
worse, leaving you unsure. There is no resume. Replace it with the loop below.

## Keyset (cursor) paging — never OFFSET

`OFFSET n` makes the database scan and discard `n` rows every batch (O(n²) over the run) and
silently skips/repeats rows when concurrent inserts shift offsets. Page by a stable, unique,
sortable key instead — UUIDv7 is ideal (time-sortable, non-enumerable; see CLAUDE.md IDs).

```ts
// Each batch: rows strictly after the cursor, still needing work, ordered by the key.
const batch = await db
  .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
  .from(users)
  .where(and(gt(users.id, cursor), isNull(users.fullName))) // keyset + idempotency guard
  .orderBy(asc(users.id))
  .limit(BATCH_SIZE);
```

For a composite cursor (e.g. `created_at` not unique), page on the tuple `(created_at, id)`:
`gt(orders.createdAt, c.ts) OR (eq(orders.createdAt, c.ts) AND gt(orders.id, c.id))`.

## Idempotency guard — pick one

Re-running from zero (or after a crash) MUST converge, not duplicate or clobber.

1. **`IS NULL` guard** — best when the target is a fresh nullable column: `WHERE target IS NULL`.
   A re-run skips already-filled rows for free.
2. **Marker column** — when the target can legitimately be null, or you transform an existing
   value: add `backfilled_at timestamptz` (or `recomputed_at`) and guard `WHERE backfilled_at IS NULL`,
   setting it in the same `UPDATE`. The marker is itself a `timestamptz` UTC value (Rule 6).
3. **Upsert** — when moving rows into a new table: `insert(...).onConflictDoNothing()` (or
   `onConflictDoUpdate` for a deterministic recompute) keyed on a natural/unique key.

Never a blind `SET` with no guard: a re-run would overwrite manual fixes and double-apply
non-idempotent transforms.

## One short transaction per batch

```ts
await db.transaction(async (tx) => {
  for (const row of batch) {
    await tx.update(users)
      .set({ fullName: `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() })
      .where(eq(users.id, row.id));
  }
});
```

Keep batches small (≈500–2000). A batch is the unit of lock-hold and of crash-loss — both
stay bounded. Where the transform is pure SQL, a single guarded `UPDATE ... WHERE id IN (ids)`
per batch is even better (one statement, still bounded).

## Checkpoint and resume

After each committed batch, persist the last cursor so a crash resumes instead of restarting.
A `_backfill_progress` table survives restarts and is visible in the DB:

```ts
await db.insert(backfillProgress)
  .values({ job: JOB, cursor: lastId, updatedAt: new Date() })
  .onConflictDoUpdate({ target: backfillProgress.job, set: { cursor: lastId, updatedAt: new Date() } });
```

On startup, read the checkpoint and seed `cursor` from it (falling back to the minimum id).
Because the run is idempotent, a checkpoint that is slightly stale only re-does one safe batch.

## Throttle between batches

A short sleep caps lock contention and lets read replicas catch up:

```ts
await new Promise((r) => setTimeout(r, SLEEP_MS)); // e.g. 25–100ms
```

## Runnable skeleton (standalone Node job, off the edge)

```ts
// scripts/backfill-full-name.ts — run with `tsx`/`node`, NOT from an edge route.
import { z } from "zod";
import { and, asc, gt, isNull } from "drizzle-orm";
import { db } from "@/db";              // the same Drizzle client, used outside a request
import { users, backfillProgress } from "@/db/schema";

const Env = z.object({                  // Rule 8: validate args/env before use
  BATCH_SIZE: z.coerce.number().int().positive().max(5000).default(1000),
  SLEEP_MS: z.coerce.number().int().nonnegative().default(50),
});
const { BATCH_SIZE, SLEEP_MS } = Env.parse(process.env);
const JOB = "users.full_name";

async function main() {
  const saved = await db.query.backfillProgress.findFirst({ where: (p, { eq }) => eq(p.job, JOB) });
  let cursor = saved?.cursor ?? "00000000-0000-0000-0000-000000000000";
  let total = 0;

  for (;;) {
    const batch = await db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(and(gt(users.id, cursor), isNull(users.fullName)))
      .orderBy(asc(users.id))
      .limit(BATCH_SIZE);

    if (batch.length === 0) break;      // remaining count hit zero — done

    await db.transaction(async (tx) => {
      for (const r of batch) {
        await tx.update(users)
          .set({ fullName: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() })
          .where(eq(users.id, r.id));
      }
    });

    cursor = batch[batch.length - 1]!.id;
    total += batch.length;
    await db.insert(backfillProgress)
      .values({ job: JOB, cursor, updatedAt: new Date() })
      .onConflictDoUpdate({ target: backfillProgress.job, set: { cursor, updatedAt: new Date() } });

    console.log(JSON.stringify({ job: JOB, lastCursor: cursor, batch: batch.length, total }));
    await new Promise((res) => setTimeout(res, SLEEP_MS));
  }
  console.log(JSON.stringify({ job: JOB, status: "complete", total }));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

Notes: the result types flow from Drizzle inference — no `any`, no cast (Rule 1). The log line
is structured and carries no row bodies or PII (CLAUDE.md log discipline). Money transforms
write integers (Rule 5); time fields are `Date` → `timestamptz` UTC (Rule 6).

## Recompute that reads related rows (no N+1)

When the transform aggregates children (e.g. order totals from line items), read all the
batch's children in ONE query, not one per parent (Rule 7):

```ts
const ids = batch.map((o) => o.id);
const totals = await db
  .select({ orderId: lineItems.orderId, totalCents: sum(lineItems.priceCents).mapWith(Number) })
  .from(lineItems)
  .where(inArray(lineItems.orderId, ids))
  .groupBy(lineItems.orderId);
```

Then map `totals` back onto the batch in memory and update. See `drizzle-relational-queries`
for the join/aggregate idioms.
