Purpose: how to capture and read a query plan in the edge stack (Drizzle + Neon Postgres or Turso/libSQL), and the hazards specific to running EXPLAIN ANALYZE.

# Capturing the plan

## 1. Get the exact SQL Drizzle emits

Never re-type the query by hand — read the parameterized SQL Drizzle actually sends, so the
plan matches what runs in production:

```ts
const q = db
  .select()
  .from(invoices)
  .where(eq(invoices.ownerId, ownerId))
  .orderBy(desc(invoices.createdAt))
  .limit(50);

const { sql, params } = q.toSQL();
// sql:    select ... from "invoices" where "owner_id" = $1 order by "created_at" desc limit $2
// params: [ownerId, 50]
```

`relational` queries (`db.query.invoices.findMany({...})`) also expose `.toSQL()`. For a
multi-statement relational fetch Drizzle may emit more than one SQL string — EXPLAIN each.

## 2. Run EXPLAIN against the real query (Postgres / Neon)

```ts
import { sql } from "drizzle-orm";

// Substitute the params yourself for a faithful plan, or use a prepared statement.
const plan = await db.execute(
  sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${q}`
);
```

- `ANALYZE` = run the statement and report **actual** rows/time (not just estimates).
- `BUFFERS` = report shared/temp block reads — the truest cost signal at the edge, where each
  block read off the serverless store is latency you pay for.
- `FORMAT JSON` = machine-readable; `FORMAT TEXT` (default) is easier to eyeball.

## 3. libSQL / Turso (SQLite) — no ANALYZE cost model

SQLite has no `EXPLAIN ANALYZE` with buffers. Use:

```sql
EXPLAIN QUERY PLAN <statement>;
```

Read it for:
- `SCAN TABLE invoices` — full table scan (bad on a large table).
- `SEARCH invoices USING INDEX invoices_owner_id_idx (owner_id=?)` — index used (good).
- `USE TEMP B-TREE FOR ORDER BY` — sort not covered by an index (fixable with a matching
  index order).

# The ANALYZE hazard (read before running)

`EXPLAIN ANALYZE` **executes the statement**. On a `SELECT` that's harmless. On an
`INSERT`/`UPDATE`/`DELETE` it mutates data. Two safe options:

```ts
// Option A: plain EXPLAIN — estimates only, never executes.
await db.execute(sql`EXPLAIN ${mutation}`);

// Option B: ANALYZE inside a transaction you roll back.
await db.transaction(async (tx) => {
  const p = await tx.execute(sql`EXPLAIN (ANALYZE, BUFFERS) ${mutation}`);
  // inspect p ...
  throw new RollbackError(); // force rollback; real rows untouched
});
```

Never run `EXPLAIN ANALYZE` on a write against a shared branch without a rollback.

# Reading a Postgres plan

Read **top-down to find the structure, then bottom-up for where time accrues**. Each node
prints `(cost=… rows=… width=…) (actual time=… rows=… loops=…)`.

| Node | What it means | When it's the problem |
| --- | --- | --- |
| `Seq Scan` | Reads every row of the table | Large table + selective predicate → wants an index. Check `Rows Removed by Filter`. |
| `Index Scan` | Walks a b-tree, fetches matching heap rows | Usually good; if it still reads many rows, predicate isn't selective. |
| `Index Only Scan` | Answered from the index alone (covering) | Best case — no heap fetch. |
| `Bitmap Heap Scan` | Index → bitmap → batched heap reads | Fine for medium selectivity; many lossy reads = borderline. |
| `Nested Loop` | Inner side run once per outer row | `loops=N` with N = parent rows is the **plan signature of N+1** → `n1-hunter`. |
| `Hash Join` / `Merge Join` | Set-based joins | Usually healthy for large joins. |
| `Sort` | Orders rows | `Sort Method: external merge Disk: …kB` = spilled to disk → add an index matching `ORDER BY`, or raise `work_mem`. |

## The four tells that name the cause

1. **`Seq Scan` + high `Rows Removed by Filter`** → missing or unusable index on that
   predicate. Hand the predicate to `index-strategy`.
2. **Estimated `rows` vs actual `rows` off by 10x+** → stale planner statistics. Run
   `ANALYZE <table>;` and re-plan before adding any index — the planner may already have the
   right index and just mis-costed it.
3. **`Sort` with `Disk:`** → the order-by isn't index-backed; a composite index ending in the
   sort column eliminates the sort entirely.
4. **`Nested Loop … loops=N`** where N tracks parent-row count → an N+1, not a single slow
   query. Stop here and switch to `n1-hunter` + `drizzle-relational-queries`.

# Why plan, not seed

On a 50-row dev seed every plan is a `Seq Scan` — reading the whole tiny table is genuinely
cheapest, so an index you add is invisible and an index you're missing costs nothing. The
planner's choices only become production-faithful at production row counts. Always capture
the plan on a prod-sized branch/replica before concluding anything.
