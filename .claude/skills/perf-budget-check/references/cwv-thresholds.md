Purpose: how Core Web Vitals are graded — the three metrics, the p75/field rule, and the lab-vs-field distinction that decides whether a reading is even a valid verdict.

> The numeric thresholds below are **perishable** (CLAUDE.md Maintenance). `perishable-refresh`
> re-verifies them against current web.dev / Chrome guidance; do not treat the numbers here as
> eternal. The grading *method* (field, p75, per-metric) is durable.

## The three Core Web Vitals (as of this draft)

| Metric | Measures | Good (p75) | Needs work | Poor |
|--------|----------|-----------|------------|------|
| **LCP** Largest Contentful Paint | Time until the largest in-viewport element paints (loading) | ≤ 2.5 s | 2.5–4.0 s | > 4.0 s |
| **INP** Interaction to Next Paint | Worst-case latency from user input to next paint, across the visit (responsiveness) | ≤ 200 ms | 200–500 ms | > 500 ms |
| **CLS** Cumulative Layout Shift | Sum of unexpected layout shift scores (visual stability) | ≤ 0.1 | 0.1–0.25 | > 0.25 |

INP replaced FID as a Core Web Vital in March 2024. If a gate still measures FID, it is stale —
route to `perishable-refresh` + `ci-pipeline`.

## The grading rule — this is what most wrong calls miss

1. **Field, not lab.** The budget is graded on *real user* data: Chrome User Experience Report
   (CrUX), surfaced via PageSpeed Insights, Search Console, or Vercel Speed Insights. A
   **Lighthouse / Lighthouse-CI lab run** is a *diagnostic* — a controlled, single synthetic
   load. Lab is for finding causes; field is for passing the budget. A green lab score with a
   failing field p75 is common and the field reading wins.

2. **p75, not average.** Each metric is taken at the **75th percentile** of the distribution —
   "75% of visits were at least this good." An average (or median) hides the slow tail that
   the budget targets. Never grade on a mean.

3. **Per metric, per device class.** Mobile and desktop have separate distributions; **mobile
   p75 almost always governs** (slower CPUs, networks). Grade each vital independently — a
   blended "Performance score" out of 100 is a weighted Lighthouse lab construct and can be
   green while one real vital fails.

4. **Origin vs URL.** CrUX reports both per-URL (if it has enough traffic) and per-origin
   (site-wide fallback). A low-traffic page may only have origin-level data — note that the
   verdict is then site-wide, not page-specific.

## When you only have lab data (pre-launch / low traffic)

New or low-traffic pages have no CrUX field data. Then:
- Use Lighthouse lab numbers as a **lead**, explicitly labeled as lab.
- Do **not** pass or fail the budget on lab alone — state that the field p75 is unmeasurable
  yet and schedule a re-check ~28 days post-launch (CrUX uses a rolling 28-day window).
- Lab CLS and lab LCP especially diverge from field (lab uses a fixed throttle; real users
  vary). Lab INP is unreliable because it needs real interactions.

## Stack-specific reading sources

- **Vercel Speed Insights** — field p75 per route for deployments on Vercel; the closest match
  to the CI budget for this edge stack.
- **PageSpeed Insights** — CrUX field (top) + Lighthouse lab (bottom) on one page; read the top
  for the verdict.
- **`web-vitals` library / `useReportWebVitals`** — emit INP/LCP/CLS from the app to your own
  analytics for first-party field data; attribute to OTel/Sentry per CLAUDE.md observability.
