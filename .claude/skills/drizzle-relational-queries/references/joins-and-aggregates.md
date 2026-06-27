Purpose: when the relational `with` API doesn't fit — explicit `leftJoin`/`innerJoin`, `groupBy` aggregates (count/sum), partial-column projections, and the `inArray` two-query batch pattern that replaces an N+1 loop. All stay O(1) in queries regardless of row count (Rule 7).

## 1. When to leave `db.query.*` for `db.select(...)`

Use an explicit join when you need any of:
- an **aggregate** (count, sum, avg) instead of the hydrated child rows,
- an **arbitrary join predicate** (not just FK = PK),
- a **cross-table partial projection** (pick columns from both sides into a flat row),
- `DISTINCT`, window functions, or set operations.

Otherwise prefer the relational API (`references/relational-queries.md`).

## 2. leftJoin vs innerJoin — pick deliberately

```ts
import { eq, count, sum } from "drizzle-orm";

// "each order with its line-item count and total" — DON'T hydrate items, aggregate them
const summary = await db
  .select({
    id: orders.id,
    placedAt: orders.placedAt,
    itemCount: count(lineItems.id),
    totalCents: sum(lineItems.priceCents),     // Rule 5: integer minor units, not float
  })
  .from(orders)
  .leftJoin(lineItems, eq(lineItems.orderId, orders.id)) // keeps zero-item orders
  .where(eq(orders.userId, ctx.auth.userId))             // Rule 2: ownership at the root
  .groupBy(orders.id);
```

- `leftJoin` — keeps parent rows with no matching child (count comes back 0/NULL).
- `innerJoin` — drops parents with no child. Choosing wrong silently changes the result
  set, so name the intent.
- Every column in `.select({...})` must appear in `groupBy` or be inside an aggregate.
- `sum()` returns `string | null` (numeric) — coerce/parse at the boundary, do not `as`.

## 3. Flat projection across tables

```ts
const rows = await db
  .select({
    taskId: tasks.id,
    title: tasks.title,
    projectName: projects.name,        // from the joined parent
  })
  .from(tasks)
  .innerJoin(projects, eq(tasks.projectId, projects.id))
  .where(eq(projects.ownerId, ctx.auth.userId));
```

Produces flat `{ taskId, title, projectName }[]`, fully inferred (Rule 1). Use this when
the component wants a denormalized row, not a nested object.

## 4. The `inArray` batch pattern — the only sanctioned "two query" fallback

When neither `with` nor a single join expresses the need (e.g. you already have parents in
hand from a prior call, or you need bespoke per-parent post-processing), batch the children
into ONE query with `inArray`, then group in memory. Two queries total — never per row.

```ts
import { inArray } from "drizzle-orm";

const parents = await db.query.projects.findMany({
  where: eq(projects.ownerId, ctx.auth.userId),
});
const parentIds = parents.map((p) => p.id);

// ONE query for ALL children, not one per parent
const children = parentIds.length
  ? await db.select().from(tasks).where(inArray(tasks.projectId, parentIds))
  : [];

// group in JS — O(n) memory work, still O(1) queries
const byParent = new Map<string, typeof children>();
for (const c of children) {
  const list = byParent.get(c.projectId) ?? [];
  list.push(c);
  byParent.set(c.projectId, list);
}
const result = parents.map((p) => ({ ...p, tasks: byParent.get(p.id) ?? [] }));
```

Guard the empty-id case: `inArray(col, [])` should be skipped (an empty IN is invalid /
always-false). The `parentIds.length ?` check above does this.

## 5. Cross-table existence filter (no fetch-then-filter)

"Projects that have at least one overdue task" — express it in SQL, not in JS:

```ts
import { and, eq, lt, exists } from "drizzle-orm";

await db.query.projects.findMany({
  where: and(
    eq(projects.ownerId, ctx.auth.userId),
    exists(
      db.select({ one: sql`1` })
        .from(tasks)
        .where(and(eq(tasks.projectId, projects.id), lt(tasks.dueAt, new Date()))),
    ),
  ),
});
```

## 6. Round-trip checklist (apply before declaring done)

- Count queries for a realistic row count: must be O(1), or exactly 2 for the batch
  pattern. Any number that scales with rows is an N+1 (Rule 7).
- No `await db.*` lexically inside `.map(`, `for`, `for…of`, or a querying
  `Promise.all(rows.map(...))`.
- Ownership filter (`ctx.auth.userId`) is at the root `where`, before any join expands the
  set (Rule 2).
- Result type is inferred — no `as`, no `any` (Rule 1).
- Money columns are integer minor units / decimal through the aggregate (Rule 5);
  timestamps stay `timestamptz`, formatted only at display (Rule 6).
