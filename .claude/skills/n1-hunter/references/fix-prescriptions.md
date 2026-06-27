Purpose: map each N+1 shape to its single-round-trip fix, rank findings by blast radius, and
route every prescription to `drizzle-relational-queries` without regressing Rule 1 or Rule 2.

# Severity rubric

```
severity ≈ rows_at_prod_scale × queries_per_iteration × hotness
```

- **rows_at_prod_scale** — what the parent query returns in production, not the dev seed.
  An unbounded user collection (orders, tasks, messages) is the danger; a bounded constant
  is not.
- **queries_per_iteration** — usually 1, but a loop that fetches two relations per row is 2N.
- **hotness** — list/feed/dashboard endpoint hit on every page load > a one-off admin action.

| Severity | Shape |
|----------|-------|
| Critical | Unbounded user collection, list/feed endpoint, 1+N or 2N queries |
| High | Unbounded collection on a less-hot path, or write-side N inserts |
| Medium | Bounded-but-growing collection, detail endpoint |
| Low / info | Loop over a fixed constant; optional single-query tidy-up |

# Why O(rows) is worse at the edge

Each Drizzle call over an HTTP serverless driver (Neon/Turso, per CLAUDE.md) is a network
round trip and, at the edge, a billed unit of work. N+1 turns one logical read into N+1
billed round trips: latency grows linearly and so does cost. `Promise.all` removes the
sequential latency but not the N round trips or the N billings. The only acceptable shape is
O(1) (a single query) or the O(2) batch fallback.

# Shape → fix mapping

**(a)/(b) parent + children loop → relational `with` (one query).**
```ts
// BEFORE (N+1): projects.map(p => db.query.tasks.findMany({ where: eq(tasks.projectId, p.id) }))
// AFTER:
const projects = await db.query.projects.findMany({
  where: eq(projects.ownerId, ctx.auth.userId),          // Rule 2: ownership at the root
  with: {
    tasks: {
      columns: { id: true, title: true, status: true },  // narrow payload
      orderBy: (t, { desc }) => desc(t.createdAt),
      limit: 50,                                          // bound the collection
    },
  },
});
```
Built by `drizzle-relational-queries`. Requires `relations()` to exist — if not, hand off to
`schema-design` first.

**Aggregate only (count/sum per parent, not the rows) → `leftJoin` + `groupBy`.**
```ts
db.select({
  id: orders.id,                                          // every non-aggregated column…
  createdAt: orders.createdAt,                            // …must also be in groupBy (Postgres)
  itemCount: count(lineItems.id),
  totalCents: sum(lineItems.priceCents),                  // Rule 5: integer minor units
}).from(orders)
  .leftJoin(lineItems, eq(lineItems.orderId, orders.id))  // left keeps zero-child parents
  .where(eq(orders.userId, ctx.auth.userId))
  .groupBy(orders.id, orders.createdAt);                  // list each selected non-aggregate
```

**Inexpressible by `with` or one join → `inArray` two-query batch (O(2), the only sanctioned
fallback).**
```ts
const parents = await db.query.projects.findMany({ where: eq(projects.ownerId, uid) });
const ids = parents.map((p) => p.id);
const children = await db.query.tasks.findMany({ where: inArray(tasks.projectId, ids) });
const byParent = Map.groupBy(children, (t) => t.projectId);          // group in memory
// two queries total — never one per id
```

**Write-side loop → batched values.**
```ts
// BEFORE: for (const m of members) await db.insert(audit).values({...})
await db.insert(audit).values(members.map((m) => ({ userId: m.id, action })));
```

# Two regressions to reject in any proposed fix

- **Fetch-all-then-filter-in-JS** (`db.query.tasks.findMany()` with no `where`, filtered by
  `projectId` in memory) removes the loop but returns every user's rows over the wire and
  leaks them — a Rule 2 ownership break. Require the root `where` scoped to
  `ctx.auth.userId`.
- **Casting the assembled shape** (`as ProjectWithTasks[]`) to make a hand-built object
  type-check breaks Rule 1. The relational query's nested return type is inferred; if it
  doesn't match, the `relations()` or the requested `with`/`columns` are wrong — fix those.

# Report shape

For each finding emit: `file:line` · shape family (a/b/c) · severity · row source ·
prescribed query · "apply via drizzle-relational-queries". If the same loop pattern recurs
across many call sites, bundle the list and hand it to `refactor`.
