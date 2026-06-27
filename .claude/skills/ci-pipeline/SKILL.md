---
name: ci-pipeline
description: >
  Wire the project's GitHub Actions pipeline so every quality gate runs on every PR and
  blocks merge — typecheck, lint, the rule-audit suite, coverage, the a11y axe run, the
  perf budget, and the dependency scan — each as a job that fails the build on a non-zero
  exit, never a report-only step. Encodes what generated CI gets wrong: gates that print
  green but never fail, `continue-on-error` smuggled in, jobs not wired to branch protection,
  and secrets pasted into the workflow. The pipeline is the enforcement surface for the whole
  definition of done.
  Use when: "set up ci", "github actions", "ci pipeline", "ci gates", "fail the build".
  Do NOT use for: running or interpreting a single gate (use rule-audit, coverage-gate,
  perf-budget-check, ci-a11y-test, dependency-audit); or deploying to the edge (use
  deploy-edge).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the "green but toothless CI" failure class: gate steps that
    swallow their exit code, never gate the merge via branch protection, leak secrets into the
    workflow, or run only on push to main so PRs are never checked.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# ci-pipeline

The pipeline is where the definition of done in `../../CLAUDE.md` (Quality gates) stops being
advice and becomes enforcement. This skill wires the GitHub Actions workflow that runs each
gate as a build-failing job on every pull request and makes those jobs required for merge. It
does not reimplement any gate — it orchestrates the sibling gates and guarantees a failing one
turns the PR red and unmergeable.

---

## Non-Negotiable Rules
- **Never** add `continue-on-error: true`, `|| true`, or a swallowed exit code to a gate job.
  A gate that cannot fail the build is not a gate.
- **Never** leave a gate job unrequired in branch protection. A red job that does not block
  merge is theater (Rule 9 of the suite's "definition of done": all three gates must pass).
- **Never** put a secret literal in the workflow YAML or echo `secrets.*` to logs — use
  `${{ secrets.NAME }}` in `env:` only, masked, edge-relevant ones via repo/environment
  secrets (CLAUDE.md Rule 9, no secrets client-side extends to CI logs).
- **Never** gate only `on: push` to a branch — PRs merge unchecked. Gate `on: pull_request`.

Refuse these rationalizations: "report-only first, enforce later" (later never comes), "the
author will read the logs" (they won't, a green check is trusted), "we'll require the jobs in
branch protection after merge" (the unprotected window is when bad code lands), "just one
`continue-on-error` so the PR isn't blocked" (that is the entire failure).

---

## When to Use
- Standing up CI for a fresh repo (right after `t3-genesis` seeds the gate scripts).
- Adding a new gate job (a new sibling gate ships and must join the required set).
- A gate "passes in CI" but bad code still merged — the job isn't required or swallows exit.
- Converting a report-only or push-only workflow into PR-blocking enforcement.
- Tuning pipeline mechanics: dependency/build caching, the job matrix, concurrency, run order.

## When NOT to Use
- Running or interpreting one gate's output → that gate's own skill: `rule-audit`,
  `coverage-gate`, `perf-budget-check`, `ci-a11y-test`, `dependency-audit`.
- Shipping the built artifact to the edge runtime → `deploy-edge` (CI gates, CD deploys).
- Deciding test layers / what to cover → `test-strategy`; the threshold itself → `coverage-gate`.
- Re-verifying perishable thresholds or action versions → `perishable-refresh`.

---

## Procedure

1. **Inventory the gates this repo has, and their exit-code contract (low cost, do first).**
   Each gate is a script with a defined exit code (suite convention: exit code = number of
   findings, 0 = clean). List them: typecheck (`tsc --noEmit`), lint, the rule-audit scan,
   `coverage-gate`, `ci-a11y-test`, `perf-budget-check`, `dependency-audit`. A job runs one
   gate's script; CI fails when it exits non-zero. See `references/workflow.md`.

2. **Trigger on `pull_request` (and `merge_group` for a merge queue), not push-only (low
   cost).** PRs are the enforcement point. Add `on: push` to the default branch only as a
   post-merge signal, never as the sole trigger. Add `concurrency` keyed to the ref with
   `cancel-in-progress` so superseded runs stop. See `references/workflow.md`.

3. **Structure jobs for fast feedback, then enforcement (medium cost).** Cheap broad-failure
   jobs first (typecheck, lint) so an obvious break fails in under a minute; heavier jobs
   (coverage, a11y browser run, perf) after. Use `needs:` only for real dependencies —
   independent gates run in parallel. Cache the package store and Next build on the lockfile.
   The full job graph is in `references/workflow.md`.

4. **Make every gate build-failing, with no escape hatch (high cost — this is the whole point).**
   Each step runs the gate script directly so its non-zero exit fails the job. Audit for the
   anti-patterns: `continue-on-error`, `|| true`, `set +e`, a wrapping step that captures and
   discards the code, or a gate downgraded to `warning`. The build-failing checklist is in
   `references/gate-wiring.md`. Record any deliberate non-blocking exception in `DECISIONS.md`.

5. **Provision secrets and env as masked CI secrets, edge-shaped (medium cost).** Gates that
   render the app (a11y, perf) need the same edge env the app needs — Clerk keys, the DB
   driver URL — supplied via `secrets.*` in `env:`, never inlined, never `echo`ed (CLAUDE.md
   Rule 9). Validate env at job start with the same Zod env schema the app uses (Rule 8) so a
   missing var fails loudly, not silently. See `references/gate-wiring.md`.

6. **Make the gate jobs *required* in branch protection (high cost — the most-skipped step).**
   A red job that does not block merge changes nothing. Mark each gate job's check as required
   on the default branch (via `gh api` ruleset or branch protection), require the branch
   up to date, and require PR review. Verify with a deliberately failing PR. Steps and the
   `gh` commands are in `references/gate-wiring.md`.

7. **Verify end to end with a known-bad PR (medium cost).** Open a PR that violates one rule
   per gate (an `any` for rule-audit, an unsized image for a11y, a dropped test for coverage)
   and confirm each turns the check red and the PR unmergeable. A pipeline never tested against
   failure is assumed broken. Hand the artifact to `deploy-edge` only after all checks are green.

---

## Composes With
- **Consumes:** `rule-audit`, `coverage-gate`, `perf-budget-check`, `ci-a11y-test`,
  `dependency-audit` — each is a job in this pipeline; this skill owns their wiring, not their
  logic.
- **Runs against:** every PR's diff and built app on the edge-equivalent CI runner.
- **Hands off:** the green, gated artifact to `deploy-edge` for shipping; threshold/version
  staleness to `perishable-refresh`.
- **Pairs with:** `t3-genesis` (seeds the gate scripts and an initial workflow this skill
  hardens), `test-strategy` (defines what the coverage and e2e jobs actually run).

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)
> Encoded failure class, not a captured transcript; replace once observed in the wild.

