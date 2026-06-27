---
name: load-and-mutation-testing
description: >
  Two advanced test types ABOVE the unit/integration/e2e pyramid on the edge stack: (1) load/stress
  testing with k6 or Artillery against a deployed preview — realistic concurrent traffic, p95/p99
  latency + error-rate thresholds (never means), pushing past peak to find the edge-function
  concurrency and serverless-DB connection ceiling; (2) mutation testing with Stryker on the unit
  suite to measure test QUALITY, because a green, high-coverage suite with a low mutation score is
  false confidence. Both run on a schedule / pre-release in CI, not every PR, because they cost real
  money and minutes. Notes chaos/resilience as the adjacent idea.
  Use when: "load test", "stress test", "k6 / artillery", "mutation testing", "stryker",
  "test quality / is my coverage real", "p99 under load".
  Do NOT use for: the field Core Web Vitals budget (use perf-budget-check); choosing the
  unit/integration/e2e split (use test-strategy); a single micro-benchmark of one function
  (use benchmark-harness).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the advanced-testing failure class: load tests judged on the
    mean instead of p95/p99, pointed at prod with no traffic model / threshold / spend plan, and
    "our coverage is high so our tests are good" — equating coverage % with test quality instead
    of measuring it with a mutation score. Baseline observed (clean-room capture).
---

# load-and-mutation-testing

The two test types the pyramid skills (`test-strategy`, `vitest-unit`, `playwright-e2e`) don't cover,
sitting *above* the pyramid and run *after* it is green: **load/stress** (does the deployed system
hold realistic concurrent traffic within latency + error budgets, and where is its ceiling?) and
**mutation** (would the green unit suite actually fail if the code broke?). Both have a seductive
false-confidence failure: a load test reported as a fast *average* hides the slow p99 tail real users
hit, and a 95%-coverage suite can still miss a third of injected bugs.

The spine and nine rules live in `../../CLAUDE.md`; this skill leans on the CI perf budget and the
cost discipline (`spend-cap`) without restating them.

---

## Non-Negotiable Rules

These two test types fail silently — they produce a green check that *means nothing* — so these
are hard lines:

- **Never judge a load test by the mean/average.** Assert and report **p95/p99** latency (and max)
  plus **error rate** as explicit thresholds. A mean launders a failing tail into a passing number —
  the percentile discipline `perf-budget-check` enforces for field vitals.
- **Never equate coverage % with test quality.** A line *executed* (coverage) is not a regression in
  it *caught* (mutation score). High coverage + low mutation score = tests that run the code without
  asserting on the result. Measure quality with Stryker, don't assume it.
- **Never load-test without a plan:** a defined target (a prod-scaled **preview**, not unannounced
  production), a realistic traffic model, explicit pass/fail thresholds, and a **spend cap** for the
  invocations/compute the test burns. An unthrottled load test against prod is an outage you caused
  and a bill you signed.
- **Never run these on every PR.** Both are expensive (load burns money, mutation burns minutes) —
  scheduled / pre-release gates, not per-commit checks.

Refuse these rationalizations: "coverage is 95%, the tests are obviously good" · "just average the
response times" · "we'll point it at prod, it's a quick test" · "run the full mutation suite on
every push so we catch it early" · "p50 looks fine, ship it."

---

## When to Use
- Pre-launch / pre-release: proving the deployed app holds expected peak traffic within a latency
  and error budget.
- Capacity planning: finding the edge-function concurrency and serverless-DB (Neon/Turso)
  connection/compute ceiling *before* a campaign blast does.
- Auditing whether a green, high-coverage unit suite actually catches regressions, and deciding which
  high-blast-radius modules earn mutation testing (with per-module score thresholds).
- Standing up a scheduled (nightly/weekly) or pre-release CI job for either.

## When NOT to Use
- The field Core Web Vitals budget — LCP/INP/CLS at p75 from **real users** → `perf-budget-check`
  (synthetic generated load ≠ field RUM; different data, complementary verdicts).
- Choosing the unit/integration/e2e allocation → `test-strategy` (this runs above that pyramid).
- Timing a single function / picking a query shape or driver → `benchmark-harness`.
- Writing the unit tests mutation testing grades → `vitest-unit`; the e2e flows load replays →
  `playwright-e2e`.

---

## Procedure

1. **Name the question and confirm it sits above the pyramid (low cost, do first).** Load/stress =
   "does the *deployed* system hold N concurrent users within latency + error budgets, and where
   does it break?" Mutation = "would my *green* unit suite fail if the code regressed?" Neither
   replaces the pyramid — they run after it is green (`test-strategy`). Want field CWV →
   `perf-budget-check`; one function's speed → `benchmark-harness`.

