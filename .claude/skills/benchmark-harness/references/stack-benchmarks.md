Purpose: concrete, runnable micro-benchmark recipes for the three decisions this stack actually faces — DB driver latency at the edge, Drizzle query-shape cost, and render-path TTFB.

> Versions and numbers below perish (`perishable-refresh`). The recipes and methodology are
> durable. Always apply `references/methodology.md` — warmup, percentiles, isolate one variable.

## Recipe A — DB driver latency (Neon serverless vs Turso/libSQL) at the edge

The driver fork is decided in the spine; benchmark only when a real read pattern needs the
number. **The SQL, dataset, and region must be identical** — the driver is the only variable.

This must run against a **deployed edge preview**, not localhost (localhost has no edge cold
start, no region latency, and may use a TCP path the edge never takes). Expose a tiny route per
driver that runs the identical hot query, then load it:

```ts
// app/api/bench/[driver]/route.ts  — edge route, runs ONE identical query
export const runtime = "edge";
import { z } from "zod";

const Params = z.object({ driver: z.enum(["neon", "turso"]) }); // Rule 8: validate the boundary

export async function GET(_req: Request, { params }: { params: { driver: string } }) {
  const { driver } = Params.parse(params);
  const db = driver === "neon" ? neonDb : tursoDb; // identical schema/SQL behind each
  const t0 = performance.now();
  const rows = await db.query.orders.findMany({ where: ..., limit: 50 }); // the HOT query
  const ms = performance.now() - t0;
  // consume the result so it isn't dead-code-eliminated; return a checksum, not PII
  return Response.json({ ms, n: rows.length });
}
```

Drive a sustained window and read percentiles (warm). Cold start is a separate line — capture
the very first request latency before the connection warms.

```bash
# warm steady-state, 30s at 50 concurrent, against the PREVIEW url (same region as the DB)
npx autocannon -d 30 -c 50 https://<preview>.vercel.app/api/bench/turso
npx autocannon -d 30 -c 50 https://<preview>.vercel.app/api/bench/neon
# autocannon prints p2.5/p50/p97.5/p99 latency — report p50/p95/p99, not "avg"
```

Report e.g. `Turso p95 18ms vs Neon p95 31ms — warm, eu-west, ~50k rows, 30s@50c, <date>`.
Overlapping p95s → "no significant difference; decide via `tech-evaluation`."

## Recipe B — Drizzle query shape (relational `with:` vs explicit join)

Same driver, same dataset, **both must return the identical row set** — checksum the output to
defeat DCE. Use `vitest bench` (Tinybench handles warmup + iterations + stats):

```ts
// bench/order-shape.bench.ts
import { bench, describe, beforeAll } from "vitest";
import { db } from "@/db";

// Both shapes must represent the SAME logical (order, lineItem) set despite different
// return shapes (nested vs flattened). Normalize each to a canonical set of FK pairs,
// then checksum — defeats DCE AND proves the variable is isolated (methodology §2).
const checksum = (pairs: Array<[string, string]>) =>
  JSON.stringify([...new Set(pairs.map(([o, l]) => `${o}:${l}`))].sort());

const relationalRows = () =>
  db.query.orders.findMany({ with: { lineItems: true }, limit: 50 }); // ONE query — no N+1 (Rule 7)
const relationalCk = (rows: Awaited<ReturnType<typeof relationalRows>>) =>
  checksum(rows.flatMap((o) => o.lineItems.map((li) => [o.id, li.id] as [string, string])));

const joinRows = () =>
  db.select().from(orders).leftJoin(lineItems, eq(lineItems.orderId, orders.id)).limit(50);
const joinCk = (rows: Awaited<ReturnType<typeof joinRows>>) =>
  checksum(rows.flatMap((r) => (r.line_items ? [[r.orders.id, r.line_items.id] as [string, string]] : [])));

describe("orders + line items", () => {
  // Assert equivalence ONCE before timing — if the shapes disagree, the benchmark is
  // measuring two different things and any verdict is invalid.
  beforeAll(async () => {
    const rel = relationalCk(await relationalRows());
    const join = joinCk(await joinRows());
    if (rel === "[]") throw new Error("empty — fix the seed");
    if (rel !== join) throw new Error("query shapes return different row sets — not comparable");
  });

  bench("relational query (single round-trip)", async () => {
    if (!relationalCk(await relationalRows())) throw new Error("empty"); // consume result
  });

  bench("explicit leftJoin", async () => {
    if (!joinCk(await joinRows())) throw new Error("empty"); // consume result
  });
});
```

```bash
npx vitest bench bench/order-shape.bench.ts   # prints hz, p75, p99, sample count
```

Interpretation: the relational query and the join should land within noise (both one
round-trip). If the relational form *fans out* to per-row queries, that is an **N+1 (Rule 7)** —
not a benchmark verdict; hand it to `n1-hunter` / `query-optimization`. Prefer the relational
query for readability when speed ties. Pair this with `index-strategy`: an unindexed FK makes
either shape slow and the benchmark would just be measuring a missing index.

### Variant — what a noisy benchmark looks like (do NOT do this)

```ts
const t = Date.now();                 // wall clock, coarse, can jump
const rows = await db.query...;       // one run, no warmup
console.log(Date.now() - t);          // single sample, mean of nothing, result discarded
```

## Recipe C — render path (RSC + streaming vs client fetch waterfall)

A *lab* question: confirm any production claim later with `perf-budget-check` field p75. Measure
against a deployed preview (edge cold start + TTFB are the point):

```bash
# time-to-first-byte distribution over many loads, per path
npx autocannon -d 20 -c 20 https://<preview>.vercel.app/dashboard-rsc
npx autocannon -d 20 -c 20 https://<preview>.vercel.app/dashboard-client
# or k6 for scripted think-time + TTFB thresholds
```

Compare TTFB and time-to-meaningful-content p75. Typically RSC + `<Suspense>`/`loading.tsx`
streams the shell immediately and wins TTFB by removing the client fetch waterfall — but
*measure it*, do not assert it. Keep Rule 4: the streamed skeleton is the **loading** state and
must still ship empty/error/success.

## Tool cheat-sheet

| Need | Tool | Note |
|------|------|------|
| In-process timing + stats | `vitest bench` (Tinybench) | warmup + iterations + p75/p99 automatic |
| HTTP latency/throughput | `autocannon` | Node-native, prints percentiles |
| Scripted load, thresholds, think-time | `k6` | for richer scenarios than autocannon |
| Whole CLI/process | `hyperfine` | built-in warmup runs + summary |
| The clock | `performance.now()` | monotonic hi-res; never `Date.now()` for timing |

Always record the environment (methodology §7) beside the result in `DECISIONS.md`.
