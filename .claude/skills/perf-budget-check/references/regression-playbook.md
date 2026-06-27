Purpose: per-metric cause tree → the specific Next.js App Router / edge / next-image / next-font fix, plus the rule-safety checks each fix must pass before it counts as done.

The discipline: **one regressing metric → its own cause tree → one highest-leverage fix.**
LCP, INP, and CLS share almost no causes. "Make it faster" is never an answer.

---

## LCP — Largest Contentful Paint (loading)

The LCP element is usually the hero image, a large heading, or a poster. Walk causes in order:

1. **Slow TTFB.** At the edge, this is cold-start or wrong region. Check the route runtime and
   region; ensure data fetches run on the edge near the user, not a round-trip to a distant DB.
   The Neon/Turso HTTP driver should be region-matched (`neon-turso-driver`). TTFB > ~600ms p75
   eats the whole budget before paint.
2. **Client-side data waterfall before paint.** The LCP element is gated behind a `useEffect` /
   client `fetch` / tRPC query that only fires after hydration. **Fix:** fetch on the server in
   the RSC and pass data down, or stream with `<Suspense>` + `loading.tsx` so the shell (and
   often the LCP element) paints immediately while data resolves.
3. **The LCP image isn't prioritized or optimized.** A raw `<img>` or a `next/image` without
   `priority` is lazy/late. **Fix:** `next/image` with explicit `width`/`height`, `priority`
   (and `fetchPriority="high"`) on the above-the-fold LCP image; serve AVIF/WebP via the loader;
   set correct `sizes`. Preload the LCP image/font if it's discovered late.
4. **Render-blocking resources.** Large blocking CSS/JS or non-`swap` fonts delay first paint.
   **Fix:** `next/font` (self-hosted, subsetted), keep critical CSS small (Tailwind v4 already
   tree-shakes), defer non-critical scripts via `next/script` `strategy="lazyOnload"`.

---

## INP — Interaction to Next Paint (responsiveness)

INP is a **main-thread** problem, never a paint or image problem. Cause tree:

1. **Long tasks blocking the main thread.** A click/keystroke handler runs > 50ms of JS before
   the next paint. **Fix:** break the work up, `useTransition`/`startTransition` to mark the
   non-urgent state update so input stays responsive, debounce/throttle high-frequency handlers
   (search-as-you-type), and `useDeferredValue` for derived expensive renders.
2. **Over-large Client Component re-rendering.** A keystroke re-renders a whole table/list.
   **Fix:** push static parts to Server Components, memoize rows (`React.memo`, stable keys),
   virtualize long lists, lift the input state so only the input subtree re-renders.
3. **Heavy hydration cost.** A big `"use client"` boundary hydrates a lot of JS on load,
   making the first interactions janky. **Fix:** shrink the client boundary — keep `"use
   client"` leaves small, render shells as RSC. If a vendor chunk dominates the long task, the
   *weight* is `bundle-analysis`'s domain; this skill names the symptom and hands off.
4. **Synchronous work in event handlers** (large JSON parse, sort, layout thrash). **Fix:**
   move it off the click path — precompute on the server, or `requestIdleCallback`/web worker.

---

## CLS — Cumulative Layout Shift (visual stability)

Things that move after they first render. Cause tree:

1. **Unsized media.** `<img>`/`<video>`/iframe without dimensions reserves no space, then
   pushes content when it loads. **Fix:** `next/image` with `width`/`height` (or `fill` + a
   sized parent); always reserve the box.
2. **Font swap (FOUT).** Fallback font renders, then the web font swaps in at a different
   metric, shifting text. **Fix:** `next/font` self-hosted with `display: 'swap'` and automatic
   `size-adjust`/fallback metric matching (next/font does this) so the swap doesn't reflow.
3. **Late-injected content above existing content** — banners, cookie bars, ads, async-loaded
   sections. **Fix:** reserve their space up front (min-height with a **token**, see Rule 3),
   or render them in a fixed/non-flow position so they don't shift the document.
4. **Streaming/Suspense boundaries that resize on resolve.** A skeleton smaller than its
   resolved content shifts layout. **Fix:** size the skeleton to match the resolved content's
   reserved space.

---

## Rule-safety checks — a perf fix is not done if it breaks the spine

- **Rule 3 (no hardcoded style):** reserved space, skeleton sizes, and min-heights are
  **token-based** (`h-[--space-…]` / scale utilities), never magic `h-[438px]`.
- **Rule 4 (four states):** a streaming skeleton is the **loading** state — it must coexist
  with empty, error, and success, not replace the need for them (`error-boundaries`,
  `component-state-test`).
- **Rules 1 & 8 (type chain / boundaries):** moving a fetch server-side keeps it typed and
  Zod-parsed; don't drop the boundary parse to "save time".
- **Rule 9 (no client secrets):** moving work to a Server Component is good; don't pull a
  server-only key into a client component while refactoring for INP.

## Ranking multiple regressions

Order by **distance-over-budget × user reach**. Mobile p75 outranks desktop. A vital in the
"poor" band outranks one merely in "needs work". Fix the governing device's worst vital first;
re-measure before moving on (fixes interact — streaming can improve both LCP and INP).
