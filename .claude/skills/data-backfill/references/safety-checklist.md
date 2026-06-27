# Backfill safety checklist — pre-flight, execution, verification, rollback

Run this before, during, and after every backfill. Each item maps to a hard line in the
SKILL or an inviolable rule in `../../CLAUDE.md`.

## Where it fits in expand-contract

A backfill is the **data** step of an expand-contract migration, never a standalone event:

1. **Expand** (`migration-author`): add the new column as *nullable* (or the new table), with
   a default/trigger so brand-new rows are correct without the backfill.
2. **Backfill** (this skill): populate the historical tail, batched and idempotent.
3. **Switch reads** (`migration-deploy-coordination`): only after the backfill verifies
   complete, deploy code that reads the new column.
4. **Contract** (`migration-author` + coordination): in a later deploy, make non-nullable
   and/or drop the old column.

Doing the backfill before expand, or contracting before reads switch, breaks running code
mid-deploy. Sequencing is `migration-deploy-coordination`'s job — hand off to it.

## Pre-flight

- [ ] **It is data, not DDL.** No `ALTER`/`CREATE` in this job — those shipped in the expand
      migration via `migration-author`.
- [ ] **A keyset cursor exists.** A stable, unique, sortable key (UUIDv7 or `(created_at, id)`).
      If absent, add one via `migration-author` first. No `OFFSET`.
- [ ] **An idempotency guard is chosen.** `IS NULL`, a `backfilled_at`/`recomputed_at` marker,
      or an upsert. Re-running from zero must converge.
- [ ] **A checkpoint store exists.** A `_backfill_progress` row or a file; resume seeds from it.
- [ ] **Batch size and sleep are set** (≈500–2000 rows; 25–100ms). One short transaction per
      batch — never one transaction over the whole table.
- [ ] **Inputs are Zod-parsed** (Rule 8): batch size, sleep, any date/id range from env/args.
- [ ] **Transforms respect data rules:** money → integer minor units (Rule 5); time → UTC
      `timestamptz` (Rule 6); result types inferred from Drizzle, no `any`/cast (Rule 1).

## Execution environment

- [ ] **Runs as a standalone Node process**, not an edge route or tRPC procedure. Edge
      functions have wall/CPU limits a long loop will hit; the job runs against the DB driver
      directly (`tsx scripts/backfill-*.ts`, a queue worker, or a coordinated migration run).
- [ ] **Uses the serverless/HTTP driver's per-statement limits as the batch ceiling.** A batch
      must comfortably finish inside one statement/transaction timeout.
- [ ] **No long-lived connection assumptions.** Each batch is its own short transaction; the
      driver may reconnect between them.

## Dry-run and verification

- [ ] **Count remaining rows before starting:** `SELECT count(*) WHERE <guard>` (e.g.
      `full_name IS NULL`). This is the work-to-do number.
- [ ] **Spot-check the transform on a handful of rows** (a `LIMIT 5` read + computed value)
      before committing any write.
- [ ] **Watch the remaining count fall to zero.** Done is `count == 0` under the guard, not
      "the script finished" — a crashed run can finish with rows left.
- [ ] **Re-run once after completion.** An idempotent backfill's second run processes 0 rows;
      if it processes more, the guard is wrong.

## Observability and cost (per CLAUDE.md)

- [ ] **Structured, leveled, sampled logs** — one JSON line per batch with `{ job, cursor,
      batch, total }`. Never log row bodies or PII; indiscriminate logging is the top edge
      cost driver.
- [ ] **Progress is externally observable** via the checkpoint row, so the run can be watched
      without reading logs.

## Rollback

- [ ] **The backfill is forward-only and reversible by design:** because it only fills a
      nullable column (or marker), aborting mid-run leaves a valid partial state — running
      code still reads the old column until the read switch.
- [ ] **A wrong transform is corrected, not "undone":** fix the logic, clear the marker (or
      the column) for affected rows, and re-run — the idempotent guard makes this safe.
- [ ] **The destructive contract (drop old column) is a separate, gated deploy** owned by
      `migration-author` + `migration-deploy-coordination`, never bundled into the backfill.
