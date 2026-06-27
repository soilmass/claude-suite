---
name: vitest-unit
description: >
  Configure Vitest for the edge stack and write fast, deterministic unit tests for the plain
  functions that thin tRPC procedures call — the business logic, pure helpers, money math,
  date math, and Zod refinements. Covers the no-DB/no-network rule for unit scope, table-driven
  cases with it.each, exact integer-cents assertions, and a frozen UTC clock so time-dependent
  logic is reproducible. The unit test exercises the extracted function in isolation, not the
  procedure or the database.
  Use when: "unit test", "vitest", "test this function", "write a unit test".
  Do NOT use for: testing a tRPC procedure end to end with auth/ctx/db (use trpc-integration-test),
  or deciding what to test and at which layer (use test-strategy).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the untestable-procedure failure class: logic inlined in a
    procedure so the only test mocks db + Clerk, float-tolerant money assertions, and clockless
    time-dependent tests that pass today and fail at a month boundary.
    Baseline observed (clean-room capture).
---

# vitest-unit

Stand up Vitest and write unit tests against the **plain functions** thin procedures call —
the layer `../../CLAUDE.md` mandates when it says procedures "validate, authorize, call a
function, return." Unit scope means no database, no network, no Clerk: if a test needs those,
it is an integration test (`trpc-integration-test`), not this. Enforces Rule 5 (exact cents),
Rule 6 (UTC time math), Rule 8 (Zod boundary), and Rule 1 (no `any` in tests).

## Non-Negotiable Rules

- **Never** unit-test logic by mocking the db client or Clerk — that is the tell that logic is
  trapped in the procedure. Extract a pure function and test it directly; hand the procedure to
  `trpc-integration-test`.
- **Never** assert money with `toBeCloseTo` or a tolerance. Money is integer minor units; assert
  exact equality with `toBe` (Rule 5). A tolerance hides the rounding bug you are testing for.
- **Never** let a time-dependent test read the real clock. Freeze it with `vi.setSystemTime` to a
  fixed UTC instant and assert in UTC (Rule 6).
- **Never** type a fixture, mock, or helper as `any`/`as any` to silence the compiler (Rule 1);
  derive fixture types from Drizzle inference or the Zod `z.infer`.

Refuse these rationalizations: "the logic is trivial, I'll just mock the db to test the
procedure," "floats are close enough for a test," "the date test passes on my machine," "it's
only test code, `any` is fine here."

## When to Use

- A thin procedure delegates to a plain function (pricing, scoring, formatting, state
  transition) and you want that function covered in isolation.
- You are testing money/discount/tax math, date math, a parser, or a Zod schema's refinements.
- The project has no Vitest config yet and you need the edge-appropriate setup.
- You are extracting logic out of a procedure (with `refactor`) and want a test to pin behavior
  before and after.

## When NOT to Use

- Testing a procedure through its router with real `ctx`, auth, and a test db: use
  **trpc-integration-test**.
- Deciding the test pyramid — what deserves a unit vs. integration vs. e2e test, coverage
  targets: use **test-strategy**.
- Generating the typed fixtures/builders the tests consume: use **test-data-factories**.
- Rendering a component to assert its four states: that is component-test territory, not unit.

## Procedure

1. **Confirm there is a pure function to test (medium).** If the behavior lives inside the
   procedure, stop and extract it first (`refactor`) — a unit test that mocks db/Clerk is the
   anti-pattern this skill refuses. The target takes plain inputs and returns a value. See
   `references/patterns.md`.
2. **Set up Vitest once per repo (low).** Add `vitest` + config with `environment: "node"` for
   logic (jsdom only for component tests), globals on, and a `test` script. Co-locate
   `*.test.ts` next to the source. See `references/vitest-setup.md`.
3. **Structure each test Arrange-Act-Assert (low).** One behavior per `it`, a name that states
   the rule ("rounds half to even", "rejects sale price ≥ price"). Group with `describe` per
   function. See `references/patterns.md`.
4. **Drive variants with `it.each`, not copy-paste (medium).** Table-driven cases for the
   input/expected matrix keep boundaries (0, negative, max) visible and cheap to extend. See
   `references/patterns.md`.
