Purpose: the centralized deletion predicate, a read-site checklist so no read leaks deleted rows, and cascade + hard-purge guidance.

# One predicate, applied everywhere

Define the deletion filter once and AND it into every read alongside the ownership/tenant
predicate (Rule 2, and `multitenancy-scoping`). A scattered, hand-written `isNull` at each
site is exactly what gets forgotten.

```ts
// src/server/services/scoping.ts
import { isNull, isNotNull, and, eq, type AnyColumn } from "drizzle-orm";

// Live rows only. Pass the table (or its alias for joins).
export const notDeleted = (t: { deletedAt: AnyColumn }) => isNull(t.deletedAt);
export const onlyDeleted = (t: { deletedAt: AnyColumn }) => isNotNull(t.deletedAt);

// Compose owner + live in one place so the two predicates never drift apart.
export const liveOwned = (t: { deletedAt: AnyColumn; ownerId: AnyColumn }, ownerId: string) =>
  and(eq(t.ownerId, ownerId), notDeleted(t));
```

# Read-site checklist — every one of these is a read

A soft delete is only correct when ALL of these carry the predicate. Walk the list per
entity; the leak is always the one you skip.

- [ ] **List query** — `findMany`/`select` for the normal listing → `and(owner, notDeleted)`.
- [ ] **Detail query** — `findFirst`/`findById` → include `notDeleted` (a deleted row should
      404 on the normal route, not render).
- [ ] **Counts & aggregates** — `count()`, `sum()`, `avg()` → predicate in the same `where`;
      a dashboard tally that includes deleted rows is the classic miss.
- [ ] **Joins** — when the soft-deleted table is the JOINED side, the predicate goes in the
      join condition or `where`, not just on the root. `leftJoin` especially: filtering only
      the parent leaves orphaned deleted children visible.
- [ ] **Relational `with`** — Drizzle relational queries take a per-relation `where`; add
      `notDeleted` there too, or the nested set resurfaces deleted children.
- [ ] **Search / autocomplete / export** — secondary reads forget the predicate most often.
- [ ] **Uniqueness checks** — "is this name taken?" must check LIVE rows only (see restore).

Intentional exceptions (trash view, admin/audit, restore lookup) flip to `onlyDeleted` or
omit the predicate *explicitly* — the intent is visible in the query, never an accident.

```ts
// Join example: scope BOTH sides. Deleted tasks of a live project must not show.
db.select({ project: projects, task: tasks })
  .from(projects)
  .leftJoin(tasks, and(eq(tasks.projectId, projects.id), notDeleted(tasks)))
  .where(liveOwned(projects, ctx.auth.userId));

// Relational `with` example: per-relation where.
db.query.projects.findMany({
  where: liveOwned(projects, ctx.auth.userId),
  with: { tasks: { where: notDeleted(tasks) } },   // children scoped too
});
```

# Cascade: decide per relation, record it

When a parent is soft-deleted, choose ONE policy per child relation and record it in
`DECISIONS.md`:

- **Soft-cascade** — set `deletedAt` on children in the same mutation. Do it as ONE bulk
  update, never a loop (Rule 7):
  ```ts
  await db.update(tasks).set({ deletedAt: now })
    .where(and(eq(tasks.projectId, id), isNull(tasks.deletedAt)));
  ```
- **Hide-via-parent** — leave children untouched; their reads always join through the parent
  and inherit its `notDeleted` filter. Cheaper writes, but every child read MUST go through
  the parent or it leaks.
- **Independent** — children outlive the parent (e.g. invoices referencing a deleted
  customer). The FK still resolves because the row physically exists.

# Hard purge / retention — the only place `db.delete()` lives

Soft delete is not "delete forever." Define a separate, deliberate job — never the user path —
to physically remove rows past a retention window, and gate it like any destructive op
(`migration-author` discipline, manual gate in CI).

```ts
// scripts/purge — run on a schedule, not from a request handler.
await db.delete(projects)
  .where(and(isNotNull(projects.deletedAt), lt(projects.deletedAt, cutoffUtc)));
```

Keep the retention window and the job's existence in `DECISIONS.md`. Log a count, not row
bodies (CLAUDE.md log discipline).
