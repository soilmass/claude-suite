---
name: query-optimization
description: >
  Diagnose a single slow Drizzle/SQL query empirically: capture its real plan with
  EXPLAIN ANALYZE (Postgres/Neon) or EXPLAIN QUERY PLAN (libSQL/Turso), read the plan
  to find the cause — a sequential scan, a row misestimate, a sort spilling to disk, a
  missing index, or an N+1 hiding behind one endpoint — and prescribe the smallest fix
  that changes the plan. Measures before and after on production-shaped data, never guesses
  from the SQL text. The diagnostic counterpart to `index-strategy` (which decides the
  index) and `n1-hunter` (which finds loop queries in code).
  Use when: "slow query", "optimize this query", "explain analyze", "query is slow".
  Do NOT use for: finding N+1 in application code (use n1-hunter), choosing which index to
  add or its column order (use index-strategy), or sweeping schema changes (use refactor).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the failure class of "optimizing" a query by reading its
    SQL and adding an index by vibe, without ever capturing the plan or measuring on real
    data — so the change touches nothing the planner does. Baseline section is the encoded
    failure class; replace with an observed transcript.
---

# query-optimization

The empirical, single-query diagnosis skill. Given "this query is slow," it captures the
actual execution plan, reads it to name the true cost driver, prescribes the minimal change
that moves the plan, and re-measures to prove it. It diagnoses one query end to end;
`index-strategy` decides the index it may call for, and `n1-hunter` owns the in-code loop
hunt when the real problem is N queries, not one slow one.

The spine and the nine inviolable rules live in `../../CLAUDE.md`; this skill does not
restate them. It is most relevant to Rule 7 (N+1 vs. one scan) and works the edge
constraint: every plan node and every round trip is billed, so the goal is fewer buffers and
fewer trips, measured — not cleaner-looking SQL.

---

## When to Use

- A specific endpoint, procedure, or report is slow and you can point at the query.
- An `EXPLAIN ANALYZE` / `EXPLAIN QUERY PLAN` output needs interpretation.
- A query that was fast on the dev seed degrades on production-shaped data.
- You added an index and want to confirm the planner actually uses it.
- Latency or edge-cost budget regressed and you've isolated it to one query.

## When NOT to Use

- The problem is a query fired once per row in a loop → `n1-hunter` (finds it in code);
  this skill confirms the count from the plan but hands the code hunt over.
- You need to decide *which* index, its column order, or partial/covering shape →
  `index-strategy` (query-optimization tells you an index is needed and on what predicate;
  index-strategy designs it).
- The fix is a cross-file restructure of the access pattern → `refactor`.
- The relation/column you need doesn't exist yet → `schema-design`.
- You're enforcing the CI performance budget across the app → that's the deterministic
  perf gate, not this single-query tool.

---

## Procedure

1. **Reproduce on production-shaped data (high-interrogation).** A plan over a 50-row seed
   is meaningless — the planner picks a seq scan because the table is tiny, and so will it in
   prod with the opposite consequence. Confirm row counts, then run against a prod-sized
   branch/replica. Wrong here means optimizing a problem that doesn't exist. See
   `references/explain-analyze.md`.

2. **Capture the real plan, not the estimate.** Pull the exact parameterized SQL Drizzle
   emits with `query.toSQL()`, then run `EXPLAIN (ANALYZE, BUFFERS)` (Postgres/Neon) or
   `EXPLAIN QUERY PLAN` (libSQL/Turso). `ANALYZE` *executes* the statement — never run it on
   a mutation outside a rolled-back transaction. See `references/explain-analyze.md`.

3. **Read the plan top-down to the dominant node.** Find where actual time and buffers
   concentrate: a `Seq Scan` with high `Rows Removed by Filter`, an estimated-vs-actual row
   gap (stale stats / bad selectivity), a `Sort`/`Hash` spilling to disk, or a `Nested Loop`
   with `loops=N` (the plan-level signature of an N+1). See `references/explain-analyze.md`.

4. **Classify the cause before prescribing (medium-interrogation).** Map the dominant node
   to one of: missing/unusable index, non-sargable predicate, row misestimate, over-fetch,
   sort/limit shape, or N+1. The fix differs per class; a misdiagnosis adds an index the
   planner ignores. See `references/optimization-playbook.md`.

5. **Prescribe the smallest plan-changing fix.** Index need → hand the predicate to
   `index-strategy`. Non-sargable predicate (function on a column, leading wildcard, implicit
   cast) → rewrite to be index-usable. Over-fetch → project columns / push the `limit` into
   SQL. N+1 → hand to `n1-hunter`. Record any non-obvious choice in `DECISIONS.md`. See
   `references/optimization-playbook.md`.

6. **Re-measure and compare (high-interrogation on the claim).** Re-run the same
   `EXPLAIN (ANALYZE, BUFFERS)` after the change. Prove the node type changed (e.g. `Seq
   Scan` → `Index Scan`), actual time and buffers dropped, and the estimate now tracks
   reality. "Looks faster" is not a result; the plan diff is.

7. **Guard the type chain and ownership.** A rewrite must not break Rule 1 (no `as`-cast on
   the result to make a hand-written SQL shape compile) or Rule 2 (an ownership predicate
   `eq(table.ownerId, ctx.auth.userId)` dropped while "simplifying" the `where` is a security
   regression, not an optimization). Re-confirm both before closing.

