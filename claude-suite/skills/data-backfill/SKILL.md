---
name: data-backfill
description: >
  Run a large data backfill safely on the edge stack: keyset-batched, idempotent,
  resumable, and online — so populating a new column or mass-transforming a table never
  takes a long table lock, never times out the serverless HTTP driver mid-statement, and
  can resume from a crash instead of restarting. Covers the keyset (cursor) batch loop,
  IS-NULL / marker idempotency guards, checkpointing, throttling, and running the job as a
  standalone Node process off the edge.
  Use when: "backfill", "migrate data", "populate a new column", "mass update".
  Do NOT use for: the schema DDL that adds/alters the column (use migration-author), or
  ordering the expand/backfill/switch/contract deploys (use migration-deploy-coordination).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the unsafe-backfill failure class: one unbounded UPDATE
    that locks the table and times out the HTTP driver, run non-idempotently inside an edge
    request with OFFSET paging. Baseline observed (clean-room capture).
---

# data-backfill

The build-loop skill for moving or transforming data across a large existing table. Given
"populate the new `full_name` column" or "recompute totals for every historical order," it
produces a batched, idempotent, resumable Node job — never a single table-wide `UPDATE`
fired from an edge request. It is the data-migration step that lives between
`migration-author`'s expand and `migration-deploy-coordination`'s switch.

The spine and the nine inviolable rules live in `../../CLAUDE.md`. This skill does not
restate them; it obeys Rule 1 (type chain), Rule 5 (money as integer minor units), Rule 6
(timestamptz UTC), Rule 7 (no N+1 in batch reads), and Rule 8 (validated boundaries on
args/env).

---

## Non-Negotiable Rules

An unsafe backfill compiles, passes on a 50-row dev seed, then melts production:

- **Never run a single unbounded `UPDATE`/`DELETE` over the whole table.** It holds a long
  lock and exceeds the HTTP driver's statement timeout, leaving partial state. Process in
  bounded batches, a short transaction each.
- **Never run a backfill inside an edge request or tRPC procedure.** Edge functions have
  wall/CPU limits; a long loop dies mid-run. Run it as a standalone Node job against the DB.
- **Never write a non-idempotent backfill.** Re-running from zero or from a crash must
  converge — guard every write (`WHERE target IS NULL`, a marker column, or an upsert),
  never a blind overwrite.
- **Never page with `OFFSET`.** It rescans skipped rows and races concurrent inserts; page
  by keyset on a stable sortable key.

Refuse these rationalizations: "it's only a few rows, one UPDATE is fine"; "I'll just run
it once in a tRPC mutation"; "OFFSET is simpler"; "re-running would double it but I won't."

---

## When to Use

- Populate a newly added (nullable) column across existing rows.
- Mass-update or transform a column's values across a large table.
- Move data into a new table/shape as the data step of an expand-contract migration.
- Recompute a derived or denormalized value over historical rows.

## When NOT to Use

- The DDL itself — add/rename/drop a column, change a type → `migration-author`.
- Ordering the expand → backfill → switch-reads → contract deploys →
  `migration-deploy-coordination`.
- Seeding fresh data into an empty/dev database → `drizzle-seed`.
- A one-off read reshape with no write → `drizzle-relational-queries`.

---

## Procedure

1. **Confirm it is a backfill, not DDL (low).** The nullable column or new table this
   populates is `migration-author`'s expand step; this only writes data into it — never
   bundle the `ALTER` and the data `UPDATE`. See `references/safety-checklist.md`.

2. **Pick the keyset cursor (medium).** A stable, unique, sortable column to page on —
   UUIDv7 or `(created_at, id)`. If the table has none, add one via `migration-author` first.
   No `OFFSET`. Record a non-obvious choice in `DECISIONS.md`. See `references/backfill-patterns.md`.

3. **Make every batch idempotent (high).** Guard the write so a re-run is a no-op:
   `WHERE target IS NULL`, a `backfilled_at` marker, or an upsert. A crash restarted from
   zero must converge — the most expensive thing to get wrong. See `references/backfill-patterns.md`.

4. **Bound and throttle each batch (high).** Small batch (≈500–2000 rows), one short
   transaction each, a brief sleep between to cap lock contention and replica lag. Never one
   long transaction over the whole table. See `references/backfill-patterns.md`.

5. **Checkpoint for resume (medium).** Persist the last committed cursor (a file or a
   `_backfill_progress` row) after each batch so a crash resumes, not restarts. See
   `references/backfill-patterns.md`.

6. **Run it off the edge as a Node job (high).** A standalone script against the DB driver,
   not an edge route. Keep types inferred from Drizzle (Rule 1), Zod-parse args/env (Rule 8),
   money integer minor units (Rule 5), timestamps UTC `timestamptz` (Rule 6) in the
   transform. See `references/safety-checklist.md`.

