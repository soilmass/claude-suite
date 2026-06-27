---
name: component-state-test
description: >
  Write React Testing Library tests that prove a data-bound component renders ALL FOUR
  states — loading, empty, error, and success — not just the happy path. This is the
  test-side enforcement of Rule 4: each state gets its own test driving the component
  by faking the tRPC/React Query hook's status, and asserting on user-visible output via
  accessible queries. Covers harness setup (Vitest + jsdom + a mocked tRPC client),
  forcing each query status, and asserting the empty vs. error distinction that ships
  broken most often.
  Use when: "test the component", "test all states", "rtl test", "test loading and error".
  Do NOT use for: full browser/page flows across routes (use playwright-e2e), or
  accessibility assertions like axe/contrast/keyboard (use a11y-gate / ci-a11y-test).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the Rule 4 test gap: a component test suite that asserts
    only the success render, leaving loading/empty/error unverified and free to regress.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# component-state-test

The skill for proving Rule 4 holds in the test suite. Given a data-bound component, it
produces four focused React Testing Library tests — one each for loading, empty, error,
and success — that drive the component by faking its data hook's status and assert on what
the user actually sees. It is the test-side twin of building the states in `vertical-slice`.

The spine and the nine inviolable rules live in `../../CLAUDE.md`. This skill does not
restate them; it enforces Rule 4 (all four states) in tests and obeys Rule 1 (the mocks and
fixtures are typed from Drizzle/tRPC inference, never `any`-cast).

---

## Non-Negotiable Rules

A suite that tests only success is the exact failure this skill exists to stop, so these
are hard lines:

- **Never let a component test assert only the success render.** Loading, empty, error, and
  success each get their own `it(...)` (or `test.each` case). Three missing tests is three
  states free to regress silently (Rule 4).
- **Never conflate empty and error.** "No rows" and "the query threw" are different renders
  and different tests. A single "renders nothing" assertion that passes for both hides a
  broken error state.
- **Never `as any` / `@ts-expect-error` the hook mock or fixture.** The mocked query result
  and the row fixtures are typed from the procedure's inferred output and Drizzle's
  `$inferSelect` — a cast that compiles is a fixture that has drifted from reality (Rule 1).
- **Never assert on test ids or class names as the primary check.** Query by role, label, or
  visible text (`getByRole`, `findByText`) so the test breaks when the user-visible output
  breaks, not when an internal attribute moves.

Refuse these rationalizations: "the success test covers the component"; "loading is just a
spinner, not worth a test"; "empty and error both render nothing, one test is enough"; "I'll
cast the mock, the real shape is close enough."

---

## When to Use

- A data-bound component (renders from a tRPC query / React Query hook) needs tests.
- A `vertical-slice` just produced a component with all four states and you are writing its
  suite.
- A review or `rule-audit` flagged a component whose loading/empty/error paths are untested.
- You are adding a state (e.g. a new empty-CTA) and must lock its render with a test.

## When NOT to Use

- You need a real cross-route/browser flow (login → navigate → submit) → `playwright-e2e`.
- You are asserting accessibility (axe, contrast, focus order, keyboard) → `a11y-gate` for
  the manual/interpretive pass, `ci-a11y-test` for the automated axe run in CI.
- The component or its states do not exist yet → build them with `vertical-slice` first;
  this skill tests what exists.
- You are testing a pure tRPC procedure or function with no React → unit-test it directly,
  not through RTL.

---

## Procedure

1. **Enumerate the four states for THIS component (low-interrogation).** Name what each
   renders: loading (skeleton/spinner), empty (zero rows + any CTA), error (the fallback +
   message), success (the populated render). If the component lacks one, stop — that is a
   Rule 4 gap to fix in `vertical-slice`, not to skip in the test. See
   `references/rtl-state-tests.md`.

2. **Stand up the harness once.** Render under a `QueryClientProvider` (with retries off so
   the error state is reachable synchronously) and a mocked tRPC client; stub Clerk's hooks
   if the component reads auth. This is shared setup, not per-test. See
   `references/test-harness.md`.

3. **Drive each state by faking the hook's status, not the network.** Mock the tRPC/React
   Query hook to return `{ isPending: true }`, then a success with `[]`, then a success with
   rows, then `{ isError: true, error }`. Forcing status is deterministic; intercepting fetch
   is flaky at the edge. See `references/test-harness.md`.

4. **Type every fixture from inference (Rule 1).** Build row fixtures as the procedure's
   inferred output type (`inferProcedureOutput`) or Drizzle `$inferSelect`, so a schema change
   breaks the test at compile time. No `as any`. See `references/rtl-state-tests.md`.

5. **Assert on user-visible output via accessible queries.** `getByRole`/`findByText` for the
   present state; `queryBy*` returning `null` for what must be absent. Crucially, assert the
   empty render is NOT the error render and vice versa — they are distinct (Rule 4). Use
   `findBy*` for anything that resolves after an async tick. See `references/rtl-state-tests.md`.

