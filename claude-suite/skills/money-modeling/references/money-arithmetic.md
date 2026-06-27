Purpose: integer money arithmetic, explicit rounding, largest-remainder allocation, per-currency exponents, and display-edge formatting with Intl.NumberFormat.

# Money arithmetic & display

All arithmetic happens on **integer minor units**. Floats never enter a money calculation
(Rule 5). The only division by the minor-unit base happens once, inside the formatter.

## 1. Add / subtract — direct integer math

Same-currency only. Adding two `Money` of different currencies is a bug; guard it.

```ts
import type { Money } from "./money-storage";

function assertSameCurrency(a: Money, b: Money) {
  if (a.currency !== b.currency) throw new Error(`currency mismatch: ${a.currency} vs ${b.currency}`);
}
export const add = (a: Money, b: Money): Money =>
  (assertSameCurrency(a, b), { minor: a.minor + b.minor, currency: a.currency });
export const subtract = (a: Money, b: Money): Money =>
  (assertSameCurrency(a, b), { minor: a.minor - b.minor, currency: a.currency });
```

## 2. Multiply / percentage — one explicit rounding

Multiplying money by a quantity or a rate yields a fractional minor unit; round exactly once,
with a mode you chose and recorded in `DECISIONS.md` (half-up vs. banker's/half-even — the
latter reduces cumulative bias across many rows).

```ts
type RoundMode = "half-up" | "half-even";

function roundTo(value: number, mode: RoundMode): number {
  if (mode === "half-up") return Math.sign(value) * Math.round(Math.abs(value));
  // half-even (banker's)
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

// 8.25% tax on $42.00 -> 4200 * 0.0825 = 346.5 -> 347 (half-up)
export const applyRate = (m: Money, rate: number, mode: RoundMode = "half-even"): Money =>
  ({ minor: roundTo(m.minor * rate, mode), currency: m.currency });
```

Multiply minor units, not dollars. `4200 * 0.0825` stays exact enough; `42.00 * 0.0825 * 100`
drifts.

## 3. Split / allocate — largest-remainder (never lose a cent)

Dividing a total across n parts (or across weighted line items) must sum back to the original.
Floor each share, then hand the leftover minor units to the largest remainders.

```ts
// Equal split. allocate(10000, 3) -> [3334, 3333, 3333]
export function allocate(totalMinor: number, n: number): number[] {
  const base = Math.floor(totalMinor / n);
  let remainder = totalMinor - base * n;       // cents still to distribute
  return Array.from({ length: n }, () => (remainder-- > 0 ? base + 1 : base));
}

// Weighted split by ratios (e.g. discount across line items by price weight).
export function allocateByWeights(totalMinor: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const shares = weights.map((w) => Math.floor((totalMinor * w) / sum));
  let remainder = totalMinor - shares.reduce((a, b) => a + b, 0);
  // give leftover to the items with the largest fractional remainders first
  const order = weights
    .map((w, i) => ({ i, frac: (totalMinor * w) / sum - shares[i] }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) { if (remainder-- <= 0) break; shares[i]++; }
  return shares;
}
```

Never `Math.round(total / n)` per part: `round(1000/3)*3 = 999`, a cent vanishes.

## 4. Per-currency minor-unit exponent — never hardcode `/ 100`

Most currencies have 2 decimal places, but JPY/KRW have 0 and BHD/KWD have 3. The exponent
comes from the currency, not a constant.

```ts
// Derive from Intl at runtime — no hand-maintained table.
export function minorUnitExponent(currency: string): number {
  const fmt = new Intl.NumberFormat("en", { style: "currency", currency });
  return fmt.resolvedOptions().maximumFractionDigits; // USD->2, JPY->0, BHD->3
}
```

## 5. Display formatting — the one place division happens (Rule 3 unaffected; this is data, not style)

Format only at the display edge, in a Client or Server Component, with `Intl.NumberFormat`.
Server and DB stay in minor units.

```ts
export function formatMoney(minor: number, currency: string, locale: string): string {
  const exp = minorUnitExponent(currency);
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 10 ** exp);
}
// formatMoney(1999, "USD", "en-US") -> "$19.99"
// formatMoney(1999, "JPY", "ja-JP") -> "￥1,999"  (exp 0, no false /100)
```

This is the only `/ 10 ** exp` in the app. It satisfies Rule 4's *success* state — and pair
the component with `loading`/`empty`/`error` states (see `vertical-slice`).

## 6. FX conversion (multi-currency)

To combine currencies, convert through an explicit, timestamped rate (stored `numeric`), then
do integer math in the target currency. Record which currency is authoritative in
`DECISIONS.md`. Rates perish, so a converted historical total must store the rate used, not
just the result.

```ts
// rate = target minor per source minor (already exponent-adjusted), rounded once.
export function convert(m: Money, target: string, rate: number, mode: RoundMode = "half-even"): Money {
  return { minor: roundTo(m.minor * rate, mode), currency: target };
}
```
