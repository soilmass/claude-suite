---
name: benchmark-harness
description: >
  Build a reproducible micro-benchmark to settle one stack decision — which DB driver, which
  Drizzle query shape, which render path — with honest methodology: a stated hypothesis, an
  isolated variable, warmup, enough iterations, and percentiles (p50/p95/p99) instead of a
  single mean. Produces a numbered result with its environment recorded so the call survives
  scrutiny and lands in DECISIONS.md, not a vibe.
  Use when: "benchmark", "micro benchmark", "measure performance of", "which is faster".
  Do NOT use for: interpreting production Core Web Vitals (use perf-budget-check), or
  open-ended exploration of an unfamiliar technology (use spike-research).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the "dishonest micro-benchmark" failure class: one run, no
    warmup, mean of a noisy distribution, the wrong variable measured, and a result no one can
    reproduce because the environment was never recorded.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# benchmark-harness

A micro-benchmark exists to settle exactly one decision — Neon vs Turso latency, a Drizzle
relational query vs a hand-join, an RSC vs client render path — with a number you can defend.
The failure class this skill kills is the *dishonest* benchmark: one warm run, a mean over a
skewed distribution, dead-code-eliminated work, or a measurement of the network instead of the
thing under test. It does not interpret prod vitals (`perf-budget-check`) or explore unknowns
(`spike-research`); it produces a reproducible measurement that feeds `DECISIONS.md`. See
`../../CLAUDE.md` for the spine the benchmarked options must respect.

---

## When to Use
- A spine fork needs a number: Neon serverless vs Turso/libSQL p95 latency at the edge.
- Two correct implementations exist and you must pick the faster: a Drizzle relational query
  (`with:`) vs an explicit join, cursor vs offset pagination, batched vs per-row.
- A render-path question: RSC + streaming vs a client component fetch waterfall, on a real route.
- You are about to assert "X is faster than Y" and need to be able to prove it reproducibly.

## When NOT to Use
- Reading real-user LCP/INP/CLS at p75 against the CI budget → `perf-budget-check` owns that.
- "Is this library/approach even viable, what are the unknowns" (open-ended) → `spike-research`.
- Choosing between technologies on more than speed (DX, cost, lock-in, maturity) → `tech-evaluation`.
- You already know the query is N+1 and just need it fixed → `n1-hunter` / `query-optimization`.

---

## Procedure

1. **Write the hypothesis and the decision it settles first (low cost, never skip).** One
   sentence: "Turso p95 read latency from the edge is lower than Neon's for our hot query."
   Name the single variable under test and what a result changes. A benchmark with no decision
   attached is theater. Record the question (and later the answer) in `DECISIONS.md`.

2. **Isolate the one variable; hold everything else fixed (high cost — most wrong calls start
   here).** Same query, same data volume, same region, same runtime, same payload shape. If you
   compare drivers, the SQL must be identical; if you compare query shapes, the driver and row
   count must be identical. Defeat dead-code elimination by consuming the result (return/log a
   checksum). See `references/methodology.md` for the confounders checklist.

3. **Pick the right tool for the layer (low cost).** In-process logic → `vitest bench`
   (Tinybench) or `performance.now()` loops. HTTP route throughput/latency → `autocannon` or
   `k6` against a deployed preview, **not** localhost. CLI/process-level → `hyperfine`. Edge
   route latency must be measured against a real edge deployment (preview URL), since localhost
   has none of the cold-start, region, or HTTP-driver cost. See `references/stack-benchmarks.md`.

4. **Warm up, then collect enough samples (medium cost).** Discard warmup iterations (JIT,
   connection setup, cold edge function) before recording. Run hundreds-to-thousands of
   in-process iterations, or a sustained load window for HTTP. Report **p50/p95/p99**, not the
   mean — latency distributions are right-skewed and the mean lies. Note sample size and
   variance. See `references/methodology.md`.

5. **Measure cold and warm separately for edge/serverless (medium cost).** Cold start and warm
   steady-state are different questions with different fixes; blending them produces a number
   that answers neither. For DB drivers, the first query pays connection/handshake cost — report
   it as a distinct line, not folded into the steady-state p95.

6. **Record the environment so it reproduces (low cost, high payoff).** Runtime + version
   (edge vs node, Next version), region, dataset size and shape, driver versions, machine/CI
   spec, date. A number without its environment is unreproducible and therefore worthless.
   Capture it next to the result in `DECISIONS.md`.

7. **State the verdict honestly, including "no significant difference" (low cost).** If the
   p95 distributions overlap, say so — a tie is a valid, decision-relevant result (pick on the
   other axes via `tech-evaluation`). Never round a 4% noisy edge into "X is faster." Hand the
   recorded decision to `DECISIONS.md` and, if it shifts the spine, flag for review.