6. **Make loading and error genuinely reachable.** Loading must be asserted before the query
   settles (assert synchronously, then `await` resolution); error needs retries disabled or a
   rejecting mock. A loading test that the success data races past is testing nothing. See
   `references/test-harness.md`.

7. **Confirm the four-test floor and the gate.** The suite has at minimum one passing test per
   state and runs in CI. If you discovered a state the component renders that CLAUDE.md/Rule 4
   did not anticipate (e.g. a partial/stale state), record the convention in `DECISIONS.md`.

---

## Composes With

- **Pairs with:** `vertical-slice` — it builds the four states; this skill writes the suite
  that proves they exist and stay. Run them together on every new data-bound component.
- **Pairs with:** `a11y-gate` — RTL accessible queries (`getByRole`) overlap with a11y, but
  axe/contrast/keyboard assertions belong there; this skill stops at "the state renders."
- **Runs against:** a component produced by `vertical-slice` or `shadcn-compose`.
- **Hands off:** cross-route/browser behavior → `playwright-e2e`; automated axe in CI →
  `ci-a11y-test`; a missing state in the component itself → `vertical-slice`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked to test `ProjectList`, the naive agent mocked `api.project.list.useQuery`
and wrote exactly two `it(...)` blocks — loading and success — leaving the empty (`data === []`)
and error (`isError`) states with no test at all, a direct Rule 4 gap. It also cast the mock
loosely instead of typing it against the procedure's inferred output, so a return-type drift
would never fail the suite (Rule 1):

```ts
const useQueryMock = api.project.list.useQuery as unknown as ReturnType<typeof vi.fn>;
// only "loading" and "success" it() blocks; no empty, no error
expect(screen.getByText(/loading/i)).toBeInTheDocument();
```

**Failure class (confirmed).** Left to its own devices, the agent equates "test the component"
with "assert the happy-path render," shipping a green suite that proves only one of four states
and leaves loading/empty/error free to regress. It compounds this by `as`-casting the hook mock,
breaking the type chain so fixture drift goes undetected, and asserting on microcopy rather than
stable accessible queries.

---

## Examples

**Input:** "Test the `InvoiceTable` that reads `api.invoice.list.useQuery()`."
**Output:** Four tests under a shared harness. Loading: mock returns `{ isPending: true }` →
`getByRole('status')` (the skeleton) present, synchronously. Empty: returns `{ data: [], isPending: false }` → the empty CTA text via `findByText(/no invoices yet/i)`, and
`queryByRole('row')` is `null`. Error: returns `{ isError: true, error }` with retries off →
`findByRole('alert')` present, empty-CTA text absent. Success: returns typed rows (built from
`inferProcedureOutput<...>`) with `amountCents` formatted at the display edge (Rule 5) →
each invoice number via `getByText`. No `as any`; queries are role/text based.

**Input:** "We only have a success test for `Dashboard`; add the rest."
**Output:** Add three `it(...)` blocks — loading, empty, error — using the existing harness;
assert the empty and error renders differ (empty shows the CTA, error shows the alert). Fixture
types pulled from the procedure's inferred output so the rename that broke prod would have failed
here.

**Input:** "Test a component that calls two queries (user + their tasks)."
**Output:** Drive the combined state — first settled + second `isPending` renders loading;
second returning `[]` renders the empty-tasks state with the header present. Each query is
mocked independently and typed from its own procedure output.

---

## Edge Cases

- **The component has no error state to test** → stop; that is a Rule 4 hole in the component.
  Fix it in `vertical-slice`, then test it. Do not write a passing test that asserts the crash.
- **Empty and error currently render the same thing** → treat as a defect, not a test shortcut.
  The component must distinguish them; write the two tests that force the distinction.
- **Loading flashes away before you can assert it** → disable retries and assert the loading
  render synchronously (before `await`), or use a deferred/never-resolving mock for that test.
- **The component is a Server Component (no hooks, awaits data directly)** → RTL renders client
  trees; test the extracted client child that owns the states, or cover it via `playwright-e2e`
  instead of forcing RTL onto a server boundary.

## References

- `references/rtl-state-tests.md` — the four-test template per component: forcing each query
  status, accessible-query assertions, the empty-vs-error distinction, and typing fixtures from
  `inferProcedureOutput` / Drizzle `$inferSelect`.
- `references/test-harness.md` — Vitest + jsdom + Testing Library setup, the
  `QueryClientProvider` wrapper with retries off, mocking the tRPC/React Query hook, and stubbing
  Clerk's `useAuth`/`useUser`.

## Scripts

`scripts/` is reserved. A signal that would justify one: a check that, given a component file,
asserts its test file contains a case for each of the four state keywords (loading/empty/error/
success) — a structural Rule 4 floor. Until that proves worth maintaining, this skill stays
script-free.
