Purpose: how a monetary amount is stored and typed on the decided stack — column choice, the currency companion, the branded type from Drizzle inference, and the shared Zod boundary parse.

# Money storage

## 1. Integer minor units vs. Postgres `numeric` — the fork

| Use | When | Drizzle column |
| --- | --- | --- |
| **Integer minor units** | Discrete amounts you add/subtract: balances, line totals, payment-provider amounts, anything < ~$21M | `integer('amount_minor')` |
| **`bigint` minor units** | Same, but amounts can exceed 2,147,483,647 minor units (~$21M at exp 2) | `bigint('amount_minor', { mode: 'bigint' })` |
| **`numeric(p, s)`** | Values multiplied by fractions needing sub-cent precision: unit prices, tax/interest/FX rates | `numeric('rate', { precision: 19, scale: 6 })` |

Record the choice in `DECISIONS.md` — migrating between them later is a destructive type
change (`migration-author`, expand-contract). Default to **integer minor units**; reach for
`numeric` only when you genuinely multiply by fractions and lose meaning at whole cents.

Never `real`/`doublePrecision` for money (Rule 5). Those are binary floats and cannot
represent `0.10` exactly.

```ts
import { pgTable, integer, bigint, numeric, varchar, timestamp, uuid } from "drizzle-orm/pg-core";

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),         // UUIDv7 in practice — see schema-design
  // integer minor units (cents). Always paired with currency.
  subtotalMinor: integer("subtotal_minor").notNull(),
  taxMinor: integer("tax_minor").notNull(),
  totalMinor: integer("total_minor").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),   // ISO 4217, e.g. "USD"
  // a rate is a fraction, not money -> numeric, kept as string out of Drizzle
  taxRate: numeric("tax_rate", { precision: 9, scale: 6 }), // e.g. "0.082500"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

> **`numeric` comes back as a `string`.** Drizzle (and node-postgres) return `numeric`/`bigint`
> as strings to avoid precision loss. Keep them as strings; do arithmetic with a decimal-safe
> path or convert to minor-unit integers. `parseFloat` on a `numeric` re-introduces the float
> bug you avoided (Rule 1 + Rule 5).

## 2. The currency column is not optional

Every amount column has a sibling `currency` (ISO 4217, 3 chars). Even a single-currency app
stores it, so adding a second currency is a backfill, not a schema rewrite. Two amounts may
only be added/compared when their `currency` matches; cross-currency needs an explicit FX
conversion (see `money-arithmetic.md`).

For a fixed currency set, prefer a `pgEnum` or a `currencies` reference table over free text.

## 3. Brand the money type (Rule 1)

The amount field's type traces from Drizzle inference. Wrap it so a bare `number` can't be
passed where money is expected:

```ts
import type { InferSelectModel } from "drizzle-orm";
type OrderRow = InferSelectModel<typeof orders>; // subtotalMinor: number, currency: string

// Branded money value object — minor units + currency travel together.
export type Money = { readonly minor: number; readonly currency: string };

export function money(minor: number, currency: string): Money {
  if (!Number.isInteger(minor)) throw new Error("money minor units must be an integer");
  return { minor, currency };
}

export const orderTotal = (o: OrderRow): Money => money(o.totalMinor, o.currency);
```

A `Money` flows through tRPC and into the component; the raw `number` only exists at the DB
edge and inside arithmetic helpers.

## 4. One shared Zod schema at the boundary (Rule 8)

The form accepts a decimal string; the schema validates it and transforms to minor units with
**string math**, never `parseFloat`. The same schema is the tRPC input and the RHF resolver —
one schema, no drift (`../../CLAUDE.md`).

```ts
import { z } from "zod";
import { minorUnitExponent } from "./money-arithmetic";

// exp = minor-unit exponent for the currency (2 for USD, 0 for JPY, 3 for BHD).
export function decimalStringToMinor(value: string, exp: number): number {
  const [whole, frac = ""] = value.split(".");
  const padded = (frac + "0".repeat(exp)).slice(0, exp);
  return Number(whole) * 10 ** exp + (whole.startsWith("-") ? -1 : 1) * Number(padded || "0");
}

// Shared: tRPC input AND @hookform/resolvers/zod resolver.
export const moneyInput = z.object({
  // a string like "19.99" — RHF text input; never z.number() for currency entry
  amount: z.string().regex(/^-?\d+(\.\d{1,4})?$/, "enter a valid amount"),
  currency: z.string().length(3).toUpperCase(),
}).transform(({ amount, currency }) => ({
  minor: decimalStringToMinor(amount, minorUnitExponent(currency)), // -> integer
  currency,
}));

export type MoneyInput = z.infer<typeof moneyInput>; // { minor: number; currency: string }
```

In the tRPC procedure, this parsed value feeds the insert directly; in RHF, the resolver
rejects bad shapes before submit. Validate webhook bodies (Stripe etc.) with the same kind of
schema before trusting their amounts.

## 5. Payment-provider amounts

Stripe and most providers already send **minor units** (`amount: 1999` = $19.99). Store them
as `integer` minor units directly with the provider's `currency` — do not divide on ingest.
Zero-decimal currencies (JPY) arrive as whole units; the per-currency exponent (next file)
keeps that correct.