---

## Composes With
- **Pairs with:** `spike-research` (a spike surfaces *which* options are viable; this measures
  them), `perf-budget-check` (it reads prod p75 field data; this measures a controlled lab
  question — different data, different verdicts).
- **Feeds:** `tech-evaluation` (supplies the speed axis of a multi-axis decision) and
  `DECISIONS.md` (the recorded fork resolution).
- **Runs against:** the options under test — e.g. `neon-turso-driver`, `drizzle-relational-queries`.
- **Hands off:** a confirmed slow query to `query-optimization` / `n1-hunter` for the fix.

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)
> Encoded failure class, not a captured transcript; replace once observed in the wild.

**Failure class encoded:** Asked "is Turso faster than Neon for our query," the agent writes a
script that runs each driver once on localhost and reports the raw `Date.now()` delta as the
answer. Concrete defects that ship: (1) a single run with no warmup, so the loser merely paid
the one-time connection/JIT cost; (2) the mean of a handful of runs over a right-skewed latency
distribution, hiding the p95 that actually matters; (3) measured on localhost, so neither edge
cold-start, region, nor the HTTP driver — the entire point — is exercised; (4) the query
results discarded, letting the engine dead-code-eliminate the work being "timed"; (5) no
recorded environment (versions, region, row count, date), so the number is unreproducible and
the "decision" cannot be re-checked when the drivers change (`perishable-refresh`).

---

## Examples

**Input:** "Which DB driver is faster for our hottest read, Neon serverless or Turso?"
**Output:** Hypothesis stated and pinned to the driver fork in `DECISIONS.md`. Identical SQL
for the hot query, identical seeded row count, deployed to the same edge region as a preview.
`autocannon` runs a sustained window against each; warmup window discarded; cold first-query
latency reported as its own line. Verdict: "Turso p95 18ms vs Neon p95 31ms, warm, eu-west,
~50k rows, 30s @ 50 conns, 2026-06-26 — Turso faster for this query shape." Recorded with
environment. If p95s had overlapped, the honest verdict is "no significant difference, decide
on cost/DX via `tech-evaluation`."

**Input:** "Is the Drizzle relational query (`with:`) slower than a manual join here?"
**Output:** Same driver, same dataset, both returning the identical row set (checksum the
output to defeat DCE). `vitest bench` over 1000 iterations after warmup, report p50/p95.
Finding: relational query issues one round-trip and matches the join within noise — no N+1, so
Rule 7 is satisfied either way; keep the relational query for readability. If it had fanned out
to per-row queries, that is an N+1 to hand to `n1-hunter`, not a benchmark result.

**Input:** "Benchmark RSC streaming vs a client fetch for the dashboard."
**Output:** Measure against a deployed preview, not localhost (edge cold-start and TTFB are the
point). Compare time-to-first-byte and time-to-meaningful-content for both paths over many
loads; report p75. Note this is a *lab* question — confirm any prod claim later via
`perf-budget-check` field data. Verdict recorded with route, region, and date.

---

## Edge Cases
- **Results overlap within variance** → report "no significant difference"; that is a real
  result. Decide on the other axes via `tech-evaluation`; do not manufacture a winner.
- **The benchmark needs prod traffic to be meaningful** (real cache hit rates, real concurrency)
  → a micro-benchmark will mislead; defer to `perf-budget-check` on field p75 data instead.
- **You cannot isolate the variable** (the two options differ in three ways) → stop; you are
  measuring noise. Split into separate one-variable benchmarks or treat it as a `spike-research`
  exploration first.
- **Numbers feel stale** (drivers/runtime updated since you measured) → benchmark results
  perish like any dated fact; re-run before re-citing, and let `perishable-refresh` flag drift.

---

## References
- `references/methodology.md` — honest micro-benchmark method: hypothesis, the confounders
  checklist (warmup, JIT, DCE, network, GC), sample size, why p95 not mean, and the environment
  record that makes a result reproducible.
- `references/stack-benchmarks.md` — concrete recipes for this stack: driver latency
  (Neon vs Turso at the edge), Drizzle query-shape timing, and render-path TTFB, with the right
  tool per layer (`vitest bench`, `autocannon`/`k6`, `hyperfine`) and runnable code.

## Scripts
`scripts/` reserved. A harness that runs a `performance.now()` loop with a discarded warmup
window and prints p50/p95/p99 + recorded environment JSON would justify one once the result
format is stable across benchmarks. Empty for now.
