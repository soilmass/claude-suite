Purpose: the cause→fix decision table for a single slow query, the sargability rewrites, and the before/after measurement protocol that proves the fix.

# Cause → fix table

Classify the dominant plan node (see `explain-analyze.md`) into exactly one cause, then apply
the matching fix. Most "optimizations" fail because the cause was misdiagnosed and the fix
touches nothing the planner does.

| Cause (plan evidence) | Fix | Routes to |
| --- | --- | --- |
| Missing index — `Seq Scan` + high `Rows Removed by Filter`, selective predicate | Add an index on the filter/join/sort predicate | `index-strategy` (designs it), `migration-author` (ships it) |
| Non-sargable predicate — `Seq Scan` despite an index existing | Rewrite so the column is bare on one side; or add an expression/trigram index | rewrite below; `index-strategy` for the index |
| Row misestimate — estimate vs actual off 10x+ | `ANALYZE <table>` to refresh stats; re-plan before changing anything | — |
| Over-fetch — `width` large, `select *`, no `limit` pushed down | Project only needed columns; push `limit`/pagination into SQL | `pagination-cursor` if it's a list |
| Sort/limit — `Sort` spills to `Disk:` | Composite index whose trailing column matches `ORDER BY` direction | `index-strategy` |
| N+1 — `Nested Loop … loops=N` (N = parent rows) | Collapse to one relational query / join | `n1-hunter`, `drizzle-relational-queries` |

# Sargability rewrites

A predicate is **sargable** when the planner can use an index for it — which requires the
indexed column to appear bare (not wrapped in a function or cast) on one side of the operator.

| Non-sargable (forces seq scan) | Sargable rewrite |
| --- | --- |
| `where(sql\`lower(email) = \${e}\`)` | Store/compare a normalized column, or add an **expression index** `create index on users (lower(email))` |
| `like('%term%')` (leading wildcard) | Anchored prefix `like('term%')`, or a `pg_trgm` **GIN** index for true substring search |
| `where(sql\`created_at::date = \${d}\`)` (cast on column) | Range predicate `gte(createdAt, dayStart) and lt(createdAt, dayEnd)` — keeps the column bare |
| `or(...)` across different columns | Split into `union`-ed indexed queries, or a covering composite index |
| Implicit type cast (`text` column vs `number` param) | Match the param type to the column type so no cast is injected |

Drizzle note: prefer the typed helpers (`eq`, `gte`, `lt`, `inArray`) over `sql\`…\``
fragments — they keep the column bare and preserve the inferred result type (Rule 1). Reach
for `sql\`…\`` only for genuinely inexpressible predicates, and never `as`-cast the result to
make it compile.

# Before/after measurement protocol

A fix is not done until the plan diff proves it. "Looks faster" is not a result.

1. **Baseline.** Capture `EXPLAIN (ANALYZE, BUFFERS)` on prod-shaped data. Record: dominant
   node type, actual total time, shared block reads (buffers), and the estimate-vs-actual
   row gap.
2. **Apply one change.** One index, or one rewrite — not both at once, or you can't attribute
   the win.
3. **Re-capture the identical EXPLAIN.** Same query, same params, same branch.
4. **Prove the four deltas:**
   - node type changed in the intended direction (e.g. `Seq Scan` → `Index Scan`, or `Sort
     Disk:` gone);
   - actual time dropped materially;
   - buffer reads dropped (the real edge-cost win);
   - estimate now tracks actual (stats are sane).
5. **Confirm no regression of the rules.** The rewrite must keep the ownership predicate
   `eq(table.ownerId, ctx.auth.userId)` (Rule 2) and the inferred result type (Rule 1). A
   dropped `where` clause that "simplified" the query is a security defect, not a speedup.

# What is NOT this skill's job

- Deciding the index's column order, partiality, or covering `include` → `index-strategy`.
- Finding the loop in application code behind a `loops=N` plan → `n1-hunter`.
- Restructuring the access pattern across files → `refactor`.
- Adding the index safely across deploys → `migration-author`.

Record any non-obvious call (e.g. choosing a trigram GIN index over an expression b-tree, or
accepting a bitmap scan as good enough) in `DECISIONS.md` with the plan numbers that justify
it.
