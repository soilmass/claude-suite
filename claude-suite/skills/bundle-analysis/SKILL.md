---
name: bundle-analysis
description: >
  Analyze what actually ships to the client in this Next.js App Router + edge stack: read the
  build's per-route First Load JS, find Server/Client boundary leaks (a stray "use client"
  pulling a server-only module or a heavy lib into the browser graph), and identify the
  dependencies inflating the bundle. Reports where bytes come from and the concrete cut for
  each — code-split, defer, move to a Server Component, or swap the dep.
  Use when: "bundle size", "what is in the bundle", "client bundle too big", "analyze bundle".
  Do NOT use for: runtime Core Web Vitals / field metrics (use perf-budget-check), or hunting
  leaked secrets in client code (use secret-scan).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the "heavy/leaky client bundle on the edge" failure class:
    a Server/Client boundary drawn wrong drags server-only code and oversized deps into the
    browser graph, where they cost First Load JS and edge cold-start weight.
    Baseline observed (clean-room capture).
---

# bundle-analysis

What ships to the browser is decided by where the Server/Client boundary is drawn, not by what
you intended to ship. This skill reads the Next.js build output and the module graph to answer
"what is in the client bundle and why," then names the cut for each offender. It is an analysis
pass, not a fix pass — it produces a ranked findings list and hands the changes to `refactor`
or `vertical-slice`. The edge runtime (see `../../CLAUDE.md`) makes this sharper: First Load JS
and bundle weight are also cold-start cost, so a leaked dependency is paid twice.

---

## When to Use
- A route's First Load JS is large, or the build prints a bundle-size warning.
- You want an inventory of what crosses into the client graph and which deps dominate it.
- A `"use client"` was added and you suspect it pulled server-only code or a heavy lib along.
- Before launch, to confirm the edge/client payload is within the team's byte budget.

## When NOT to Use
- Measuring real LCP / INP / CLS at p75, or interpreting field vitals → `perf-budget-check`
  (this skill measures bytes, not runtime experience).