5. **Assert money and time exactly (high — silent-corruption class).** Compare cents with `toBe`
   (Rule 5). Freeze the clock with `vi.useFakeTimers()` + `vi.setSystemTime(new Date("...Z"))`,
   assert ISO/UTC, and restore in `afterEach` (Rule 6). See `references/patterns.md`.
6. **Test Zod schemas as boundary contracts (medium).** Assert `.safeParse` success shape and,
   for each refinement, the failing input plus the `issues[].path` (Rule 8). The schema under
   test is the one shared with the form — import it, don't restage it. See `references/patterns.md`.
7. **Keep fixtures typed and minimal (low).** Build inputs from `test-data-factories` or
   `z.infer`/Drizzle inference; no `any`. Override only the fields the case is about.

## Composes With

- **Consumes:** `test-strategy` (decides this function warrants a unit test and the cases).
- **Pairs with:** `test-data-factories` (typed builders for inputs and expected rows).
- **Runs against:** the plain functions `vertical-slice` extracts behind each thin procedure.
- **Hands off:** `trpc-integration-test` for the procedure/auth/db path this scope excludes;
  `refactor` when the logic must be extracted before it can be unit-tested.

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked to set up Vitest and unit-test a cart total, the naive agent modeled
prices as floating-point dollars and wrote the function plus tests around that shape — the
suite even asserts `19.98` from `9.99 * 2`, baking the float into a green test:

```ts
export function computeTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}
// expect(computeTotal([{ name: "Widget", price: 9.99, quantity: 2 }])).toBe(19.98);
```

The single-item case happens to pass, but nothing guards against `0.1 + 0.2` drift across a
real multi-item cart. The config was also standalone — `environment: "node"` only, no
`vite-tsconfig-paths` for the project's `~/`/`@/` aliases and no coverage provider/threshold.

**Failure class (confirmed).** Without this skill the agent reaches for `number`-as-dollars
and float-tolerant assertions, violating Rule 5 silently — the bug hides behind a passing
test. It also ships a config that ignores the project's path aliases and coverage gate, so
tests that import real app modules would break and there is no enforced quality floor.

## Examples

**Input:** "Test `calculateLineTotal(unitCents, qty, discountBps)`." → **Output:** a
`calculateLineTotal.test.ts` with a `describe` and `it.each` table covering qty 0, a 1500-bps
discount, and the rounding boundary; every expected value is integer cents asserted with `toBe`;
a case asserting a negative qty throws (Rule 5).

**Input:** "Test `isSubscriptionExpired(renewsAt, now)`." → **Output:** the function takes `now`
as a parameter (injected clock) so most cases need no fakes; one case uses
`vi.setSystemTime(new Date("2026-03-01T00:00:00Z"))` to prove the default-`now` path, restored in
`afterEach`; all instants are `...Z` UTC (Rule 6).

**Input:** "Test the shared `productCreateSchema`." → **Output:** `safeParse` of a valid object
asserts `success` and the parsed shape; a case with `salePrice >= price` asserts
`!success` and `issues[0].path` equals `["salePrice"]`; imports the same schema the form uses
(Rule 8), no restaged copy.

## Edge Cases

- When the function reaches for `db`, `fetch`, or `auth()` → it is not a unit; extract the pure
  core or route it to `trpc-integration-test` instead of mocking your way in.
- When logic depends on "now" → add a `now: Date` parameter and pass it in; reserve
  `vi.setSystemTime` for the thin default-argument path, not every case.
- When randomness or UUIDv7 is involved → inject the generator (or `vi.spyOn`) so output is
  deterministic; never assert against a real random value.
- When a test needs many similar rows → reach for `test-data-factories`, not inline literals
  duplicated per case, so a schema change updates one builder.

## References

- `references/vitest-setup.md` — Vitest install/config for the edge stack, node-vs-jsdom
  environment, file layout, scripts, coverage, and the no-DB/no-network unit boundary.
- `references/patterns.md` — AAA structure, `it.each` tables, exact-cents money assertions,
  frozen-clock time tests, Zod schema testing, error assertions, and typed fixtures, with code.

## Scripts

Reserved; empty for now. A scaffolder that emits a `*.test.ts` skeleton next to a selected
exported function (with a pre-filled `describe`/`it.each`) would justify one once the
`src/` function-module layout is fixed across projects.