2. **For load: model realistic traffic against a prod-scaled preview, never unannounced prod
   (high cost — the wrong target is an incident).** Pick k6 (JS, threshold-native) or Artillery;
   script the flows `playwright-e2e` already exercises (sign-in → core action → read) with think-time,
   ramp **stages**, and a virtual-user or arrival-rate profile matching expected peak. Run against a
   deployed **preview/staging** scaled like prod — localhost has no edge cold-start and no real driver
   RTT, so it proves nothing. See `references/load-testing.md`.

3. **Assert percentiles and error rate as thresholds, not means (high cost — the core
   discipline).** Set pass/fail thresholds on p95/p99 latency and error rate (e.g.
   `http_req_duration: p(95)<400, p(99)<800`, `http_req_failed: rate<0.01`); the run fails the gate
   when any breaches. Same tail-not-mean rule `perf-budget-check` applies to field vitals.

4. **Stress past peak to find the ceiling — and cap its spend (medium cost, ties to budget).** Ramp
   beyond peak until something breaks: the edge-function concurrency limit, then the serverless
   driver's connection/compute ceiling (Neon/Turso have finite edge connections). **Record** the
   breaking VU count and the bottleneck so capacity can be raised. Coordinate with `spend-cap` first —
   load + stress burn real invocations, function-duration, and DB compute, so the test can trigger the
   very bill it's meant to prevent. See `references/load-testing.md`.

5. **For mutation: run Stryker on the unit suite, scoped to modules that matter (medium cost).**
   Stryker mutates the source (flips conditionals, swaps operators, removes statements) and re-runs
   Vitest; a **surviving** mutant is a change your tests didn't catch. Scope to high-blast-radius pure
   logic — money math/allocation (Rule 5), ownership predicates (Rule 2), UTC conversion (Rule 6), Zod
   refinements (Rule 8) — not the whole tree (whole-repo mutation is hours). See
   `references/mutation-testing.md`.

6. **Read the mutation score as the signal coverage can't give, and act on survivors (medium
   cost).** Coverage says a line ran; the mutation score says a regression in it would be caught. A
   high-coverage / low-mutation-score module is false confidence — execution without assertion. Triage
   every survivor: add the missing assertion, or mark a genuinely *equivalent* mutant with a reason
   (interrogate first — most are missing assertions). Threshold **per scoped module**, not a global %.

7. **Wire both as scheduled / pre-release CI gates, and record the call (low cost, high leverage).**
   Load nightly/weekly or in the pre-release pipeline; mutation on changed/high-value modules per
   release — never per-PR. Record target env, thresholds, and cadence in `DECISIONS.md` (numbers
   perish — `perishable-refresh` re-checks them). **Chaos/resilience** testing (injecting failure —
   killing a DB connection, adding latency, forcing a region failover) is the adjacent third idea:
   same above-the-pyramid placement and cadence; note it as a follow-on, don't fold it in here.

---

## Composes With
- **Consumes:** `test-strategy` (the pyramid must be green first — these sit above it), `vitest-unit`
  (the unit suite mutation testing grades), `playwright-e2e` (the critical flows load scripts replay).
- **Pairs with:** `perf-budget-check` (load = synthetic latency under *generated* concurrency;
  perf-budget = field CWV p75 from *real* users — different data, complementary verdicts),
  `spend-cap` (load/stress burn metered invocations + DB compute; the cap is the backstop).
- **Hands off:** a single function's speed → `benchmark-harness`; the field CWV reading →
  `perf-budget-check`; tool/threshold staleness → `perishable-refresh`.

---

## Baseline failure (observed 2026-06-27)

> Captured without this skill (a fresh general-purpose agent, told not to read `.claude/` or
> `CLAUDE.md`): "we have unit/integration/e2e tests — how do we load-test the app and check our tests
> are actually good?" The imagined catastrophe (means not percentiles, coverage = quality, never
> mentions mutation) did NOT occur — a capable base model clears that bar. A **narrower** failure
> class was confirmed.

**Observed run.** A genuinely competent answer: k6 with a staged ramp + soak, percentile thresholds
**done right** (`p(95)<400`, `p(99)<800`, `http_req_failed rate<0.01`) and an explicit "the mean is
the wrong measure"; StrykerJS scoped to the business-logic layer with a `break` threshold and a clear
"coverage tells you what ran; mutation tells you what's actually checked"; both on a nightly/pre-release
cadence, not per-PR. The percentile discipline and coverage-≠-quality insight were **not** missing —
but three load-bearing disciplines were:

```js
// runs soak + stress "against a production-like environment", raw BASE_URL + TOKEN —
//   no preview-vs-prod rule, no off-peak/kill-switch/sign-off if it is prod
// "watch the DB side (connection saturation, slow queries)" — a watch-item, never a
//   recorded breaking-VU / ceiling deliverable for capacity planning
// nowhere: the test itself burns metered invocations + DB compute — no spend cap at all
```

**Failure class (confirmed, narrowed).** Not "judges on the mean / equates coverage with quality" —
the base model clears both. The narrower gaps: (1) **zero spend/cost plan** — soak + stress against a
prod-like target with no account of the metered invocations + DB compute burned, no `spend-cap`;
(2) **prod-vs-preview safety left ambiguous** — "a production-like environment" with a bare
`BASE_URL`/`TOKEN` and no off-peak/kill-switch/sign-off, so a teammate could point it at prod;
(3) **the ceiling is a watch-item, not a deliverable** — "watch the DB side" rather than a recorded
breaking VU count + bottleneck. This skill adds exactly that rigor: a capped, preview-targeted run
with the ceiling written down.

---

## Examples

**Input:** "We launch next week — how do we know it holds up under traffic, and that our tests are
any good?"
**Output:** Two jobs. **Load:** a k6 script replaying sign-in → create → list against the **preview**
deploy, ramping to expected-peak VUs, thresholds `http_req_duration p(95)<400 / p(99)<800` and
`http_req_failed rate<0.01`, plus a stress stage past peak to find the edge-concurrency + Neon
connection ceiling — budget capped via `spend-cap` first. **Test quality:** Stryker on `src/lib/money`
and the ownership predicates, target score ≥80, fix survivors. Both a **pre-release** job, not per-PR.
Field CWV stays with `perf-budget-check` post-launch.

**Input:** "Our coverage is 94% — are our tests good?"
**Output:** Coverage ≠ quality. Run Stryker on the high-value modules; if the score is, say, 61% while
coverage is 94%, roughly a third of injected bugs survive — the tests *execute* the code but don't
*assert* on the result. Triage the survivors (add the missing assertions), set a per-module score
threshold. Coverage stays a floor (`coverage-gate`); the mutation score is the real signal.

**Input:** "Marketing is blasting a campaign Tuesday — will the app fall over?"
**Output:** A **stress** test, not a budget read. Model the spike arrival rate against a prod-scaled
preview, ramp past the expected surge, watch p99 and error rate climb to find the ceiling (edge
concurrency first, then DB connections/compute). Report the breaking VU count + bottleneck so capacity
can be raised ahead of Tuesday. Cap the test's own spend (`spend-cap`) first.

---

## Edge Cases
- **No preview/staging env scaled like prod** → don't load-test localhost and call it representative
  (no cold-start, no real driver RTT); stand up a prod-scaled preview, or scope the test to
  *relative* regression vs a previous run on the same env, and say so.
- **Mutation run takes hours on the whole repo** → scope to changed / high-value modules (Stryker
  incremental + `mutate` globs); whole-tree mutation at most once per release. Don't "make it
  affordable" by lowering it to per-PR on everything — scope it instead.
- **A surviving mutant is genuinely equivalent** (e.g. `<=` vs `<` on an unreachable bound, no
  behavior change) → mark it ignored with a reason; don't contort a test to kill it. But interrogate
  first — most "equivalent" mutants are actually a missing assertion.
- **The load test truly must hit prod** (no representative env exists) → only with an explicit plan:
  an off-peak window, a `spend-cap`, rate ceilings, stakeholder sign-off, and a kill switch — all
  recorded in `DECISIONS.md`. Unplanned prod load is a self-inflicted incident.

---

## References
- `references/load-testing.md` — k6 vs Artillery, traffic modeling (VUs/arrival rate, ramp stages,
  think-time), the percentile + error-rate thresholds, finding the edge-concurrency / DB-connection
  ceiling, target-environment rules, and the `spend-cap` coordination.
- `references/mutation-testing.md` — Stryker on Vitest, coverage vs mutation score, the mutation
  operators, scoping to high-blast-radius modules, reading and triaging survivors (incl. equivalent
  mutants), per-module score thresholds, and the cost/runtime tradeoff.

## Scripts
`scripts/` reserved (`.gitkeep`). A parser that reads k6's `summary.json` (or Stryker's
`mutation.json`) and fails the gate on a breached p95/p99 / error-rate / mutation-score threshold
would justify one once the CI output formats stabilize across projects — the thresholds themselves
live in CI config, not here. Empty for now.