---

## Composes With

- **Pairs with:** `index-strategy` — query-optimization proves from the plan that an index
  is needed and on which predicate; index-strategy designs the column order, partial, and
  covering shape. **Pairs with:** `n1-hunter` — when the plan shows `loops=N` or the slowness
  is N round trips, n1-hunter locates and rewrites the loop in code.
- **Hands off:** `refactor` when the fix restructures the access pattern across files;
  `schema-design` when the predicate needs a column/relation that doesn't exist;
  `migration-author` when adding the index requires a coordinated migration.
- **Runs against:** the perf budget — a query this skill speeds up should move the p75
  numbers the CI budget tracks.

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> This is the encoded failure class, not a captured transcript. Replace it after running the
> task without the skill and recording what the agent actually does.

**Failure class encoded:** Asked "this query is slow, optimize it," the agent reads the
Drizzle/SQL text and reasons about it abstractly. Specific defects that ship: (1) it adds an
index on a column the planner will never use because the predicate is non-sargable
(`where(sql\`lower(email) = \${e}\`)` with no expression index), and never runs EXPLAIN to
notice; (2) it "optimizes" against the dev seed where every plan is a seq scan, so the index
is invisible and it declares victory on no evidence; (3) it runs `EXPLAIN ANALYZE` on an
`UPDATE` to "test it" and silently mutates rows; (4) it reads only the top plan line and
misses that the cost is a `Sort` spilling to disk fixed by a matching index `ORDER BY`, not
the join it blamed; (5) while rewriting the `where` it drops the
`eq(t.ownerId, ctx.auth.userId)` predicate — faster, and a Rule 2 ownership leak. None are
measured before/after, so none are proven.

---

## Examples

**Input:** "`listInvoices` takes 1.8s in prod, fast locally." Plan shows
`Seq Scan on invoices (rows removed by filter: 240k)` under a `Sort`.
**Output:** Diagnosis: missing index on the filter+sort predicate `(owner_id, created_at)`;
the seq scan reads the whole table and the sort spills. Prescription: composite index
`(owner_id, created_at desc)` — handed to `index-strategy` for column order and to
`migration-author` to add it. Re-measured: `Index Scan` + no sort, 1.8s → 22ms, shared reads
down ~3 orders of magnitude. Ownership predicate confirmed intact (Rule 2).

**Input:** "`searchUsers` ignores the index I added on `email`." Predicate is
`where(sql\`lower(email) like \${q}\`)`.
**Output:** Plan confirms `Seq Scan` despite the index. Cause: non-sargable — `lower()` on
the column and a leading-wildcard `like` can't use a plain b-tree on `email`. Prescription:
expression index on `lower(email)` plus rewrite to anchored prefix, or a `pg_trgm` GIN index
for substring search — decision recorded in `DECISIONS.md`, index shape handed to
`index-strategy`.

**Input:** "`getProjectsDashboard` plan has a Nested Loop with `loops=312`."
**Output:** That's the plan-level fingerprint of an N+1 — 312 inner executions, one per
parent row. This isn't a one-query tune; hand off to `n1-hunter` to find the loop in the
router and `drizzle-relational-queries` to collapse it to a single `with`/join. Re-EXPLAIN
after: `loops=1`.

---

## Edge Cases

- **Plan is fast in isolation but the endpoint is slow** → it's not this query; suspect N+1
  (many fast queries) and switch to `n1-hunter`, or connection/cold-start at the edge.
- **Driver is libSQL/Turso (SQLite), not Postgres** → no `ANALYZE` cost/buffer detail; use
  `EXPLAIN QUERY PLAN` and read for `SCAN TABLE` (bad) vs `SEARCH ... USING INDEX` (good).
  See `references/explain-analyze.md`.
- **Estimated rows are wildly off actual** → the index may be fine; the planner has stale
  statistics. Run `ANALYZE <table>` first and re-plan before adding anything.
- **The query is a mutation** (`INSERT`/`UPDATE`/`DELETE`) → only run `EXPLAIN ANALYZE`
  inside a transaction you `ROLLBACK`, or use plain `EXPLAIN` to avoid changing data.

## References

- `references/explain-analyze.md` — how to capture the plan in this stack (Drizzle
  `toSQL()` → `db.execute(sql\`EXPLAIN ...\`)`), the Postgres vs. libSQL syntax, the
  `ANALYZE`-executes-the-statement hazard, and a node-by-node reading guide (Seq/Index/Bitmap
  scan, Nested Loop/Hash Join, Sort, the estimate-vs-actual and `loops=N` tells).
- `references/optimization-playbook.md` — the cause→fix table (missing index, non-sargable
  predicate, row misestimate, over-fetch, sort/limit, N+1), sargability rewrites, the
  before/after measurement protocol, and where each fix routes (`index-strategy`,
  `n1-hunter`, `migration-author`).

## Scripts

`scripts/` is reserved. The signal that would justify one: a helper that takes a built
Drizzle query, extracts `toSQL()`, wraps it in `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`
inside a rolled-back transaction, runs it against a configured branch, and prints the
dominant node by actual time — automating steps 2–3. It stays manual until the capture dance
is repeated often enough to be worth hardening against the mutation-safety footgun.
