Purpose: unit-test patterns for the extracted-function layer — AAA structure, table-driven it.each, exact-cents money assertions, frozen-clock time tests, Zod schema-as-boundary tests, error assertions, and typed fixtures.

## 0. Extract first — the precondition

A unit test exists because the logic is callable without infrastructure. If a procedure inlines
its logic, refactor it into a plain function the procedure calls:

```ts
// src/lib/pricing.ts — pure, no db/ctx/clock
export function calculateLineTotal(
  unitCents: number,
  qty: number,
  discountBps: number, // basis points, 0–10000
): number {
  if (qty < 0) throw new Error("qty must be >= 0");
  if (discountBps < 0 || discountBps > 10_000) throw new Error("discountBps out of range");
  const gross = unitCents * qty;
  // round half-up on the discount, stay in integer cents (Rule 5)
  const discount = Math.round((gross * discountBps) / 10_000);
  return gross - discount;
}
```

The procedure stays thin and calls it:

```ts
// the procedure validates + authorizes (Rule 2) + calls the function — tested by trpc-integration-test
const total = calculateLineTotal(item.unitCents, input.qty, input.discountBps);
```

## 1. Arrange-Act-Assert, one behavior per `it`

```ts
import { describe, it, expect } from "vitest";
import { calculateLineTotal } from "./pricing";

describe("calculateLineTotal", () => {
  it("applies a basis-point discount in integer cents", () => {
    // Arrange
    const unitCents = 1999;
    // Act
    const total = calculateLineTotal(unitCents, 3, 1500); // 15% off
    // Assert — exact, no tolerance (Rule 5)
    expect(total).toBe(5097); // 5997 - round(899.55) = 5997 - 900
  });
});
```

The `it` name states the rule, so a failure reads as "applies a basis-point discount in integer
cents ✗", not "test 4 ✗".

## 2. Table-driven cases with `it.each`

Make the boundary matrix visible and cheap to extend instead of copy-pasting `it` blocks:

```ts
it.each([
  { unitCents: 1000, qty: 0, bps: 5000, expected: 0 },     // zero qty
  { unitCents: 1000, qty: 1, bps: 0, expected: 1000 },     // no discount
  { unitCents: 1000, qty: 2, bps: 10_000, expected: 0 },   // 100% off
  { unitCents: 333, qty: 3, bps: 3333, expected: 666 },    // rounding boundary
])(
  "unitCents=$unitCents qty=$qty bps=$bps -> $expected",
  ({ unitCents, qty, bps, expected }) => {
    expect(calculateLineTotal(unitCents, qty, bps)).toBe(expected);
  },
);
```

## 3. Money — exact equality, never a tolerance (Rule 5)

```ts
// CORRECT — integer cents, exact
expect(total).toBe(5097);

// WRONG — hides the rounding bug the test should catch
expect(total / 100).toBeCloseTo(50.97, 2);
```

If a function returns a formatted string for display, assert the whole string
(`expect(formatMoney(5097, "USD")).toBe("$50.97")`); the cents value remains the source of truth.

## 4. Time — frozen UTC clock (Rule 6)

Prefer injecting `now` so most cases need no fakes:

```ts
// src/lib/dates.ts
export function isSubscriptionExpired(renewsAt: Date, now: Date = new Date()): boolean {
  return renewsAt.getTime() <= now.getTime();
}
```

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { isSubscriptionExpired } from "./dates";

describe("isSubscriptionExpired", () => {
  // Injected-now cases: deterministic with zero fakes — preferred.
  it("is expired when renewsAt is at or before now", () => {
    const now = new Date("2026-06-26T00:00:00Z");
    expect(isSubscriptionExpired(new Date("2026-06-25T23:59:59Z"), now)).toBe(true);
    expect(isSubscriptionExpired(new Date("2026-06-26T00:00:01Z"), now)).toBe(false);
  });

  // Only freeze the clock to exercise the DEFAULT-now path.
  it("uses the current UTC instant when now is omitted", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-26T00:00:00Z"));
    expect(isSubscriptionExpired(new Date("2026-06-25T00:00:00Z"))).toBe(true);
  });

  afterEach(() => vi.useRealTimers()); // also covered globally in vitest.setup.ts
});
```

Assert in UTC with `...Z` literals; never assert local-formatted dates in a unit test, and never
read the real clock — a clockless test passes today and fails at a month/leap/DST boundary.

## 5. Zod schemas — test the shared boundary contract (Rule 8)

Import the same schema the form and the tRPC `.input()` use; do not restage a copy.

```ts
import { describe, it, expect } from "vitest";
import { productCreateSchema } from "@/schemas/product";

describe("productCreateSchema", () => {
  it("accepts a valid product and yields the parsed shape", () => {
    const r = productCreateSchema.safeParse({ name: "Widget", priceCents: 1999 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.priceCents).toBe(1999);
  });

  it("rejects a sale price >= price and points at the field", () => {
    const r = productCreateSchema.safeParse({
      name: "Widget",
      priceCents: 1000,
      salePriceCents: 1000,
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["salePriceCents"]);
  });
});
```

Asserting `issues[].path` proves the refinement attaches its message to the right field, which is
what lets RHF surface it inline.

## 6. Error assertions

```ts
expect(() => calculateLineTotal(1000, -1, 0)).toThrow("qty must be >= 0");
expect(() => calculateLineTotal(1000, 1, 20_000)).toThrow(/discountBps/);
```

For functions that return a typed error result instead of throwing, assert the discriminant:

```ts
const r = parseCoupon("BLACKFRIDAY");
expect(r.ok).toBe(false);
if (!r.ok) expect(r.reason).toBe("expired");
```

## 7. Typed fixtures — no `any` (Rule 1)

Derive fixture types from the chain; override only what the case is about. Prefer a builder from
`test-data-factories`:

```ts
import type { z } from "zod";
import { productCreateSchema } from "@/schemas/product";

type ProductCreateInput = z.infer<typeof productCreateSchema>;

const baseProduct = (over: Partial<ProductCreateInput> = {}): ProductCreateInput => ({
  name: "Widget",
  priceCents: 1999,
  ...over,
});

// usage: baseProduct({ priceCents: 0 })
```

Never `as any` a fixture: a later field rename must break the test at compile time, not leave it
green while production breaks.

## 8. Determinism for randomness / IDs

Inject the generator so output is reproducible:

```ts
export function makeOrderRef(now: Date, rand: () => number = Math.random): string {
  return `ORD-${now.getUTCFullYear()}-${Math.floor(rand() * 1e6)}`;
}
// test: makeOrderRef(new Date("2026-01-01T00:00:00Z"), () => 0.5) -> deterministic
```

Or `vi.spyOn(Math, "random").mockReturnValue(0.5)`, restored by the global `afterEach`. Never
assert against a real UUIDv7 or random value.
