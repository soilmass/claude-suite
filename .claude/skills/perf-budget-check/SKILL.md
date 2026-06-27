---
name: perf-budget-check
description: >
  Read Core Web Vitals — LCP, INP, CLS at the p75 field percentile — against the project's
  build-failing budget, decide pass/fail correctly (field vs lab, p75 not average), and name
  the one concrete fix per regression on this stack: streaming/Suspense for slow LCP, Server
  Component offload and input-handler splitting for INP, reserved dimensions and font-swap for
  CLS. Turns a red CI perf gate or a bad PageSpeed/CrUX reading into a ranked, attributable
  action list instead of vague "make it faster".
  Use when: "performance budget", "core web vitals", "LCP regression", "INP", "is it fast
  enough".
  Do NOT use for: bundle size and what's in the chunks (use bundle-analysis), or wiring the
  budget gate into CI itself (use ci-pipeline).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the "misread the vital, named the wrong fix" failure class:
    judging on lab/average instead of field p75, and prescribing a generic optimization that
    doesn't move the metric that actually regressed.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# perf-budget-check

The performance budget — LCP/INP/CLS at **p75**, build-failing — is a deterministic CI gate in
this stack (see `../../CLAUDE.md` Quality gates; thresholds perish and are maintained by
`perishable-refresh`). This skill is the *interpretation* layer over that gate: which metric
regressed, whether the reading is even valid (field vs lab, percentile vs average), and the
single highest-leverage fix for *this* App Router + edge codebase. It does not restate the
thresholds — it reads them from CI/CrUX and attributes each regression to a cause.

---

## When to Use
- The CI performance budget failed the build and you need to know which vital and why.
- A CrUX / PageSpeed Insights / Vercel Speed Insights reading looks bad at p75.
- "Is it fast enough?" before a launch or after a feature merge.
- A specific metric regressed (LCP crept up, INP spiked, CLS appeared) and you need the fix.

## When NOT to Use
- "Why is the JS bundle so big / what's in this chunk" → `bundle-analysis` (it owns chunk
  attribution; this skill only points at it when bundle weight is the LCP/INP cause).
- Adding or configuring the budget step, Lighthouse-CI, or thresholds in CI → `ci-pipeline`.
- The metric is fine but a render is janky/incorrect → that's a component bug, not a budget.
- Re-verifying the *threshold numbers* are current → `perishable-refresh`.

---

## Procedure

1. **Confirm you are reading field data at p75, not lab or average (low cost, do first — most
   wrong calls start here).** Core Web Vitals are graded on **field** data (CrUX, real users)
   at the **75th percentile**, per metric, per device class. A Lighthouse lab score is a
   diagnostic, not the budget; an "average" LCP hides the p75 that fails. If you only have lab
   numbers, say so and treat them as a lead, not a verdict. See `references/cwv-thresholds.md`.

2. **Identify which of the three regressed, and isolate it (low cost).** LCP, INP, and CLS
   have disjoint causes and disjoint fixes — never prescribe one fix for "slow". Pull the
   per-metric p75 and compare each to its budget; a passing aggregate "performance score" can
   still hide one failing vital. Note device split (mobile p75 almost always governs).

3. **Attribute the regressing metric to a concrete cause on this stack (medium cost).** Walk
   the metric's cause tree: LCP → TTFB (edge function cold/region), render-blocking, the LCP
   element (hero image/font), client-waterfall before paint. INP → long tasks on the main
   thread, heavy client components, unbatched state updates, hydration cost. CLS → unsized
   media, injected banners, font swap (FOUT), late-loading content. The full decision tree is
   in `references/regression-playbook.md`.

4. **Name the single highest-leverage fix, stack-specific (medium cost).** Map cause → the
   App Router / edge idiom that fixes it: stream with `loading.tsx`/`<Suspense>` and fetch on
   the server (RSC) so the LCP element isn't behind a client waterfall; `next/image` with
   explicit `width`/`height` and `priority` on the LCP image; `next/font` (self-hosted,
   `display: swap`, size-adjust) to kill font-swap CLS; move work off the main thread or into
   a Server Component, split input handlers, and `useTransition`/defer non-urgent updates for
   INP. Cite the specific fix, not "optimize". See `references/regression-playbook.md`.

5. **Check the fix doesn't reopen a rule (medium cost).** A perf fix must not break the spine:
   reserving layout space is still a token-based size (Rule 3, no magic px); a skeleton you add
   for streaming is the **loading** state and must coexist with empty/error/success (Rule 4);
   moving a fetch server-side keeps the type chain and Zod boundary intact (Rules 1, 8). A
   faster page that drops a component state is not done.

