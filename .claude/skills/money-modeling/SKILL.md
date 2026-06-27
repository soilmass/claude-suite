---
name: money-modeling
description: >
  Model monetary amounts on the decided stack without ever touching a float: choose between
  integer minor units and a typed Postgres decimal, store the currency code alongside the
  amount, brand the type so it traces from Drizzle inference, parse money at the Zod boundary,
  do integer arithmetic with explicit rounding and largest-remainder allocation, and format
  currency only at the display edge with `Intl.NumberFormat`. Encodes Rule 5 (money is never a
  float) end to end through the schema, tRPC, Zod, and the UI.
  Use when: "store money", "currency", "price column", "handle money", "cents".
  Do NOT use for: modeling timestamps/intervals (use temporal-data), or laying out tables,
  columns, and relations in general (use schema-design).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the float-money failure class (Rule 5): dollars stored as
    `real`/`number`, `* 100` / `/ 100` scattered ad hoc, naive splitting that loses cents,
    no currency column, and unrounded division. Baseline section is the encoded failure
    class; replace with an observed transcript.
---

# money-modeling

The decision skill for *how a monetary amount lives in the codebase* — its column type, its
companion currency, its branded TypeScript type, the Zod parse at the boundary, the integer
arithmetic, and the display-edge formatting. It exists because float money (Rule 5) compiles,
looks right, passes a demo, and then silently drops or invents cents in production.

The spine and the nine inviolable rules live in `../../CLAUDE.md`. This skill is the concrete
procedure behind Rule 5, leaning on Rule 1 (money type traces from Drizzle inference) and
Rule 8 (every money input is Zod-parsed). Time columns are separate — see `temporal-data`.

---

## Non-Negotiable Rules

Float money is a defect that survives review because it type-checks and renders correctly on
small numbers, so these are hard lines:

- **Never store or compute money as a float** (`real`, `double precision`, or a bare JS
  `number`-as-dollars). Use `integer`/`bigint` minor units or Postgres `numeric` (Rule 5).
- **Never store an amount without its currency.** An amount is meaningless alone; a
  `currency` ISO-4217 column travels with every money column, and arithmetic across two
  currencies is forbidden without an explicit FX conversion.
- **Never scatter `* 100` / `/ 100` through the code.** The minor-unit exponent is per
  currency (JPY=0, USD=2, BHD=3) — convert only via a single helper, and only at the display
  edge.
- **Never divide money without an explicit rounding mode and a remainder allocation.** Naive
  `total / n` loses or invents cents; split with largest-remainder so the parts sum to the whole.

Refuse these rationalizations: "it's just a price, a number is fine"; "we only support USD so
`/ 100` everywhere is OK"; "`parseFloat` then round is close enough"; "the split being off by
a cent doesn't matter."

---

## When to Use

- Adding any column that holds a price, balance, total, fee, tax, discount, or refund.
- Designing a form or tRPC input that accepts a money amount from a user or webhook.
- Splitting a total across line items, paying out a fraction, or applying a percentage.
- Displaying an amount to a user in any locale or currency.
- Integrating a payment provider (Stripe, etc.) whose API already speaks minor units.

## When NOT to Use

- Modeling timestamps, durations, or recurring intervals → `temporal-data` (Rule 6 is its
  domain; this skill never decides time columns).
- Laying out the entities, relations, and general column set of a table → `schema-design`
  (this skill consumes its table and decides only the money columns).
- Choosing indexes for an amount/currency filter → `index-strategy`.
- Authoring the migration that adds a money column to a live table → `migration-author`.

---

## Procedure

1. **Choose minor units vs. decimal — and record it (high-interrogation).** Integer minor
   units (`integer`/`bigint` cents) for discrete amounts you add/subtract: balances, line
   totals, provider amounts. Postgres `numeric(precision, scale)` for values you *multiply by
   fractions* needing sub-cent precision: unit prices, tax/FX rates. This is expensive to
   migrate later — decide deliberately and record it in `DECISIONS.md`. See
   `references/money-storage.md`.

2. **Store the currency next to every amount.** Add a `currency` ISO-4217 column (3-char)
   beside the amount column; default it only if the app is genuinely single-currency, and
   even then store it so a future second currency is a data migration, not a rewrite. See
   `references/money-storage.md`.

3. **Brand the money type from Drizzle inference (Rule 1).** Derive the field's type from
   `$inferSelect`, and wrap raw `number`/`string` amounts in a `Money` branded type
   (`{ minor: number; currency: string }`) so a bare number can never be passed where money
   is expected. `numeric` columns come back from Drizzle as `string` — keep them as string,
   never `parseFloat`. See `references/money-storage.md`.

4. **Parse money at the boundary with one shared Zod schema (Rule 8).** The form accepts a
   decimal string (`"19.99"`); the shared schema validates the shape and `.transform()`s it
   to integer minor units using string math (not `parseFloat`). The same schema is the tRPC
   input and the RHF resolver — one schema, no drift (per `../../CLAUDE.md`). See
   `references/money-storage.md`.

