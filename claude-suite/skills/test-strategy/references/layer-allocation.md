# Layer allocation — which test layer owns which behavior

Purpose: the decision table for placing a behavior at unit, integration, or e2e on the decided
edge stack, plus the cost/speed trade and the pyramid ratios this stack targets.

## The three layers on this stack

| Layer | Tool (sibling skill) | Runs against | Speed | What it can prove |
|---|---|---|---|---|
| Unit | `vitest-unit` | Pure functions, Zod schemas, in-memory; query mocked at the boundary for component render | ms | Logic, validation accept/reject, render branches |
| Integration | `trpc-integration-test` | A real test DB + real tRPC caller with a stubbed `ctx.auth` | 10s–100s ms | Procedure behavior, auth + ownership, actual SQL, query count |
| e2e | `playwright-e2e` | The deployed/preview app in a real browser, real Clerk session | seconds | Cross-cutting user journeys, wiring, real auth + redirects |

The rule: **push each behavior to the lowest layer that can still catch its failure.** Higher
layers are slower, flakier, and re-run on every PR — they are a scarce budget, not a default.

## Target shape (per feature, rough)

- Many unit tests (the bulk): every pure branch and schema.
- A focused band of integration tests: one per procedure path that matters, plus the
  ownership-denial and N+1 assertions.
- 1–3 e2e total: only the journeys whose total failure is unacceptable. More than ~5 is a
  signal you are testing too high — re-allocate downward.

## Behavior → layer decision table

| Behavior | Layer | Why |
|---|---|---|
| Money arithmetic in minor units (Rule 5) | Unit | Pure; fast; exhaustively case it |
| UTC↔display date conversion (Rule 6) | Unit | Pure; test boundary tz behavior cheaply |
| Derived totals, formatting, business helpers | Unit | Pure functions the procedure calls |
| Zod schema accept/reject set (Rule 8) | Unit | Schema is pure; assert valid + invalid inputs |
| Component loading/empty/error render (Rule 4) | Unit (component) | Render branch; mock the query at the boundary |
| tRPC procedure happy path (the real query) | Integration | Needs a real DB to prove the SQL is right |
| Ownership: user B denied user A's row (Rule 2) | Integration | Needs real `ctx.auth` + real row; a mock can't prove it |
| `publicProcedure` vs `protectedProcedure` gating | Integration | Auth context behavior, not pure logic |
| No N+1 over a list (Rule 7) | Integration | Assert query count against a real DB |
| Mutation persists + is readable back | Integration | Cross-procedure round-trip on real DB |
| Sign-in → core action → persisted on reload | e2e | Journey across auth, route, DB, render |
| Checkout / payment-critical full path | e2e | Total failure unacceptable; prove end to end |

## Anti-patterns this allocation prevents

- **Mock-everything procedure test.** A procedure tested with the DB and auth mocked passes
  even when the ownership check (Rule 2) is missing and even when the query is N+1 (Rule 7).
  These are precisely the failures the integration layer exists to catch — keep it real.
- **Logic buried in e2e.** Money/date logic exercised only through the browser hides
  rounding/tz bugs under flake and runs 1000× slower than the unit test that would pin it.
- **Four states via clicks.** Driving loading/empty/error through Playwright is the slowest
  possible way to assert a render branch; do it at the component layer.
- **One mega-e2e.** A single test asserting everything is brittle and gives a useless failure
  signal. Split journeys; keep each e2e to one flow.

## When you deviate

If you place a behavior higher or lower than this table says (e.g. an integration test for a
regex because the bug only reproduced with real input, or a component test promoted to e2e
because the wiring itself broke), record the choice and the reason in `DECISIONS.md`.
