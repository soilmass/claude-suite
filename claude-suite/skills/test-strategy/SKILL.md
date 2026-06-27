---
name: test-strategy
description: >
  Decide what to test, and at which layer, for a feature on the decided edge stack — the
  pyramid: unit (pure logic and Zod schemas), integration (tRPC procedures with auth and
  ownership over a real test DB), e2e (a handful of critical user flows through the browser).
  Allocates each behavior to the cheapest layer that can catch its failure, names the layers
  that prove the nine rules hold, and stops the over-testing (everything mocked, nothing real)
  and under-testing (one brittle e2e for everything) that both ship.
  Use when: "what should I test", "test strategy", "test pyramid", "how to test this".
  Do NOT use for: writing a specific unit test (use vitest-unit), e2e setup and a flow (use
  playwright-e2e), or wiring the procedure integration harness (use trpc-integration-test).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the misallocated-test-effort failure class: behavior tested
    at the wrong layer (or not at all) so the suite is slow, brittle, and silent on the rules
    that actually break in production (ownership, the four states, boundary validation).
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# test-strategy

Pick the layer for each behavior before a single test is written. This is the planning skill
that sits in front of `vitest-unit`, `trpc-integration-test`, and `playwright-e2e`: it maps a
feature's behaviors onto the pyramid so each is caught at the cheapest layer that can catch it,
and so the inviolable rules in `../../CLAUDE.md` are each provable by some test. It decides
allocation; the sibling skills write the tests.

## When to Use
- Starting a feature (or a `vertical-slice`) and deciding what its test suite should contain.
- The suite is slow or flaky and you suspect behavior is tested at the wrong layer.
- A bug shipped and you need to decide where the missing test belongs.
- Reviewing test coverage for a PR — is the right thing tested in the right place?

## When NOT to Use
- Actually writing a pure-logic or Zod-schema unit test → `vitest-unit`.
- Standing up the Playwright harness and authoring a critical-flow e2e → `playwright-e2e`.
- Wiring the tRPC caller + test-DB harness and writing a procedure test → `trpc-integration-test`.
- Auditing code against the nine rules statically (not via tests) → `rule-audit`.

## Procedure

1. **Enumerate the feature's behaviors, not its files (low cost).** List what the feature
   must do and must refuse: each validation rule, each branch, each authorization decision,
   each state the UI can be in. You are allocating behaviors to layers, so name them first.
   See `references/layer-allocation.md`.

