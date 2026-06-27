Purpose: how to run a load/stress test on the edge stack the right way — tool choice, realistic
traffic modeling, percentile + error-rate thresholds (never means), finding the edge-concurrency /
serverless-DB ceiling, target-environment safety, and the `spend-cap` coordination.

The discipline: **synthetic generated load against a deployed, prod-scaled preview, judged on
p95/p99 + error rate, with a spend cap on the invocations it burns.** This is not field Core Web
Vitals (real-user RUM at p75 — that's `perf-budget-check`); it is a controlled experiment.

---

## Tool choice: k6 vs Artillery

- **k6** (Grafana) — JS-scripted, percentile **thresholds are first-class** (`k6 run` exits non-zero
  when a threshold breaches, so the threshold table *is* the CI gate), good ramp/scenario executors,
  strong summary output. Default choice for this stack.
- **Artillery** — YAML/JS, also CI-friendly, has a Playwright engine if you must drive the browser.
  Reasonable alternative; the percentile/threshold story is slightly less ergonomic than k6's.

Either way: **hit the tRPC HTTP endpoints / route handlers directly** — load is the wrong layer to
drive through a real browser (that's e2e). Record the choice in `DECISIONS.md` if it isn't k6.

## Traffic modeling — make the load realistic

A flat "blast 1000 requests" proves nothing. Model the shape:

- **Ramp in stages.** Start at 0 VUs, ramp to expected peak, **soak** at peak (5–10 min — leaks and
  connection exhaustion only show under sustained load), ramp down. A separate **stress** profile
  ramps *past* peak to find the breaking point.
- **VUs vs arrival rate.** `ramping-vus` models concurrent users with think-time; `ramping-arrival-rate`
  (constant/ramping) models *requests per second* independent of response time — use arrival-rate for
  a campaign-spike model so a slowing server doesn't artificially throttle the offered load.
- **Think-time + realistic flows.** Replay the critical flows `playwright-e2e` already exercises
  (sign-in → core action → read), with `sleep()` between steps; don't hammer one endpoint in a tight
  loop unless that endpoint *is* the test.
- **Realistic data volume.** Run against a DB seeded to prod-like size — an empty table measures an
  empty table, not your indexes.

```js
// load/checkout.js — k6
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    peak_soak: {
      executor: "ramping-vus", startVUs: 0,
      stages: [
        { duration: "2m", target: 50 },  // ramp to expected peak
        { duration: "8m", target: 50 },  // soak — catches leaks / connection exhaustion
        { duration: "2m", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed:   ["rate<0.01"],            // <1% errors, hard gate
    http_req_duration: ["p(95)<400", "p(99)<800"],
  },
};

export default function () {
  const res = http.post(`${__ENV.BASE_URL}/api/trpc/order.create`, /* body */ "{}", {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${__ENV.TOKEN}` },
  });
  check(res, { "status 200": (r) => r.status === 200 });
  sleep(1); // think-time
}
```

## Thresholds — percentiles and error rate, never the mean

The mean is the failure mode this skill exists to prevent. A 120ms average with a 2s p99 is a
*broken* experience for 1% of requests at scale.

- **Latency:** assert `p(95)` and `p(99)` (and watch `max`). Pick numbers from the SLO, not from the
  result. p99 is where edge cold-starts and DB contention surface.
- **Error rate:** `http_req_failed: rate<0.01` (or tighter). A fast-but-erroring run is a fail.
- **Throughput** (req/s) is a *diagnostic*, not the gate — report it, but pass/fail on latency + errors.

## Finding the ceiling — capacity, not just pass/fail

The stress profile's job is to find where the deployed system breaks, on this stack specifically:

- **Edge-function concurrency.** The edge runtime caps concurrent executions; past it, requests queue
  and p99 climbs then errors appear.
- **Serverless-DB connections/compute.** Neon/Turso over HTTP have finite connections + compute at
  the edge (no long-lived TCP pool — see `../../CLAUDE.md`). Connection saturation, slow queries, and
  lock contention show here first — watch the DB dashboard *during* the run.
- **Deliverable, not a vibe.** Record the **breaking VU/arrival count** and the **bottleneck**
  (which limit hit first) in `DECISIONS.md` so capacity can be raised before a real spike — a ceiling
  you found and wrote down is capacity planning; "it got slow around there" is not.

## Target environment + spend — the safety rules

- **Run against a deployed preview/staging scaled like prod.** Localhost has no edge cold-start and
  no real driver RTT — it cannot represent the system under test.
- **Never point load at production unannounced.** If prod is genuinely the only representative target,
  require an off-peak window, rate ceilings, a kill switch, stakeholder sign-off, and a `spend-cap` —
  all recorded in `DECISIONS.md`. Unplanned prod load is a self-inflicted incident.
- **Cap the spend first.** Load + stress burn real invocations, function-duration, and DB compute —
  the test can trigger the very bill it's meant to prevent. Coordinate with `spend-cap` before the
  first run, and scope the run to a metered preview budget.

## Cadence

Wire as a **nightly / weekly** job or a **pre-release** pipeline stage — never per-PR (too slow, too
expensive, too noisy for per-commit signal). The k6 non-zero exit on a breached threshold is the gate.
