---
name: playwright-e2e
description: >
  Drive Playwright end-to-end tests over the app's critical paths in a real browser:
  Clerk-authenticated flows (testing tokens to bypass bot detection, signed-in session reused
  via storageState), and Rule 4's four states (loading, empty, error, success) asserted in the
  live DOM through network interception. Uses web-first auto-retrying assertions and role-based
  locators so tests stay stable and accessible instead of flaky and happy-path-only.
  Use when: "e2e test", "playwright", "end to end", "test the user flow", "test sign in".
  Do NOT use for: testing a tRPC procedure in isolation (use trpc-integration-test), or
  deciding what to test and at what layer (use test-strategy).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the e2e failure class: flaky happy-path-only specs that fake
    or skip Clerk auth and never exercise the loading/empty/error states in the browser.
    Baseline observed (clean-room capture).
---

# playwright-e2e

Browser-level coverage of the critical paths a unit or integration test cannot prove: that a
real user can sign in through Clerk and that each data-bound screen renders all four states
(Rule 4) in the actual DOM. This skill encodes the two things generated e2e code gets wrong —
authenticating through Clerk on the edge stack, and forcing the non-happy states deterministically.

Spine and rules live in `../../CLAUDE.md`. This skill obeys them and does not restate them.

---

## Non-Negotiable Rules

These exist because a bad e2e suite passes, looks like coverage, and rots into ignored flake:

- **Never `page.waitForTimeout()` / hardcoded sleeps.** Use web-first assertions
  (`await expect(locator).toBeVisible()`) and `waitForResponse`; they auto-retry to the
  config timeout. Fixed sleeps are the #1 source of flake.
- **Never test only the success path (Rule 4 in the browser).** A critical-path spec asserts
  loading, empty, error, and success — drive empty/error by intercepting the tRPC call with
  `page.route`, not by hoping prod data happens to be empty.
- **Never run against production Clerk or a real user's credentials.** Use a Clerk *test*
  instance, `setupClerkTestingToken({ page })` to pass bot detection, and a dedicated test
  user signed in once via a `setup` project that saves `storageState`.
- **Never select by CSS class or `nth` (Rule 3-adjacent brittleness).** Locate by role/label/
  text (`getByRole`, `getByLabel`) — it survives restyles and doubles as an a11y signal.

Refuse these rationalizations: "a sleep fixes the flake"; "the happy path is the test";
"I'll just mock Clerk out entirely so I don't need a test instance"; "selecting `.btn-primary`
is fine."

---

## When to Use

- Adding e2e coverage for a critical path: sign-in/sign-up, checkout, the core create→view flow.
- Testing a **Clerk-authenticated** flow end to end in a real browser.
- Proving a data-bound screen renders all four states (Rule 4) as a user would see them.
- Catching regressions that only appear in the assembled app (routing, middleware, hydration).

## When NOT to Use

- Exercising a tRPC procedure's input/output/auth in isolation → `trpc-integration-test`.
- Deciding the test pyramid, what deserves e2e vs unit, or coverage targets → `test-strategy`.
- Auditing rendered output against axe / WCAG in CI → `ci-a11y-test`.
- Verifying the Clerk middleware/matcher/webhook wiring itself → `clerk-auth-flows`.

---

## Procedure

1. **Pull the critical-path list from `test-strategy` first (low).** e2e is the expensive top
   of the pyramid; only the flows `test-strategy` marked e2e get a spec here. Do not e2e what a
   `trpc-integration-test` already proves.
2. **Configure `playwright.config.ts` with a `webServer` and projects (medium).** Boot the real
   app (`next build && next start`, or dev) so the edge runtime and middleware run; add a
   `setup` project (auth) that the browser projects `dependsOn`. See
   `references/four-states-and-stability.md`.
3. **Stand up Clerk auth once, reuse it (high — Rule 9).** Call `clerkSetup()` in global setup,
   `setupClerkTestingToken({ page })` + `clerk.signIn()` in the setup project, then save
   `storageState` so each test starts signed in without re-driving the form. Test-instance keys
   come from the Zod-validated env, never hardcoded. See `references/clerk-auth-setup.md`.
4. **Write the happy path with role-based locators (medium).** `getByRole`/`getByLabel`/
   `getByText`, web-first `expect`. Assert the user-visible outcome, not internal state.
5. **Force the other three states by intercepting tRPC (high — Rule 4).** `page.route('**/api/trpc/**')`
   to delay (loading), return an empty result (empty), or `fulfill({ status: 500 })` (error),
   and assert each fallback renders. See `references/four-states-and-stability.md`.