2. **Push every behavior to the lowest layer that can prove it (medium cost — this is the
   core call).** Pure logic (money math in minor units per Rule 5, date/UTC conversion per
   Rule 6, derived totals, a Zod schema's accept/reject set per Rule 8) → **unit**. Anything
   that needs the DB, the auth context, or a real procedure (ownership per Rule 2, N+1 per
   Rule 7, the actual query) → **integration**. Only genuinely cross-cutting user journeys →
   **e2e**. The allocation table is in `references/layer-allocation.md`.

3. **Make the rules testable, not just audited (high cost — these are the silent failures).**
   `rule-audit` catches rule violations statically; tests prove they *stay* fixed. Pin the
   high-blast-radius ones: Rule 2 (an integration test where user B is denied user A's row),
   Rule 5 (unit tests on money arithmetic), Rule 7 (an integration assertion on query count),
   Rule 8 (unit tests on schema boundaries). See `references/rules-to-tests.md`.

4. **Budget e2e ruthlessly (high cost — each e2e is slow and flaky).** Reserve e2e for the
   one or two flows whose total failure is unacceptable (sign-up → core action → persistence;
   checkout). Everything an e2e would *also* incidentally cover should already be pinned
   cheaper at unit/integration. If you have more than ~3-5 e2e per feature, you are testing
   too high — re-allocate downward. Hand the chosen flows to `playwright-e2e`.

5. **Decide the four-states coverage split (medium cost, Rule 4).** Loading, empty, error,
   success are a component contract: success and error paths get an integration test on the
   procedure that feeds them; loading/empty/error *rendering* are component-level (unit, with
   the query mocked at the boundary). Don't drive all four states through e2e — it is the
   slowest way to assert a render branch.

6. **Record non-obvious allocation forks (low cost).** When you deliberately test something
   higher or lower than this skill's default (e.g. an integration test for a regex because the
   bug only reproduced with real input), record the choice and reason in `DECISIONS.md` so the
   next author doesn't "fix" it back.

## Composes With
- **Feeds:** `vitest-unit` (the behaviors allocated to the unit layer), `trpc-integration-test`
  (procedure/auth/ownership/N+1 behaviors), `playwright-e2e` (the budgeted critical flows).
- **Pairs with:** `vertical-slice` (plan the slice's tests as you build it), `rule-audit`
  (static rule check; this skill makes the same rules provable by test).
- **Hands off:** the actual test authoring to the three sibling test skills above.

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)
> Encoded failure class, not a captured transcript; replace once observed in the wild.

**Failure class encoded:** Asked to "add tests for this feature," the agent produces a test
suite misallocated across the pyramid. Concrete defects that ship: (1) the tRPC procedure is
tested with every dependency mocked, so the test passes even though the real query has no
**ownership check** (Rule 2 unproven) — the #1 vulnerability class is invisible to the suite;
(2) money and date logic that is pure and cheap to unit-test is instead exercised only through
a slow e2e, so a float-rounding bug (Rule 5) is buried under browser flake; (3) a single
sprawling Playwright test asserts everything, so it is brittle, slow, and re-run-on-every-PR
expensive; (4) the **four states** (Rule 4) are "tested" by clicking through the UI rather than
asserting the render branches at the component layer; (5) no test exercises the N+1 path
(Rule 7) because nothing hits a real DB. Coverage numbers look healthy; the failures that
reach production are exactly the ones nothing pinned.

## Examples

**Input:** "What should I test for the invoice feature (create invoice, list my invoices,
mark paid)?"
**Output:** Allocation — **unit:** `cents` total/tax math (Rule 5), the `createInvoiceInput`
Zod schema's accept/reject cases (Rule 8), `formatMoney`/UTC `formatDate` display helpers
(Rule 6). **integration:** `invoice.create` writes a row owned by `ctx.auth.userId`;
`invoice.list` returns only the caller's rows and denies another user's (Rule 2);
`invoice.list` over N invoices issues one query, not N (Rule 7). **e2e:** one flow — sign in →
create invoice → see it in the list → mark paid → reload and confirm persisted. The
invoice-row component's loading/empty/error renders → component unit tests (Rule 4). Hands the
three buckets to `vitest-unit`, `trpc-integration-test`, `playwright-e2e`.

**Input:** "A user reported they could open someone else's order by guessing the URL. Where
does the test go?"
**Output:** This is a Rule 2 ownership failure on a procedure — the test belongs at the
**integration** layer, not e2e: a `trpc-integration-test` where caller B requests caller A's
order id and expects `FORBIDDEN`/empty. An e2e would be slower and prove less. Add the
regression there; note the fix in `DECISIONS.md` if the ownership pattern was non-obvious.

## Edge Cases
- **A pure helper has a bug only reproducible with real DB data** → move that one case up to
  integration and record why in `DECISIONS.md`; don't relocate the whole helper's suite.
- **No DB available in CI for integration** → that is harness setup, owned by
  `trpc-integration-test` (test DB / branch DB); this skill still allocates the behavior to
  integration, it does not lower it to a mock-everything unit test.
- **A flow is critical but its steps are all already pinned cheaper** → you may still keep one
  thin e2e as a smoke test of the wiring, but don't duplicate the assertions — keep it to "the
  pieces connect."
- **Tempted to mock the DB in a procedure test** → don't; a mocked DB can't prove ownership
  (Rule 2) or query count (Rule 7), which is the whole reason the test exists. Use a real test
  DB via `trpc-integration-test`.

## References
- `references/layer-allocation.md` — the behavior → layer decision table, the cost/speed
  trade per layer, and the pyramid ratios this stack targets.
- `references/rules-to-tests.md` — for each of the nine rules, which layer proves it and the
  shape of the test that does.

## Scripts
`scripts/` reserved. A coverage-by-layer reporter (parsing Vitest/Playwright output to flag
features with e2e but no integration ownership test) would justify one once the harness output
formats stabilize across `trpc-integration-test` and `playwright-e2e`. Empty for now.
