---
name: coverage-gate
description: >
  Wire test-coverage thresholds into Vitest and CI for the edge stack so the build fails when
  coverage drops below budget — and so the number measures something. Sets the v8 coverage
  provider, per-metric and per-file thresholds, a curated exclude list (generated migrations,
  config, type-only re-exports, scaffolds) that stops dead code from inflating the percentage,
  and a ratchet that only moves up. The gate is deterministic CI config, not a judgment pass.
  Use when: "coverage", "coverage threshold", "fail under coverage", "test coverage gate".
  Do NOT use for: building the whole CI pipeline — jobs, caching, matrix (use ci-pipeline); or
  deciding what to test and at which layer (use test-strategy).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the coverage-theater failure class: a high global percentage
    that proves nothing because generated code is counted, the wrong files are excluded to hit
    the number, and the threshold is never enforced in CI so it silently rots downward.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# coverage-gate

Turn a coverage percentage from a vanity metric into a build-failing budget. This skill owns the
Vitest `coverage` block and the one CI step that enforces it: which provider, which metrics, what
to exclude so the number reflects logic rather than scaffolding, and the ratchet that prevents
drift down. It is a deterministic gate, the same class as the performance budget in
`../../CLAUDE.md` — config that lives in the repo, not a per-PR judgment call. `test-strategy`
decides *what* to test; this skill makes the absence of those tests fail the build.

## Non-Negotiable Rules

- **Never** count generated or type-only files toward coverage. Drizzle migrations, `*.config.ts`,
  `**/*.d.ts`, `src/env.*`, barrel re-exports, and shadcn scaffolds dilute the number and let
  untested logic hide behind covered boilerplate — exclude them explicitly.
- **Never** lower a threshold to make a red build green. The ratchet only moves up; a drop means a
  test is missing, not that the budget is wrong. Use `coverage.thresholds.autoUpdate` to raise.
- **Never** report coverage without enforcing it. `--coverage` that prints a table but exits 0 is
  decoration; thresholds must be set so the run exits non-zero below budget, and CI must run it.
- **Never** chase a single global line-coverage number. Set `branches` and `functions` too, and
  add per-file thresholds for the high-risk modules (money math, auth/ownership helpers) so a
  90% global average can't bury an untested ownership check (Rule 2) or cents helper (Rule 5).

Refuse these rationalizations: "we'll turn on enforcement later," "exclude that file, it tanks the
number," "100% lines means it's tested," "just drop the threshold two points to unblock the PR."

## When to Use

- A repo has tests (`vitest-unit`, `trpc-integration-test`) but no coverage threshold, so the
  suite can rot without the build noticing.
- Coverage is reported but not enforced, or the global number is high while critical modules are
  untested.
- You are adding the coverage step to CI, or curating which files the percentage should count.
- A PR added logic with no test and you want the gate to catch that class going forward.

## When NOT to Use

- Building the broader CI pipeline — job graph, dependency caching, the test matrix, deploy gating:
  use **ci-pipeline** (this skill is one step inside it).
- Deciding which behaviors deserve tests and at which layer: use **test-strategy**.
- Writing the actual tests that move the number: use **vitest-unit**, **trpc-integration-test**,
  **playwright-e2e**.
- Wiring the deterministic performance budget (LCP/INP/CLS): that is a separate CI gate in
  `../../CLAUDE.md`, not coverage.

## Procedure

1. **Pick the provider and reporters once (low).** Use the `v8` coverage provider — native,
   fast, no instrumentation transform — with `text` (console) + `json-summary` (machine-readable
   for the CI comment) + `lcov` (artifact) reporters. See `references/coverage-config.md`.
2. **Curate the exclude list deliberately (high — wrong exclusions are how the number lies).**
   Exclude generated, config, and type-only files; keep all real logic in scope. Each exclusion is
   a decision: if you exclude something that contains a branch, justify it. See
   `references/exclusions-and-budget.md`.
3. **Set per-metric thresholds, not just lines (medium).** Configure `lines`, `functions`,
   `branches`, and `statements`. Branches is the honest one — it catches the unhit `else` and the
   skipped error path that line coverage rewards anyway (the four-states gap, Rule 4). See
   `references/coverage-config.md`.
4. **Add per-file floors for high-blast-radius modules (high — Rule 2/5 live here).** A global
   average hides untested money math and ownership checks. Set stricter per-file thresholds (via a
   glob key under `thresholds`) on the cents helpers, the auth/ownership functions, and shared Zod
   schemas. See `references/exclusions-and-budget.md`.
