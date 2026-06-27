Purpose: get truthful client-bundle numbers — analyzer setup, what to read, before/after discipline.

# Measuring the bundle

## Only `next build` tells the truth
`next dev` ships unminified, unsplit, HMR-instrumented code. Any size you read in dev is
meaningless. Always measure from a production build:

```bash
next build
```

The build prints a per-route table. The columns that matter:

- **Size** — bytes unique to that route's component code.
- **First Load JS** — the total a visitor downloads to make that route interactive: the route's
  own JS **plus** the shared chunks. This is the number to optimize.
- **First Load JS shared by all** — the framework + shared app chunks every route pays. If this is
  large, the leak is in a layout or a module imported by many routes (often `app/layout.tsx`).

A route prefixed `ƒ` is dynamic (server-rendered per request); `○` is static. Edge routes still
report First Load JS — and on the edge that same weight is also cold-start cost, so the number is
doubly load-bearing.

## Treemap: where the bytes come from
The route table says *how much*; `@next/bundle-analyzer` says *what*.

```bash
npm i -D @next/bundle-analyzer
```

```ts
// next.config.ts
import withBundleAnalyzer from "@next/bundle-analyzer";
const analyze = withBundleAnalyzer({ enabled: process.env.ANALYZE === "true" });
export default analyze(nextConfig);
```

```bash
ANALYZE=true next build
```

It opens three treemaps: `client`, `nodejs`, `edge`. **Read the `client` map** — that is what ships
to the browser. (The `edge`/`nodejs` maps are server bundles; weight there is cold-start cost, not
download cost, and is relevant only for the edge function-size limit.) Each rectangle is a module
sized by its contribution; large rectangles for things that should be server-only are leaks
(see `boundary-leaks.md`).

## Before/after discipline
Every proposed cut needs a number, or it is a guess (baseline defect #4).

1. `ANALYZE=true next build`, record the route's First Load JS and the offending module's size.
2. Make the one change.
3. Re-run, record the delta.

Quote both numbers in the finding: "dashboard First Load JS 480 kB → 190 kB; removed the Drizzle
schema from the client closure." No delta, no claim.

## What the numbers do not tell you
Bytes are not runtime experience. A small bundle can still have bad INP, and a large one can feel
fine if it is below the fold and deferred. The runtime verdict — LCP/INP/CLS at p75 — belongs to
`perf-budget-check`. This skill stops at "what ships and why."
