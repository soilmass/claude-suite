Purpose: the real Drizzle ORM index DSL for Postgres — `index()`, `uniqueIndex()`, column
order/direction, partial predicates, naming, and the drizzle-kit apply note.

# Drizzle index syntax (Postgres)

Indexes are declared in the **third argument** of `pgTable` — a callback that receives the
table's columns and returns an array (object form is deprecated in recent drizzle-orm) of
index builders.

```ts
import {
  pgTable, uuid, text, timestamp, pgEnum, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { orgs } from "./orgs";

export const orderStatus = pgEnum("order_status", ["pending", "active", "done"]);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id),
    status: orderStatus("status").notNull().default("pending"),
    totalCents: integer("total_cents").notNull(), // Rule 5: minor units, never float
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // Rule 6: timestamptz
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // FK floor — Rule / schema convention: index every references() column
    index("orders_user_id_idx").on(t.userId),
    index("orders_org_id_idx").on(t.orgId),

    // composite for "user's active orders, newest first": E→S→R, partial on the
    // always-present predicates so the index stays small
    index("orders_user_active_idx")
      .on(t.userId, t.createdAt.desc())
      .where(sql`${t.deletedAt} is null and ${t.status} = 'active'`),
  ],
);
```

## Builders and modifiers

- `index(name).on(col, ...)` — non-unique btree (the default and right choice for filters,
  sorts, joins, ranges).
- `uniqueIndex(name).on(col, ...)` — enforces uniqueness AND serves lookups. Prefer this
  over a separate unique constraint when you also want the index for reads.
- Column direction: `t.createdAt.desc()` / `t.col.asc()` inside `.on(...)`. Match the
  query's `ORDER BY` direction for sort-heavy reads.
- Partial predicate: `.where(sql\`…\`)`. Keep it identical to the query's always-present
  filter so the planner can prove the index applies.
- `.using("gin", ...)` / `.using("hash", ...)` — non-btree methods. GIN for `jsonb` key
  lookups and full-text; reconsider whether jsonb should be a real column first.
- The builder exposes **no** concurrency method. `CONCURRENTLY` is a SQL-level PostgreSQL
  construct: to build an index concurrently on a populated table, edit the generated
  migration to use `CREATE INDEX CONCURRENTLY` and drop the transaction wrapper —
  `CONCURRENTLY` cannot run inside one. This is a `migration-author` responsibility — see below.

## Naming convention

`<table>_<columns>_idx` for plain, `<table>_<columns>_uniq` (or `_key`) for unique. Use
`snake_case` to match the column/table convention in `../../CLAUDE.md`. Name every index
explicitly — auto-generated names are unstable across schema edits and make migrations
noisy.

## Unique: column-level vs. index

- `.unique()` on a column → a single-column unique *constraint*.
- `uniqueIndex(name).on(a, b)` → a multi-column unique index, and the only way to make
  uniqueness **partial**:

```ts
// one ACTIVE membership per (user, org); allows rejoining after soft delete
uniqueIndex("memberships_user_org_active_idx")
  .on(t.userId, t.orgId)
  .where(sql`${t.deletedAt} is null`),
```

A plain composite unique constraint would forbid the historical soft-deleted row.

## Type chain (Rule 1)

Index definitions do not change inferred row types — `InferSelectModel`/`InferInsertModel`
stay the root of the chain. They only affect the planner. Never reach for `any`/casts
because of an index.

## Applying — drizzle-kit

- New table: indexes ship in the initial `drizzle-kit generate` migration; applied with the
  table. No special handling.
- Adding an index to an **existing, populated** table: a plain `CREATE INDEX` takes an
  `ACCESS EXCLUSIVE`-ish lock that blocks writes for the build. On a large table, edit the
  generated migration to `CREATE INDEX CONCURRENTLY` (and drop the transaction wrapper —
  `CONCURRENTLY` cannot run inside one). This is a `migration-author` responsibility; hand
  off rather than inlining it here.
- Always review the generated SQL before apply; never auto-apply a destructive index change
  (e.g. dropping an index a hot query depends on) without a gate.