7. **Dry-run, count, monitor (medium).** Count remaining (unguarded) rows before and after;
   log structured, sampled per-batch progress (no row bodies / PII); verify the count reaches
   zero. See `references/safety-checklist.md`.

8. **Hand back to deploy coordination (low).** Once verified complete, `migration-deploy-coordination`
   sequences the read switch and the contract (drop-old) in later deploys.

---

## Composes With

- **Consumes:** `migration-author` — the expand migration (nullable column or new table)
  this backfill fills; the cursor key, if missing, is added there.
- **Pairs with:** `migration-deploy-coordination` — it sequences expand → backfill →
  switch-reads → contract across separate deploys; this skill owns only the data step.
- **Pairs with:** `drizzle-relational-queries` — the per-batch read (and any recompute that
  joins related rows) uses keyset reads and joins, never an N+1 loop (Rule 7).
- **Hands off:** a verified-complete backfill → `migration-deploy-coordination` for the
  switch and contract.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked to add a NOT NULL `status` column to `orders` and backfill 5M
existing rows, the agent emitted a single drizzle migration that does the DDL and a
table-wide `UPDATE` inline — one unbounded statement over all 5M rows, no batching, no
checkpoint, and folded into the schema migration rather than run as a separate gated data
job. The backfill is also dead work: the column default already populates every row at
`ADD COLUMN` time, so the `WHERE` matches nothing and the real intent is never implemented.

```sql
ALTER TABLE "orders"
  ADD COLUMN "status" varchar(20) NOT NULL DEFAULT 'pending';

UPDATE "orders"
SET "status" = 'pending'
WHERE "status" IS NULL OR "status" = '';
```

**Failure class (confirmed).** A single unbounded `UPDATE` over a large table blows past the
serverless HTTP driver's statement timeout and commits partial, unknown state, with no
batching, idempotency guard, or checkpoint to resume from. Bundling the long DML into the
DDL migration instead of a separate, batched, resumable Node job off the edge is exactly the
unsafe-backfill pattern this skill prevents.

---

## Examples

**Input:** "Backfill `full_name` from `first_name`/`last_name` on `users` (2M rows)."
**Output:** A Node job paging by keyset on `id` (UUIDv7), batch 1000:
`UPDATE users SET full_name = first_name || ' ' || last_name WHERE id > $cursor AND full_name IS NULL ORDER BY id LIMIT 1000`,
committed per batch, cursor checkpointed, 50ms sleep, looping until a batch returns 0 rows.
Idempotent (`IS NULL`), resumable (checkpoint), online (bounded + throttled).

**Input:** "We added `price_cents`; legacy rows store price as a float-dollars string."
**Output:** A keyset-batched job that Zod-parses each legacy value (Rule 8), writes
`Math.round(parseFloat(raw) * 100)` as an integer (Rule 5), guarded `WHERE price_cents IS NULL`.
The float is never persisted; failed parses are logged and skipped, not coerced to `NaN`.

**Input:** "Recompute denormalized `total_cents` for every historical order."
**Output:** A keyset loop over `orders`; each batch reads its line items in one
join/aggregate (`sum(...)`, Rule 7 — not a query per order), writes `total_cents` as an
integer (Rule 5), tracks done rows via a `recomputed_at` marker, checkpoints, runs as a
Node job.

---

## Edge Cases

- **The target value can't be `IS NULL`-guarded** (legit nulls, or a transform of an
  existing value) → add a `backfilled_at`/`recomputed_at` marker column or a progress table
  to record done rows; don't infer doneness from the value itself.
- **Rows are inserted concurrently during the backfill** → keyset naturally covers rows
  above the cursor; ensure the expand migration gives brand-new rows a default or trigger so
  the backfill only owns the historical tail.
- **The table has no stable sortable key** → add one (UUIDv7 or `created_at`) via
  `migration-author` before backfilling; do not fall back to `OFFSET`.
- **The transform touches money or time** → integer minor units (Rule 5) and UTC
  `timestamptz` (Rule 6) inside the batch; never widen to float or store local time.

## References

- `references/backfill-patterns.md` — the keyset batch loop, idempotency guards
  (`IS NULL` / marker column / upsert), checkpoint-and-resume, throttling, and a runnable
  Drizzle + Node script skeleton.
- `references/safety-checklist.md` — pre-flight: lock/transaction sizing, edge-vs-Node
  execution, dry-run counts, structured-log discipline, rollback, and validated inputs.

## Scripts

`scripts/` is reserved. A signal that would justify one: a parameterized backfill-runner
harness (generic keyset loop + checkpoint table + throttle) reused across many backfills —
at that point, promote the skeleton from `references/backfill-patterns.md` into `scripts/`.
