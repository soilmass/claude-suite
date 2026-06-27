Purpose: the Drizzle column + index DDL, ownership-checked delete/restore mutations, and the unique-after-delete strategy for soft-deleted entities.

# The column (Rule 6 — timestamptz, UTC)

`deleted_at` is nullable with NO column default. NULL = live, a timestamp = deleted at that
instant. The timestamp is written by the delete mutation, never as a schema default.

```ts
// src/db/schema/projects.ts
import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),            // Clerk ctx.auth.userId
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Rule 6: timestamptz, UTC. Nullable, no default. NULL means "not deleted".
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    // Partial unique: a deleted row must not block re-creating the same name.
    nameUniqLive: uniqueIndex("projects_owner_name_live_uniq")
      .on(t.ownerId, t.name)
      .where(sql`${t.deletedAt} is null`),
    // Partial index for the common "live list for this owner" read.
    ownerLiveIdx: index("projects_owner_live_idx")
      .on(t.ownerId)
      .where(sql`${t.deletedAt} is null`),
  }),
);
```

On a table that already exists in production, adding the column + swapping a plain unique for
the partial unique is a migration — hand to `migration-author` (additive column is reversible;
dropping the old unique and adding the partial one is the destructive half — expand-contract).

# The unique-after-delete strategy

A plain `unique(owner_id, name)` makes restore and re-create fail: the trashed row still
occupies the name. Two sanctioned fixes:

1. **Partial unique `WHERE deleted_at IS NULL`** (preferred — shown above). Only live rows
   contend for the name; any number of deleted rows may share it.
2. **Include `deleted_at` in the key** — works on engines without partial indexes, but NULLs
   are not equal in a unique index, so multiple live NULLs still collide; prefer option 1 on
   Postgres/Neon.

Record the choice in `DECISIONS.md` (entity, which strategy, why).

# Delete = an ownership-checked, idempotent update (Rule 2)

Never `db.delete()` on the user path. Guard ownership, then set the timestamp. Re-deleting an
already-deleted row is a no-op.

```ts
// src/server/api/routers/projects.ts (procedure stays thin; logic in a function)
delete: protectedProcedure
  .input(z.object({ id: z.string().uuid() }))          // Rule 8: validated boundary
  .mutation(async ({ ctx, input }) => {
    return softDeleteProject(ctx.db, input.id, ctx.auth.userId);
  }),
```

```ts
// src/server/services/projects.ts
import { and, eq, isNull } from "drizzle-orm";

export async function softDeleteProject(db: DB, id: string, ownerId: string) {
  // Ownership rides the WHERE; if the row isn't theirs (or already gone) nothing updates.
  const [row] = await db
    .update(projects)
    .set({ deletedAt: new Date(), updatedAt: new Date() })  // Date() -> UTC timestamptz
    .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)))  // Rule 2
    .returning();
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });   // not theirs OR doesn't exist
  return row;                                              // inferred type — no cast (Rule 1)
}
```

Idempotency: the `where` does not require `isNull(deletedAt)`, so re-deleting just rewrites
the same timestamp. If you must preserve the original delete instant, add
`isNull(projects.deletedAt)` to the `where` and treat zero rows as an already-deleted no-op.

# Restore = a first-class authorized mutation (Rule 2)

Restore is a write: same ownership check as delete, plus a uniqueness re-check because the
name may have been taken by a live row while this one was trashed.

```ts
export async function restoreProject(db: DB, id: string, ownerId: string) {
  // 1. Ownership-scoped fetch of the trashed row.
  const target = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.ownerId, ownerId)),  // Rule 2
  });
  if (!target || target.deletedAt === null) throw new TRPCError({ code: "NOT_FOUND" });

  // 2. Re-validate uniqueness against LIVE rows before clearing the flag.
  const clash = await db.query.projects.findFirst({
    where: and(
      eq(projects.ownerId, ownerId),
      eq(projects.name, target.name),
      isNull(projects.deletedAt),                       // only live rows contend
    ),
  });
  if (clash) throw new TRPCError({ code: "CONFLICT", message: "Name already in use." });

  // 3. Clear the flag.
  const [row] = await db
    .update(projects)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)))
    .returning();
  return row;
}
```

Surfacing the conflict as a typed `CONFLICT` (not a raw DB unique violation) lets the UI offer
rename-on-restore. The UI renders all four states (Rule 4); the conflict is the error state of
the restore action.
