Purpose: how to locate N+1 data access (Rule 7) in this stack — grep signatures, the three
shape families, read- vs write-side tells, and the false positives that look like N+1 but
aren't.

# Where to look

The N+1 lives wherever rows are fetched then iterated. In the decided stack that is:

- `src/server/api/routers/**` — tRPC procedures.
- The plain business-logic functions procedures call (CLAUDE.md: procedures are thin, logic
  lives in functions — the loop often hides one call deeper, not in the procedure itself).
- Server Components and route handlers (`app/**/page.tsx`, `app/**/route.ts`).
- Any `loader` / `getData` / `fetch*` helper that returns a list.
- Webhook handlers that process a batch of entities.

# Grep signatures (necessary, not sufficient — always read the hit)

```
# A Drizzle call inside a callback or loop body (loop marker and db call are usually on
# separate lines, so search with context — a single piped rg requiring both on one line
# misses almost every real hit):
rg -n "\.(map|forEach)\(|for \(|for await|while \(" -A 10 src/server | rg -n "db\.(query|select|insert|update|delete)|await db"

# Promise.all over rows that each query:
rg -n "Promise\.all\(" -A3 src | rg -n "db\.query|db\.select|await db"

# A helper invoked per row (hidden N+1 seed — find functions that query, then find them in maps):
rg -n "async function (get|find|load|fetch)\w+" src/server
```

Grep finds candidates. The judgment is whether the loop iterates **rows from a query**
(N+1) or a **fixed collection** (not N+1). Read each hit.

# The three shape families

**(a) Explicit per-row query.** A `db.*` call directly in the loop body.
```ts
for (const p of projects) {
  const tasks = await db.query.tasks.findMany({ where: eq(tasks.projectId, p.id) }); // N+1
}
// or the .map() form:
projects.map(async (p) => ({ ...p, tasks: await db.query.tasks.findMany(...) }));
```

**(b) `Promise.all(rows.map(async …))`.** Concurrent, so it *feels* fast on a tiny seed,
but it is still N round trips — at the edge, N billed invocations and N connection setups on
an HTTP driver (Neon/Turso). Concurrency is not a fix for cardinality.
```ts
await Promise.all(projects.map((p) =>
  db.query.tasks.findMany({ where: eq(tasks.projectId, p.id) }))); // still N+1
```

**(c) Hidden N+1 (helper / accessor / per-row function).** The loop body calls something
that *itself* queries — a `getCustomer(id)`, a formatter, a permission check, a lazy getter.
Grep over the loop file shows no `db.` call; the cost is one frame down. This is the family
the grep-only approach misses; trace each function called inside a row loop.
```ts
orders.map((o) => ({ ...o, customer: formatCustomer(o.customerId) }));
// formatCustomer → db.query.customers.findFirst(...)  ← the real N+1
```

# Read-side vs write-side

Rule 7 covers both. The write-side N+1 is a loop of `insert`/`update`/`delete`:
```ts
for (const m of members) await db.insert(audit).values({ ... }); // N inserts
```
Drizzle supports batched `insert().values([...])`; a per-row insert loop is the same defect.

# False positives — do NOT flag these as N+1

- **A loop over a fixed constant** (an enum, a known 4-element tab list, request-derived
  scalars). No row cardinality → no N+1. Informational at most.
- **`.map()` over already-fetched data with no `db.` and no querying helper** — pure
  in-memory transform. That is correct shaping, not access.
- **A single query inside an `if`, not a loop** — branching, not iteration.
- **Two purposeful queries** (one aggregate + one bounded fetch) — that is O(1), the
  sanctioned pattern, not O(rows).

# Confirming a real hit

For each true positive note: (1) the row source (which query feeds the loop), (2) whether
that source is bounded, (3) queries per iteration, (4) the endpoint's hotness. Those four
feed the severity rubric in `fix-prescriptions.md`.
