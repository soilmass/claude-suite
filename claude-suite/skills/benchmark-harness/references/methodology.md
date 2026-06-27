Purpose: the honest micro-benchmark method — how to produce a number that is reproducible and decision-grade, and the confounders that silently invalidate a naive timing.

> The *method* here (warmup, isolate one variable, report percentiles, record environment) is
> durable. Any specific tool version or latency figure is perishable — `perishable-refresh`.

## 1. A benchmark settles one decision

Before writing any code, write two sentences:
- **Hypothesis:** "Turso p95 read latency from the edge is lower than Neon's for our hot query."
- **Decision it changes:** which driver the spine uses (a fork recorded in `DECISIONS.md`).

If you cannot name the decision, you are not benchmarking — you are generating numbers. Stop.

## 2. Isolate exactly one variable (the cardinal rule)

A valid comparison differs in **one** dimension. Hold everything else byte-for-byte fixed:

| Comparing | Must hold identical |
|-----------|---------------------|
| Two DB drivers | the SQL, dataset size/shape, region, runtime, payload returned |
| Two query shapes (relational vs join) | the driver, the row count, the result set returned |
| Two render paths (RSC vs client) | the route, the data, the deployment region |

If the options differ in three ways, you are measuring noise. Split into separate
one-variable benchmarks, or treat it as a `spike-research` exploration first.

## 3. The confounders checklist — each one silently lies

- **No warmup.** The first iterations pay JIT compilation, module load, TCP/TLS handshake, and
  cold edge-function start. Run a warmup window and **discard it** before recording. Report
  cold-start separately if it matters (see §6); never fold it into steady-state.
- **Dead-code elimination (DCE).** If you never use the result, the JIT may delete the work you
  are "timing." **Consume the output** — return it, sum a checksum, push to a sink. A benchmark
  that times nothing reports nanoseconds and means nothing.
- **Measuring the network instead of the thing.** Timing a DB driver over your laptop Wi-Fi to a
  remote DB measures your Wi-Fi. Measure from the same region as the DB, against a real
  deployment, so the variable under test dominates the number.
- **Garbage collection / allocation noise.** A GC pause lands in one run and not another. Enough
  samples + percentiles absorb this; a single run does not.
- **Shared state / order effects.** Connection pools warm up, OS caches fill, the second run is
  faster *because* it ran second. Randomize or alternate order; warm both before recording.
- **localhost ≠ edge.** localhost has no cold start, no region latency, and often uses a
  different (TCP) driver path than the edge HTTP driver. Edge questions need an edge deployment.

## 4. Sample size and what to report

- **In-process:** hundreds-to-thousands of iterations after warmup.
- **HTTP:** a sustained load *window* (e.g. 30s) at a fixed concurrency, not N sequential calls.
- **Report p50 / p95 / p99 — never the mean alone.** Latency distributions are right-skewed: a
  few slow tail requests drag reality away from the average. p95 is what a user feels on a bad
  day; the mean hides it. Always include **sample size** and an indication of spread (stdev or
  the p50→p99 gap). A tight p50 with a fat p99 is a different system than a uniform one.
- **Significance:** if the p95 confidence intervals of the two options overlap, the honest
  verdict is **"no significant difference."** Do not round a 3–5% noisy gap into a winner —
  that gap is usually run-to-run variance, not signal.

## 5. Pick the tool for the layer

| Layer | Tool | Why |
|-------|------|-----|
| In-process function/query timing | `vitest bench` (Tinybench) or a `performance.now()` loop | handles warmup, iterations, stats |
| HTTP route latency/throughput | `autocannon` (Node) or `k6` | sustained concurrent load, percentile output |
| Whole-process / CLI | `hyperfine` | warmup runs + statistical summary built in |

`performance.now()` is a monotonic high-resolution clock — use it, not `Date.now()` (wall clock,
coarse, can jump). For HTTP, point the load tool at a **deployed preview URL**, not localhost.

## 6. Cold vs warm are two questions

For edge/serverless, separate them and report both as distinct lines:
- **Cold:** first invocation — function cold start + first DB connection/handshake.
- **Warm:** steady state after the runtime and connection are hot.

Blending them yields a number that answers neither. The fix for a bad cold start (keep-warm,
smaller bundle) differs entirely from the fix for bad warm latency (query/index/driver).

## 7. The environment record (makes it reproducible)

A number without its environment is unreproducible and therefore worthless. Record, beside the
result in `DECISIONS.md`:

- runtime + version (edge vs node; Next.js version)
- region(s) and the load origin region
- dataset size and shape (row counts, payload bytes)
- driver + library versions under test
- machine / CI spec, and concurrency for HTTP runs
- iteration/sample count, warmup discarded
- date (results perish — re-run before re-citing)

## 8. Honest verdict template

> "{option A} p95 {X}ms vs {option B} p95 {Y}ms — {warm|cold}, {region}, {rows} rows,
> {samples/window}, {date}. {Winner, or 'no significant difference — decide on cost/DX'}."
