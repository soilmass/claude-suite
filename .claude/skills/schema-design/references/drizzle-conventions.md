# Drizzle conventions (the schema-design output shape)

Schema is TypeScript in `src/db/schema/`, one file per aggregate. Drizzle's inferred
types root the type chain. All conventions trace to `../../../CLAUDE.md`.

## A conventional table

```ts
import { pgTable, uuid, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

export const projects = pgTable(
  "projects",                                    // snake_case table name
  {
    id: uuid("id").primaryKey().defaultRandom(), // UUIDv7 in practice if public-facing
    ownerId: uuid("owner_id").notNull()
      .references(() => users.id, { onDelete: "cascade" }), // explicit FK + cardinality
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // present only if soft-delete chosen
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index("projects_owner_id_idx").on(t.ownerId),        // index every FK
    ownerSlugUnique: uniqueIndex("projects_owner_slug_uq").on(t.ownerId, t.slug), // composite unique
  })
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
```

## Relations (for relational queries / avoiding N+1)

```ts
import { relations } from "drizzle-orm";
export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, { fields: [projects.ownerId], references: [users.id] }),
  tasks: many(tasks),
}));
```

Declaring `relations` is what lets `vertical-slice` use `with: { tasks: true }` instead
of a query-in-a-loop (inviolable rule 7).

## Conventions checklist
- snake_case table + column names.
- PK on every table; UUIDv7 if public-facing, BIGSERIAL acceptable internal-only.
- `created_at` + `updated_at` as `timestamp(..., { withTimezone: true })` (= timestamptz).
- Every FK via `.references()` with the chosen `onDelete`.
- `index()` on every FK and every frequently-filtered/sorted column.
- `uniqueIndex()` for single or composite uniqueness.
- Money columns: never `real`/`doublePrecision` — integer minor units (`integer`/`bigint`)
  or `numeric` with precision. (Inviolable rule 5.)
- `jsonb` only for schemaless, non-queried data — record the choice in DECISIONS.md.
- Enums: prefer a Postgres enum or a lookup table over free-text status columns.
