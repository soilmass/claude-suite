Purpose: the concrete Drizzle patterns for tenant isolation — the `org_id` column convention, a scoped query helper, read/write predicates, join hazards, the global/admin exemption, and the two-tenant isolation test.

# Scoping patterns

## The `org_id` column (owned by `schema-design`)

Every tenant-owned table carries an indexed, FK-constrained `org_id`. snake_case per the
schema conventions in `../../CLAUDE.md`.

```ts
// src/db/schema/projects.ts
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(), // UUIDv7 for public-facing ids
    orgId: text("org_id").notNull(), // Clerk org id (e.g. "org_2ab...") or FK to orgs.id
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("projects_org_id_idx").on(t.orgId), // every query filters on it (Rule 7-adjacent)
  }),
);
```

If `org_id` is missing on a tenant table, add it via `schema-design` + `migration-author`.
Never simulate scoping in app code over an unscoped table.

## Scoped query helper — make the predicate hard to forget

Feature code that retypes `eq(table.orgId, ctx.orgId)` by hand will eventually skip it. Give
it a composable helper so scoping is the path of least resistance.

```ts
// src/server/db/scope.ts
import { and, eq, type SQL } from "drizzle-orm";

/** AND the caller's org predicate with any extra conditions. */
export function withOrg<T extends { orgId: AnyPgColumn }>(
  table: T,
  orgId: string,
  ...extra: (SQL | undefined)[]
): SQL {
  return and(eq(table.orgId, orgId), ...extra)!;
}
```

Usage keeps the predicate present at every call site:

```ts
// read
const rows = await db
  .select()
  .from(projects)
  .where(withOrg(projects, ctx.orgId, eq(projects.status, "active")));

// relational read — org predicate at the root
const rows = await db.query.projects.findMany({
  where: withOrg(projects, ctx.orgId),
  with: { tasks: { limit: 50 } },
});
```

## Writes: both predicates, always

A write keyed by `id` alone lets a caller mutate another tenant's row by guessing the id.
Constrain id AND org:

```ts
const [updated] = await db
  .update(projects)
  .set({ name: input.name, updatedAt: new Date() })
  .where(withOrg(projects, ctx.orgId, eq(projects.id, input.id)))
  .returning();

if (!updated) {
  // Zero rows: either it doesn't exist or it's in another org. Do NOT distinguish —
  // a different message leaks existence across tenants.
  throw new TRPCError({ code: "NOT_FOUND" });
}
```

Same for delete (or set `deleted_at` for soft delete):
`db.delete(projects).where(withOrg(projects, ctx.orgId, eq(projects.id, input.id)))`.

## Join and relation hazards

Scoping the parent does NOT scope a joined child. Two safe shapes:

1. **Relation through a scoped parent FK.** With `db.query.parent.findMany({ where: org,
   with: { child } })`, children are reachable only via the parent's FK, which is already
   org-constrained — safe, provided the FK genuinely cannot point across orgs.

2. **Explicit join — constrain both sides.** When joining manually, add the child predicate
   too if the child carries `org_id`:

   ```ts
   db.select({ ...cols })
     .from(invoices)
     .leftJoin(lineItems, eq(lineItems.invoiceId, invoices.id))
     .where(
       and(
         eq(invoices.orgId, ctx.orgId),
         eq(lineItems.orgId, ctx.orgId), // defense in depth — closes the relation leak
       ),
     );
   ```

The tell of a leak: a join or `with` whose target table has an `org_id` that never appears in
a predicate.

## Global / admin exemptions — make them explicit

An un-scoped query must be a recognizable, intentional exception:

- **Global reference tables** (currencies, plan catalog): no `org_id` by design. Mark the
  table and any query with a comment so reviewers and `rule-audit` read the missing predicate
  as intentional. Record in `DECISIONS.md`.
- **Super-admin / back-office** spanning tenants: route through a separate `adminProcedure`
  with its own role gate (see `tenant-context.md`). Never relax the predicate on the normal
  org path.

## Two-tenant isolation test (not a one-tenant smoke test)

Single-tenant dev data hides the entire failure class. Seed two orgs and assert the boundary
on every endpoint:

```ts
test("org A cannot read or mutate org B's project", async () => {
  const a = await callerFor({ orgId: "org_A" });
  const b = await callerFor({ orgId: "org_B" });
  const bProject = await b.projects.create({ name: "B-only" });

  // read isolation
  const aList = await a.projects.list();
  expect(aList.find((p) => p.id === bProject.id)).toBeUndefined();

  // write isolation — must reject, not silently no-op-then-200
  await expect(a.projects.rename({ id: bProject.id, name: "hijack" })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
```

Run this as part of the `security-pass` review for any tenant feature.