5. **Set the budget from current reality, then ratchet (medium).** Start at the measured number
   rounded down, not an aspirational 90%. Turn on `autoUpdate` so green runs raise the floor; a
   red run means write the test, never lower the floor. Record the starting budget and ratchet
   policy in `DECISIONS.md`.
6. **Enforce it in CI as a build-failing step (high — unenforced = decoration).** Run
   `vitest run --coverage` in the test job; the non-zero exit on a threshold miss fails the build.
   Optionally post the `json-summary` as a PR comment. See `references/coverage-config.md`. The
   job graph that contains this step is owned by `ci-pipeline`.

## Composes With
- **Consumes:** `test-strategy` (its layer allocation tells you which modules deserve per-file
  floors and what the realistic global budget is).
- **Pairs with:** `ci-pipeline` (owns the job graph; this skill is the coverage step inside it),
  `vitest-unit` / `trpc-integration-test` (write the tests that satisfy the gate).
- **Runs against:** the Vitest suite across `src/` business logic and procedures.
- **Hands off:** a failing gate to whoever writes the missing test — never to a lowered threshold.

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> This is the encoded failure *class*, not a captured transcript. Replace it with a real
> transcript once one is observed.

**Failure class encoded:** Asked to "add coverage thresholds," the agent ships:

- a single global `lines: 80` threshold and nothing for `branches`/`functions`, so every unhit
  `else`, error path, and empty-state render (Rule 4) counts as covered as long as the line ran.
- no `exclude` list, so generated Drizzle migrations, `*.config.ts`, `**/*.d.ts`, and shadcn
  scaffolds are counted — inflating the percentage with code that has no logic to test.
- `--coverage` added to the local script but never wired into CI, or wired with a reporter only,
  so the threshold is printed and the build still exits 0 below budget.
- a threshold "fixed" by excluding the module that fails it (the cents helper, the ownership
  function), hiding exactly the Rule 5 / Rule 2 logic the gate exists to protect.
- a number that drifts downward over months because there is no ratchet, so the gate that looked
  green at setup quietly permits regressions.

## Examples

**Input:** "Add a coverage gate to our Vitest setup." → **Output:** a `coverage` block in
`vitest.config.ts` with `provider: "v8"`, `reporter: ["text", "json-summary", "lcov"]`, an
`exclude` extending the defaults with `src/db/migrations/**`, `**/*.config.*`, `**/*.d.ts`,
`src/env.*`, and barrel files; `thresholds` with `lines`/`functions`/`branches`/`statements` set
from the measured baseline and `autoUpdate: true`; plus a CI step running `vitest run --coverage`.

**Input:** "Our coverage is 91% but the money math broke in prod." → **Output:** global average was
hiding it — add a per-file threshold under `thresholds` keyed to `src/lib/money/**` at `branches:
100`, run `--coverage` to expose the uncovered rounding branch, and route the missing case to
`vitest-unit` (Rule 5). The 91% global stays; the specific floor makes the gap fail the build.

**Input:** "The coverage job passes but tests can regress." → **Output:** the step printed a table
and exited 0 — set `thresholds` (not just reporters) so Vitest exits non-zero below budget, confirm
the CI job surfaces that exit, and enable `autoUpdate` so the floor ratchets up on green runs.

## Edge Cases
- When a file must be excluded but contains a branch → don't silently drop it; add an
  `/* v8 ignore next */` on the specific unreachable line instead, and record the exclusion in
  `DECISIONS.md` so it isn't mistaken for untested logic.
- When the baseline is low and a 80% target would block all work → set the threshold at the current
  measured floor and let `autoUpdate` ratchet; a realistic enforced gate beats an aspirational
  ignored one.
- When integration tests run in a separate job from unit tests → merge coverage with
  `coverage.reportsDirectory` per job + a combine step, or accept per-job thresholds; do not let a
  split suite produce two partial numbers that each look low.
- When generated route/`.next` or Storybook files appear in the report → they belong in `exclude`,
  not in the percentage; treat their appearance as a stale exclude list, not a coverage drop.

## References
- `references/coverage-config.md` — the Vitest `v8` coverage block (providers, reporters,
  thresholds, per-file globs, `autoUpdate`) and the CI step that makes a miss fail the build, with
  real config.
- `references/exclusions-and-budget.md` — what to exclude on this stack and why, the high-risk
  modules that get per-file floors (money/ownership/Zod), and the ratchet policy.

## Scripts
Reserved; empty for now. A wrapper that diffs `coverage/coverage-summary.json` against the
committed budget and posts a per-file delta as a PR comment would justify one once the CI output
format is fixed and `ci-pipeline` exposes a comment hook.