- Confirming no secret leaked into `NEXT_PUBLIC_*` or a Client Component (Rule 9) → `secret-scan`
  (this skill sees a heavy dep in the client graph; that skill judges whether it's a secret).
- Actually performing the boundary move or dep swap → `refactor` / `vertical-slice`.

---

## Procedure

1. **Produce a real build, not a guess (low cost, do first).** Bundle size is only truthful
   from `next build`; `next dev` is unminified and unrepresentative. Capture the per-route
   "First Load JS" table and the shared-chunk total. See `references/measuring.md` for enabling
   `@next/bundle-analyzer` and reading the treemap.

2. **Split the graph by boundary (medium cost).** In App Router, code is server-only by default;
   only a module reachable from a `"use client"` entry point ships to the browser. List the
   Client Component entry points and walk what each imports — that import closure *is* the client
   bundle. See `references/boundary-leaks.md` for tracing the closure.

3. **Hunt boundary leaks (high cost — this is the #1 cause and the easiest to miss).** A leak is
   a server-only concern reachable from a client entry: importing your tRPC router (not the typed
   client), a Drizzle schema/`db` module, a `node:*`/server SDK, or env access. These often
   *compile* and only show up as weight (or an edge build error). For each, identify why it
   crossed and where the boundary should actually sit. Record any non-obvious boundary call in
   `DECISIONS.md`.

4. **Rank dependencies by client-graph weight (medium cost).** From the treemap, list the heaviest
   modules *that are in the client graph*. Common offenders: moment/large date libs, lodash
   (whole-package import), icon sets imported as a barrel, a charting lib loaded eagerly, a
   markdown/syntax-highlight engine. Distinguish "heavy and needed here" from "heavy and
   accidental." See `references/heavy-deps.md` for the offender table and lighter swaps.

5. **Assign each finding one concrete cut (medium cost).** The fix is one of a small set: move the
   work to a Server Component (delete the `"use client"`), `next/dynamic` with `ssr:false` to
   defer below the fold, swap to a lighter dep or a tree-shakeable import, or pass server-fetched
   data down as props instead of fetching in the client. Name the specific one per finding — do
   not emit "consider reducing bundle size."

6. **Re-check the edge consequence (medium cost).** On the edge, a bloated bundle also inflates
   cold-start and can trip the platform's function-size limit. Flag any route whose closure pulls
   a dep that is both heavy *and* edge-incompatible — that is a `edge-runtime-constraints` problem
   surfacing as bundle weight, and you should hand it off, not just trim it.

7. **Output a ranked findings list (low cost).** Per finding: route(s) affected, bytes (or share),
   why it ships, and the single assigned cut. Hand the byte-budget gate to CI and the runtime
   verdict to `perf-budget-check`; hand the edits to `refactor`/`vertical-slice`.

---

## Composes With
- **Pairs with:** `perf-budget-check` (it owns runtime vitals; this owns ship-weight — together
  they cover "is it fast"), `secret-scan` (this spots a suspicious client dep; that rules on Rule 9).
- **Hands off:** boundary moves and dep swaps to `refactor` / `vertical-slice`; an edge-incompatible
  heavy dep to `edge-runtime-constraints`.
- **Feeds:** the CI performance budget with the per-route byte numbers it measured.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project conventions). The encoded failure class was confirmed.

**Observed run.** Shown a build artifact for `/dashboard` with a 612 kB First Load JS, the naive
reviewer caught a lot of the surface: it flagged 612 kB as over budget, identified moment (290 kB) as
half the bundle and named tree-shakeable swaps, spotted that `lib/pricing.ts` drags `pg`/`fs` into the
client graph, traced it to a `"use client"` `<Chart/>` importing the server lib, and even noted the
edge-runtime incompatibility. But its remediation list ended with a parallel recommendation that
quietly competes with the real fix:

```
- Split pricing into a server-only module and pass computed values into Chart as props.
- Consider lazy-loading the chart (next/dynamic, ssr:false) so the charting lib
  isn't in the initial First Load JS for the route.
```

Lazy-loading a `"use client"` component that imports a server-only module does not close the boundary
leak — `pg`/`fs` still get bundled, just deferred — so offering it as a co-equal "consider" dilutes the
one cut that matters and risks the reviewer's fix landing as the cheap one.

**Failure class (confirmed).** Without this skill a reviewer can correctly enumerate the symptoms yet
fail to rank the boundary leak as the root cause, presenting "defer it" and "move it across the
boundary" as interchangeable options. This skill forces one assigned cut per finding and makes the
server/client boundary the primary axis, so a `next/dynamic` defer is never accepted as a substitute
for moving server-only code (`pg`/`fs`, the pricing lib) out of the client graph entirely.

---

## Examples

**Input:** "The dashboard route's First Load JS is 480 kB — what's in it?"
**Output:** Build + analyzer treemap shows the bulk is the Drizzle schema and `pg`-class driver in
the client chunk. Trace: the `<DashboardTable>` Client Component imports `~/server/api/root` to
"reuse a type," pulling the whole server closure across the boundary. Cut: import only the typed
tRPC client + `inferRouterOutputs` type (types are erased, they cost zero bytes); the router import
goes. Re-measure shows First Load JS back near the shared baseline. Hand the edit to `refactor`.

**Input:** "Bundle analyzer shows moment and lodash are the two biggest deps client-side."
**Output:** moment → `Intl.DateTimeFormat`/`date-fns` (moment is not tree-shakeable; ties to Rule 6
display-edge conversion). lodash whole-import → `import debounce from "lodash/debounce"` or `es-toolkit`.
Names estimated savings per swap from the treemap; hands swaps to `vertical-slice`.

**Input:** "Is the charting library why the report page is heavy?"
**Output:** Confirms recharts is in the route's client closure and imported eagerly though the chart
is below the fold. Cut: `next/dynamic(() => import("./Chart"), { ssr: false })` with a skeleton —
which also satisfies Rule 4's loading state. Flags that the loading skeleton must still render the
empty/error states; defers the a11y of the skeleton to `a11y-gate`.

---

## Edge Cases
- **The heavy thing is a type-only import** → types are erased at build; an `import type {...}` costs
  zero runtime bytes. Don't "fix" it; verify it's actually `import type`, not a value import used
  only as a type.
- **It's big but genuinely needed on that route** → don't delete; `next/dynamic`-defer it and ensure
  the loading state (Rule 4) is real, so weight moves off the critical path instead of out the door.
- **The dep is heavy *and* uses a Node API** → this is `edge-runtime-constraints`' territory; a trim
  won't fix the deploy break. Hand it off rather than shaving kB off a module that can't run at the edge.
- **Numbers only move in production builds** → never quote a `next dev` bundle size; re-run `next build`
  before and after any change so the before/after delta is real.

---

## References
- `references/measuring.md` — how to get truthful numbers: `@next/bundle-analyzer` setup, running
  `next build`, reading the First Load JS table and the treemap, before/after discipline.
- `references/boundary-leaks.md` — tracing the Server/Client boundary in App Router, the common
  leak patterns (router import, db/schema import, env, server SDK), and where each boundary belongs.
- `references/heavy-deps.md` — offender table of common heavy client deps with lighter, tree-shakeable
  or edge-native swaps, and the cut to assign each.

## Scripts
`scripts/` reserved. A script that parses `.next`'s build manifest / `app-build-manifest.json` to
diff per-route First Load JS between two builds (a regression gate) would justify one once the
manifest shape proves stable across Next versions. Empty for now.