6. **Make it deterministic before you commit (high).** No sleeps, no order-dependent state,
   seed/clean per test, `--repeat-each=5` locally to smoke out flake. A flaky spec is worse than
   no spec — it trains the team to ignore red.
7. **Wire into CI and hand off.** Run headless with retries=2 + trace-on-first-retry; pair the
   run with `ci-a11y-test`. Record any non-obvious fork (e.g. dev-server vs built) in `DECISIONS.md`.

---

## Composes With

- **Consumes:** `test-strategy` — the ranked critical-path list that decides which flows get an
  e2e spec at all.
- **Pairs with:** `ci-a11y-test` (axe over the same rendered routes in CI), `trpc-integration-test`
  (proves the procedure layer e2e specs sit on top of).
- **Runs against:** the assembled app from `t3-genesis` / `vertical-slice` — including
  `clerk-auth-flows`' middleware and the four states each `vertical-slice` component ships.
- **Hands off:** the dev-server-vs-built and test-instance forks → `DECISIONS.md`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked to write an e2e test for sign-in plus create-a-post, the naive agent
drove the real Clerk hosted UI per test with raw `process.env` creds, papered over the
resulting flake with hardcoded `page.waitForTimeout()` sleeps instead of web-first assertions
or `waitForResponse` on the tRPC mutation, selected by Clerk's internal markup
(`name=`/`has-text`) rather than roles, and asserted the success path only — no
loading/empty/error states, no DB cleanup of the `Date.now()` post it created.

```ts
await page.waitForTimeout(2000);
await page.fill('input[name="identifier"]', EMAIL);
await page.click('button:has-text("Continue")');
// ...
await page.click('button[type="submit"]');
await page.waitForTimeout(2000); // give the mutation time to round-trip
await expect(page.locator(`text=${title}`)).toBeVisible();
```

**Failure class (confirmed).** Generated e2e specs flake because they sleep instead of
awaiting real network/DOM state, drive Clerk's bot-protected UI per test instead of using
testing tokens + a reused `storageState` session, bind to brittle markup selectors, and prove
only the happy path while leaving real state behind. They go green locally and rot into
ignored CI flake.

---

## Examples

**Input:** "Write an e2e test for signing in and seeing the projects list."
**Output:** A `setup` project that `setupClerkTestingToken` + `clerk.signIn()` with the test
user and saves `storageState`; a `projects.spec.ts` (using that storage state) that visits
`/projects`, then in separate cases routes `**/api/trpc/project.list**` to (a) a delayed response
asserting `getByRole('status')` loading UI, (b) `{ result: { data: [] } }` asserting the empty
state copy, (c) `fulfill({ status: 500 })` asserting the error fallback + retry, and (d) the real
call asserting `getByRole('listitem')` rows — all four states (Rule 4) proven in the DOM.

**Input:** "Test the new-project form end to end."
**Output:** A spec that fills the RHF form by `getByLabel`, submits, `waitForResponse` on the
`project.create` mutation, and asserts the new row appears via web-first `expect` — plus a case
that routes the mutation to a 400 and asserts the inline field error renders, not a crash.

---

## Edge Cases

- **The flow depends on seeded data** → seed via a test-only tRPC/db helper in `beforeEach` and
  clean after; never depend on whatever happens to be in a shared DB. Pairs with `drizzle-seed`.
- **A third-party widget (Stripe/Clerk modal) lives in an iframe** → use `frameLocator`, and
  for payments prefer Stripe test mode over driving the real iframe where possible.
- **Edge middleware redirects an unauthenticated visit before the page loads** → assert the
  redirect to `/sign-in` as its own case; do not treat it as flake to be retried away.
- **A spec is genuinely flaky and you cannot stabilize it now** → quarantine with `test.fixme`
  and a tracking note, never paper over it with `waitForTimeout` or a bumped global timeout.

---

## References

- `references/clerk-auth-setup.md` — `@clerk/testing/playwright` wiring: `clerkSetup()` global
  setup, `setupClerkTestingToken` + `clerk.signIn`, the `setup` auth project, and `storageState`
  reuse with test-instance keys from the env.
- `references/four-states-and-stability.md` — `playwright.config.ts` with `webServer`/projects,
  intercepting tRPC with `page.route` to drive all four states, role-based locators, web-first
  assertions, and the flake-elimination + CI checklist.

## Scripts

- Reserved (`scripts/.gitkeep`). A `check-no-sleeps.mjs` that greps specs for `waitForTimeout`
  and CSS/`nth` locators would justify a script once the suite is large enough that manual
  `rule-audit`-style review misses them; until then this stays a review check.
