---
name: ci-a11y-test
description: >
  Run axe automatically in CI over the app's key routes — the automated half of the a11y-gate
  definition of done. Scans the real rendered DOM in a browser (so CSS-token contrast and edge
  middleware are exercised), authenticates through Clerk to reach protected routes, asserts each
  route's four states (Rule 4) where they differ, and fails the build on any violation instead
  of printing a green report. Encodes what generated a11y CI gets wrong: scanning only the
  landing page, never blocking the build, and mistaking a passing axe run for "accessible."
  Use when: "a11y in ci", "automated accessibility test", "axe in ci", "accessibility gate".
  Do NOT use for: the manual WCAG 2.2 AA review axe cannot do — meaningful alt text, reading
  order, keyboard flows (use a11y-gate); or end-to-end behavior of a flow (use playwright-e2e).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the a11y-CI failure class: a report-only axe step that scans
    one public route, never blocks the build, and gets read as full accessibility coverage.
    Baseline observed (clean-room capture).
---

# ci-a11y-test

Stand up the automated accessibility check that runs on every CI run: axe over the project's
key routes, in a real browser, build-failing on violations. This is the **machine half** of the
`a11y-gate` definition of done — it catches the ~30–50% of WCAG issues axe can detect and hands
the rest to `a11y-gate`'s manual pass. The failure class it encodes is a11y CI theater: a step
that is always green because it scans nothing real and blocks nothing.

Spine and rules live in `../../CLAUDE.md`. This skill obeys them and does not restate them.

---

## Non-Negotiable Rules

A bad a11y check is worse than none — it certifies inaccessible UI as fine and stops anyone
looking again:

- **Never make the axe step non-blocking.** A violation must exit non-zero and fail the job.
  A `continue-on-error` / warn-only step trains the team to ignore the output.
- **Never scan only the homepage.** Walk the full key-route inventory, including
  **authenticated** routes, and assert each route's distinct states (Rule 4) — an error state
  with no live region or an empty state with a contrast-failing illustration ships otherwise.
- **Never treat a passing axe run as "accessible."** Automated rules catch a minority of WCAG;
  the result is "no detectable violations," not conformance. The manual items are `a11y-gate`.
- **Never silence a rule to go green.** Each disabled rule or node exclusion needs a written
  justification and a tracking entry — never a blanket `disableRules` to clear the board.

Refuse these rationalizations: "axe passes, so it's accessible"; "just scan the landing page";
"make it a warning so it doesn't block the merge"; "disable color-contrast, design will fix it."

---

## When to Use

- Wiring axe into CI so accessibility regressions fail the build, not a later manual pass.
- Adding automated a11y coverage for a new key route or a newly protected (authed) route.
- Catching the machine-detectable WCAG 2.2 AA failures: contrast, missing labels/roles,
  invalid ARIA, missing form labels, document landmarks.
- Re-checking the four states (Rule 4) of a data-bound screen for a11y, not just the success DOM.

## When NOT to Use

- The manual WCAG review axe cannot do — alt-text meaning, reading order, keyboard traps,
  focus order → `a11y-gate` (this skill is its automated half).
- Driving and asserting a user flow's behavior end to end → `playwright-e2e`.
- Wiring the overall CI job graph / gate ordering → `ci-pipeline`.
- Generating the OKLCH palette whose contrast axe verifies → `design-tokens`.

---

## Procedure

1. **Pull the key-route inventory and auth needs (low).** List every route worth gating and
   mark which require a signed-in session. Reuse the critical-path list from `test-strategy`;
   do not invent a parallel route map. Record the inventory location in `DECISIONS.md`.
2. **Scan the real rendered app in a browser, not jsdom (medium).** Use `@axe-core/playwright`
   (`AxeBuilder`) against the built app so edge middleware runs and real CSS is present — axe's
   `color-contrast` rule needs computed styles your tokens produce. Reuse the `playwright-e2e`
   `webServer`/projects config rather than a second harness. See `references/axe-ci-setup.md`.
3. **Pin the WCAG 2.2 AA tag set (high — defines the floor).** `AxeBuilder().withTags([...])`
   with the `wcag2a/2aa/21a/21aa/22aa` tags so the run matches the `../../CLAUDE.md` AA floor;
   a default unscoped run drifts. See `references/axe-ci-setup.md`.
4. **Authenticate to reach protected routes (high — most routes are gated).** Reuse the Clerk
   `storageState` from `playwright-e2e`'s setup project (testing token, test-instance keys from
   the Zod-validated env — Rule 9). A check that only reaches public pages misses the app.
5. **Scan each route across its states, asserting zero violations (high — Rule 4).** For
   data-bound screens, drive empty/error via `page.route` over the tRPC call and analyze each
   distinct DOM, not just success. `expect(results.violations).toEqual([])`. See
   `references/axe-ci-setup.md`.
