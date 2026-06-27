Purpose: the real Drizzle column definitions for UUIDv7 and BIGSERIAL primary keys, edge-compatible v7 generation (app-side vs. Postgres-side), native `uuid` vs. `text`, and foreign-key type matching.

# Drizzle ID columns for the edge stack

## UUIDv7 primary key — app-side generation (the edge default)

At the edge the DB driver is HTTP-based (Neon serverless / Turso class) and Postgres-side
functions/extensions are not guaranteed portable, so generating v7 in the app via `$defaultFn`
is the portable default. Use a small v7 library (e.g. the `uuidv7` package; some `uuid` builds
also export `v7`).

```ts
import { pgTable, uuid, timestamp, text } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

export const orders = pgTable("orders", {
  // native 16-byte uuid column — NOT text
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  // ... domain columns ...
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
```

Notes:
- `uuid(...)` maps to Postgres native `uuid` (stored as 16 bytes, validated). Never `text("id")`
  — that doubles storage and drops validation.
- `$defaultFn` runs in JS at insert time, so the value exists before the row reaches the DB —
  works identically across edge drivers, no extension required.
- `timestamp(..., { withTimezone: true })` is `timestamptz` (Rule 6). `.defaultNow()` +
  `.$onUpdate(() => new Date())` gives the standard `created_at`/`updated_at` pair every table
  carries per `../../CLAUDE.md`.

## UUIDv7 primary key — Postgres-side generation

Valid when your Postgres supports it; record the dependency in `DECISIONS.md` because it is not
portable across all edge drivers.

```ts
import { sql } from "drizzle-orm";

// Postgres 18+: native uuidv7()
id: uuid("id").primaryKey().default(sql`uuidv7()`),

// Pre-18 with the pg_uuidv7 extension installed:
id: uuid("id").primaryKey().default(sql`uuid_generate_v7()`),
```

Do **not** use `gen_random_uuid()` / `defaultRandom()` for a PK — that is v4 (random,
index-fragmenting). See `id-decision.md` for why.

## BIGSERIAL primary key — internal-only rows

Only for rows whose ID never crosses a trust boundary (join tables, audit logs, counters).

```ts
import { pgTable, bigserial, uuid, timestamp } from "drizzle-orm/pg-core";

export const orderItems = pgTable("order_items", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  // FK matches the PARENT's type — orders.id is uuid, so order_id is uuid:
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- `{ mode: "number" }` returns a JS `number` (fine up to 2^53). For tables that can exceed that,
  use `{ mode: "bigint" }` and handle `bigint` in TS — keep the type chain intact (Rule 1).
- Modern alternative to `bigserial`: `bigint("id").generatedAlwaysAsIdentity()` (SQL-standard
  identity column). Either is acceptable for internal IDs; pick one project-wide and record it.

## Foreign-key type matching

A foreign key must be the **same type as the column it references**. Decide the parent's PK type
first; children follow:

- parent PK `uuid` → every FK to it is `uuid("...").references(() => parent.id)`;
- parent PK `bigserial`/`bigint` → FK is `bigint("...", { mode: "number" })`.

A UUID child pointing at a serial parent (or vice versa) will not compile against the inferred
types and will fail at the constraint — a common drift the type chain (Rule 1) catches if you
let it, and a silent bug if you cast around it.

## Inferred types are the root of the chain

Whatever you choose, the column type flows outward via Drizzle inference (`$inferSelect` /
`$inferInsert`) into tRPC, the shared Zod schema, the form, and the component — unbroken
(Rule 1). A `uuid` PK infers as `string`; a `bigserial` as `number` (or `bigint`). The shared
input schema validates the public form: `z.string().uuid()` for UUID IDs (see `id-decision.md`).

## drizzle-kit

Generate the migration with `drizzle-kit generate` and review the SQL before applying — confirm
the column is `uuid`/`bigint`, the default is what you intend (app-side `$defaultFn` produces no
SQL default; Postgres-side produces a `DEFAULT uuidv7()`), and the FK constraint types line up.
Changing a PK type on a populated table is destructive — hand to `migration-author`.