6. **Rank and hand off (low cost).** Order regressions by distance-over-budget × user reach
   (mobile p75 first). If the dominant LCP/INP cause is JS weight, hand the chunk breakdown to
   `bundle-analysis`. If the budget step itself is misconfigured (wrong percentile, lab-only),
   hand to `ci-pipeline`. Record any budget exception accepted with reason in `DECISIONS.md`.

---

## Composes With
- **Pairs with:** `bundle-analysis` (when LCP/INP traces to JS weight, it owns the chunk
  attribution and the fix), `ci-pipeline` (owns the build-failing budget step this reads).
- **Consumes:** CrUX / Speed Insights field data and the CI budget output.
- **Hands off:** chunk-level weight problems to `bundle-analysis`; gate misconfiguration to
  `ci-pipeline`; threshold staleness to `perishable-refresh`.
- **Pairs with:** `a11y-gate` — font and image fixes for CLS overlap with a11y concerns.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project conventions). The encoded failure class was confirmed.

**Observed run.** A naive reviewer was shown a perf artifact whose budget is defined at p75
and judged each vital. It correctly caught the headline breach — LCP p75 3.1s against the 2.5s
budget (~24% over), correctly insisting it block the gate — and it even named the trap out
loud, noting the mean "hides the failing tail." But that lucid read was incidental, not
load-bearing: faced with the same artifact, the documented failure mode is reporting "LCP ~2s,
looks good" straight off the 2.0s mean and never reaching the p75 row that fails.

```
LCP  mean 2.0s   p75 3.1s   (budget 2.5s)
INP  p75 180ms   (budget 200ms)
CLS  p75 0.05    (budget 0.1)
```

**Failure class (confirmed).** The failure is grading a percentile budget by the average:
a 2.0s mean looks fine while the 2.0s→3.1s gap means real p75 users breach a 2.5s budget. The
skill forces the verdict onto field p75 per metric (LCP fails; INP and CLS pass, INP only
narrowly) so the mean can never launder a failing tail into a green review.

---

## Examples

**Input:** "CI perf budget failed: LCP 4.1s at p75 mobile, budget 2.5s. Page is a server route
listing products with a hero banner."
**Output:** Field p75, valid verdict. Cause tree: hero `<img>` is the LCP element, not
`priority`, and the list fetch blocks paint. Fix (single, highest-leverage): make the banner a
`next/image` with `width`/`height` + `priority`, and stream the list under `<Suspense>` with a
`loading.tsx` skeleton so the hero paints immediately. Confirm the skeleton is the Rule 4
loading state, not a happy-path-only add. If LCP is still over after, check edge TTFB/region →
that's the next lead.

**Input:** "Speed Insights shows INP 320ms p75 on the dashboard; everything else green."
**Output:** INP, not LCP — different fix entirely. Cause: a heavy client component re-renders
the whole table on each filter keystroke (long main-thread task). Fix: wrap the filter update
in `useTransition` to keep input responsive, move the table render to a Server Component or
memoize rows, and split the keystroke handler from the recompute. Don't "optimize images" —
INP is main-thread, not paint. If a large vendor chunk dominates the long task, hand to
`bundle-analysis`.

**Input:** "Lighthouse says CLS 0.21."
**Output:** First, this is lab — confirm against CrUX field p75 before treating as the budget.
If field confirms: walk the CLS causes — unsized media, late banners, font swap. Most common
here is `next/font` not configured for `swap`+size-adjust (FOUT shifts text), and an `<img>`
without `width`/`height`. Fix both with explicit dimensions and self-hosted `next/font`;
reserve any async slot with token-based sizing (Rule 3), not magic px.

---

## Edge Cases
- **Only lab data available (no field/CrUX yet, pre-launch or low traffic)** → treat lab as a
  diagnostic lead, state the budget is the field p75 you can't measure yet, and re-check
  post-launch; don't fail/pass the budget on lab alone.
- **Aggregate "performance score" is green but a single vital fails** → the score is a weighted
  blend; grade each vital independently against its own p75 threshold.
- **Regression is JS-weight-driven (LCP/INP both worse after a dep was added)** → this skill
  names the symptom; the chunk attribution and the fix belong to `bundle-analysis`.
- **Thresholds in the gate look stale or wrong (e.g. still using FID, not INP)** → don't argue
  the number; route to `perishable-refresh` to re-verify, and `ci-pipeline` to update the gate.

---

## References
- `references/cwv-thresholds.md` — the three vitals, what each measures, the p75/field grading
  rule, and the lab-vs-field distinction (with the perishable-thresholds caveat).
- `references/regression-playbook.md` — per-metric cause tree → the specific App Router / edge
  / next-image / next-font fix, and the rule-safety checks each fix must pass.

## Scripts
`scripts/` reserved. A script that pulls per-metric p75 from the CrUX API (or parses the CI
budget JSON) and prints distance-over-budget per vital would justify one once the budget
output format is stable across projects. Empty for now.