6. **Fail the build with a readable report (high).** Print each violation's rule id, impact,
   target nodes, and help URL; exit non-zero. A green-on-violation step is the failure this
   skill exists to prevent. See `references/triage-and-handoff.md`.
7. **Triage and hand off (medium).** Any suppression gets a justification + tracking entry in
   `DECISIONS.md`; route the residual manual WCAG items to `a11y-gate`. See
   `references/triage-and-handoff.md`.

---

## Composes With

- **Consumes:** `a11y-gate` — this is its automated half; `a11y-gate` owns the manual WCAG 2.2
  AA items axe cannot detect and interprets anything this surfaces.
- **Pairs with:** `ci-pipeline` (which sequences this gate into the job graph), `playwright-e2e`
  (shares the `webServer` config, Clerk `storageState`, and route map this scans over).
- **Runs against:** the assembled app from `t3-genesis` / `vertical-slice`, whose four states
  and `design-tokens` OKLCH contrast are exactly what axe verifies.
- **Hands off:** suppression justifications and the route inventory location → `DECISIONS.md`;
  manual review items → `a11y-gate`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** The naive output stood up a GitHub Actions job that builds the app, runs
`npm run start`, and points `pa11y-ci` (axe runner, WCAG2AA) at a hardcoded list of four
public-ish routes — including `/dashboard`, which under Clerk redirects to sign-in, so the
scan silently audits the login page instead of the real authed UI. No authentication, no
per-route state coverage, and only the automated half with no acknowledgement that manual
WCAG checks remain.

```json
"urls": [
  "http://localhost:3000",
  "http://localhost:3000/about",
  "http://localhost:3000/pricing",
  "http://localhost:3000/dashboard"
]
```

**Failure class (confirmed).** Generated a11y CI scans a hardcoded handful of public routes
without signing in, so protected routes — the actual product — go unscanned (a redirect to
sign-in is read as a pass), and only the success DOM is checked rather than each route's four
states (Rule 4). It also treats a green axe run as "accessible," ignoring the manual WCAG 2.2
AA review and the project's existing a11y conventions.

---

## Examples

**Input:** "Add axe to CI for the dashboard."
**Output:** An `a11y.spec.ts` run by the existing Playwright `webServer`, depending on the Clerk
`setup` project for `storageState`; a loop over the route inventory that, per route, builds
`new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'])`,
visits the route, and `expect(results.violations).toEqual([])`; for `/dashboard` it also routes
`**/api/trpc/metrics.list**` to an empty result and to a 500 and re-scans each state. A GitHub
Actions job runs it headless, uploads the HTML report artifact, and fails the build on any
violation — no `continue-on-error`.

**Input:** "Why is the a11y job passing but the page is unreadable?"
**Output:** Diagnosis that the run is jsdom-based, so `color-contrast` never evaluated; the fix
migrates to `@axe-core/playwright` against the built app so the OKLCH `design-tokens` are
computed and the contrast violation is caught — with a note that the reading-order failure
belongs to `a11y-gate`, not this gate.

---

## Edge Cases

- **A genuine axe false positive (e.g. a known Radix/shadcn pattern axe misflags)** → exclude
  that specific node with `.exclude(selector)` plus a code comment and a `DECISIONS.md` entry,
  never a global `disableRules`.
- **Contrast violations trace to the palette, not the markup** → fix at the source with
  `design-tokens` (regenerate the OKLCH ramp to AA) rather than overriding color inline (Rule 3).
- **A route's content is fully dynamic and has no stable empty/error path** → seed deterministic
  data via a test-only helper (pairs with `drizzle-seed`) so the scanned DOM is reproducible.
- **The team wants axe results as PR annotations, not just a failed job** → emit the report as a
  CI artifact / SARIF in addition to the non-zero exit; do not downgrade the exit to a warning.

---

## References

- `references/axe-ci-setup.md` — `@axe-core/playwright` `AxeBuilder` wiring: WCAG 2.2 AA tag
  set, the route-inventory scan loop, reusing the Clerk `storageState`, driving the four states
  with `page.route`, and the GitHub Actions job that fails on violations.
- `references/triage-and-handoff.md` — reading axe output (impact, help URLs), the
  automated-vs-manual WCAG split, justified suppressions, the contrast→tokens path, and the
  handoff contract to `a11y-gate`.

## Scripts

- Reserved (`scripts/.gitkeep`). A `print-axe-report.mjs` formatting violations into a
  CI-annotation/SARIF block would earn its place once more than one project consumes that
  format; until then the inline reporter in `references/axe-ci-setup.md` suffices.