**Failure class encoded:** asked to "set up CI", the agent emits a plausible-looking workflow
that is green and toothless. Concrete defects that ship: (1) gate steps wrapped in
`continue-on-error: true` or `npm run audit || true`, so a failing gate still reports success;
(2) the workflow triggers `on: push` to `main` only, so PRs merge entirely unchecked; (3) the
jobs are never marked required in branch protection, so a red check does not block merge;
(4) Clerk/DB secrets pasted as plaintext into `env:` and `echo`ed for "debugging", leaking them
to logs (violates Rule 9); (5) only `tsc` and `lint` are wired — coverage, a11y, perf, and the
dependency scan are absent, so the "definition of done" gates never run at all.

---

## Examples

**Input:** "Set up CI for this repo." (fresh `t3-genesis` repo with gate scripts in
`package.json`.)
**Output:** A `.github/workflows/ci.yml` triggering `on: pull_request` + `merge_group`, with
`concurrency` cancel-in-progress. Jobs: `typecheck` and `lint` first (parallel, fast-fail),
then `rule-audit`, `coverage`, `a11y`, `perf-budget`, `deps` in parallel — each running its
gate script so a non-zero exit fails the job, none with `continue-on-error`. pnpm store + Next
build cached on the lockfile hash. Then the `gh api` ruleset commands to require all seven
checks on `main`, plus a known-bad PR to prove each blocks merge.

**Input:** "Our a11y gate runs in CI but a PR with a contrast failure still got merged."
**Output:** Diagnose the two likely causes: the `a11y` job has `continue-on-error: true` (never
reds the run), or it is green but not in the required-checks set (a red check doesn't block).
Remove the escape hatch, add the job to required checks with `gh api`, and verify with a PR that
reintroduces the failure. `ci-a11y-test` owns the axe logic; this skill makes its failure block
merge.

**Input:** "Add the dependency scan to CI."
**Output:** A `deps` job running the `dependency-audit` gate script on `pull_request` (exit code
gating the job) and added to required checks, plus an `on: schedule` weekly cron so new
advisories surface without a PR. Interpretation of findings stays with `dependency-audit`.

---

## Edge Cases
- **A gate is genuinely flaky (browser a11y/perf run)** → fix or quarantine the flake, never
  `continue-on-error` it; a non-deterministic required gate erodes trust in all of them.
- **External fork PRs can't read secrets** → secret-needing jobs (a11y/perf rendering with
  Clerk) won't run on forks; gate via a manual-approval `environment` or a maintainer label,
  never by disabling the gate.
- **Monorepo / changed-paths only** → path-filter jobs to skip unaffected packages, but a
  skipped *required* check blocks merge forever — use an aggregator job (`references/gate-wiring.md`).
- **Perf/a11y too slow for every PR** → run the heavy variant `on: schedule` or against a
  preview deploy, but keep a fast smoke variant on the PR; do not drop PR coverage entirely.

---

## References
- `references/workflow.md` — the annotated `ci.yml`: triggers, concurrency, the job graph,
  pnpm + Next caching, and where each sibling gate plugs in.
- `references/gate-wiring.md` — the build-failing checklist (exit-code contract, the
  `continue-on-error`/`|| true` anti-patterns), masked-secret/env handling, and the `gh api`
  branch-protection commands that make jobs required.

## Scripts
`scripts/` reserved. A script that reads the workflow YAML plus the branch-protection ruleset
and reports any gate job that is non-blocking or not-required (the two highest-value defects)
would justify one once the gate job names are stable across projects. Empty for now.