5. **Do all arithmetic in integer minor units.** Add and subtract minor-unit integers
   directly. For percentages and multiplication, multiply then round once with an explicit
   mode (half-up or banker's — pick and record). Never chain float operations. See
   `references/money-arithmetic.md`.

6. **Split and allocate with largest-remainder.** When dividing a total across n parts or
   applying a discount across line items, compute floored shares, then distribute the leftover
   minor units one-by-one so the parts sum *exactly* to the original — never `Math.round(total/n)`
   per part. See `references/money-arithmetic.md`.

7. **Format only at the display edge.** Convert minor units to a string with
   `Intl.NumberFormat(locale, { style: 'currency', currency })`, deriving the exponent from
   the currency, not a hardcoded `/ 100`. Server and DB stay in minor units; the divide
   happens once, in the formatter. See `references/money-arithmetic.md`.

---

## Composes With

- **Consumes:** `schema-design` — it defines the table, relations, and the non-money columns;
  this skill decides the amount column's type and its currency companion on top.
- **Pairs with:** `vertical-slice` — when a feature slice carries a price or total, this skill
  supplies the column type, the shared Zod money schema (input), and the display formatter
  (success state), so the slice's type chain stays unbroken through the amount.
- **Hands off:** adding a money column to a populated table → `migration-author` (backfill +
  currency default across deploys); time columns on the same row → `temporal-data`.

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> This is the encoded failure class, not a captured transcript. Replace it after running the
> task without the skill and recording what the agent actually does.

**Failure class encoded:** Asked to "add a price to the product table and let users enter it,"
the agent writes `price: real('price')` (or `numeric` consumed as `parseFloat`), stores raw
dollars as a float, and renders with `` `$${price.toFixed(2)}` ``. The Zod input is
`z.number()` with no transform, so `19.99` round-trips through IEEE-754 and `0.1 + 0.2`-class
drift accumulates across totals. There is **no currency column** — the amount is a bare number
assumed USD. A "split the bill three ways" feature does `Math.round(total / 3)` per share, so
$10.00 splits into 3.33 × 3 = $9.99 and a cent vanishes. Display hardcodes `/ 100` (or
`* 100` on input), which silently triples JPY and under-counts BHD. Every line passes
type-check and renders correctly on $19.99, then mis-totals real orders at the edge.

---

## Examples

**Input:** "Products have a price; users type it into a form."
**Output:** `priceMinor: integer('price_minor').notNull()` + `currency: varchar('currency',
{ length: 3 }).notNull()`. A shared Zod schema (decimal-string `price` → minor units,
`currency` length 3) is both the tRPC input and the RHF resolver. The list view formats with
`formatMoney(row.priceMinor, row.currency, locale)` — one helper, no inline `/ 100`.

**Input:** "Charge 8.25% tax on a $42.00 cart and store both."
**Output:** Minor units: `subtotalMinor = 4200`; `taxMinor = roundTo(4200 * 0.0825, mode)` =
`347` (one rounding, recorded mode); store `subtotalMinor`, `taxMinor`, `totalMinor = 4547`,
all `integer` with `currency`. The 8.25% rate, if stored, is `numeric` — a fraction, not money.

**Input:** "Split a $100.00 invoice across 3 line items."
**Output:** Largest-remainder: floored `[3333, 3333, 3333]` leaves `1` minor unit, handed to
the largest remainder → `[3334, 3333, 3333]`, summing to exactly `10000`. Never three rounds.

---

## Edge Cases

- **A payment provider returns amounts in minor units already** (Stripe `amount`) → store as
  `integer` minor units directly with its `currency`; do not divide on ingest. Validate the
  webhook body with Zod first (Rule 8).
- **You need fractional-cent unit prices** (e.g. $0.0125 per API call) → integer cents can't
  hold it; use `numeric(precision, scale)` with enough scale, keep it as `string` from
  Drizzle, and only aggregate-then-round to cents at the charge boundary.
- **Amounts can exceed ~$21M** (2.1B cents overflows `integer`) → use `bigint` minor units;
  Drizzle returns `bigint` as `string`/`BigInt`, so keep the type honest (Rule 1).
- **Multi-currency arithmetic** (summing a USD and a EUR row) → forbidden directly; convert
  through an explicit, timestamped `numeric` FX rate first, and record the authoritative side
  in `DECISIONS.md`.

## References

- `references/money-storage.md` — storage decision (integer minor units vs. `numeric`), the
  Drizzle column DSL (why `numeric`/`bigint` are `string`), the currency column, the branded
  `Money` type from `$inferSelect`, and the shared Zod boundary parse without `parseFloat`.
- `references/money-arithmetic.md` — integer arithmetic, explicit rounding modes, the
  largest-remainder split/allocate algorithm, per-currency exponents, and `Intl.NumberFormat`
  display formatting.

## Scripts

`scripts/` is reserved. A signal that would justify one: a static check grepping
`src/db/schema/` for `real(`/`doublePrecision(` on money columns and money columns lacking a
sibling `currency` — mechanically enforceable, unlike the minor-units-vs-decimal judgment.
