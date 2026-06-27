Purpose: offender table of common heavy client dependencies with lighter swaps and the cut to assign each.

# Heavy client dependencies and their cuts

Rank from the analyzer `client` treemap, then map each heavy module to one of four cuts:
- **swap** — replace with a lighter / tree-shakeable / edge-native equivalent
- **narrow** — change a whole-package import to a per-function import
- **defer** — `next/dynamic` it off the critical path (keep a real Rule 4 loading state)
- **move** — relabel as server-only / pass data as props (delete the `"use client"` reach)

## Offender table

| Dep / pattern | Why it's heavy | Cut |
|---|---|---|
| `moment` | ~60–70 kB min, not tree-shakeable, bundles all locales | swap → `Intl.DateTimeFormat` for display (ties to Rule 6: convert UTC at the display edge), or `date-fns`/`dayjs` if you need parsing |
| `import _ from "lodash"` | pulls the whole library | narrow → `import debounce from "lodash/debounce"`, or swap → `es-toolkit`, or use native (`structuredClone`, `Array.prototype.*`) |
| `lucide-react` / icon set as barrel | barrel import can pull siblings | narrow → per-icon path import; verify only used icons ship |
| `recharts` / `chart.js` / `d3` | large, often eager, frequently below the fold | defer → `next/dynamic(() => import("./Chart"), { ssr: false })` with a skeleton |
| `react-syntax-highlighter` / `shiki` (full) | bundles many languages/themes | narrow → register only needed languages, or defer; consider build-time highlight in a Server Component |
| `framer-motion` (whole) | large animation engine | narrow → import only the components used; for trivial motion prefer Tailwind v4 motion tokens (Rule 3) |
| markdown engine (`marked`+plugins, `react-markdown`) | parser ships to client | move → render markdown in a Server Component; ship HTML, not the parser |
| a date picker / rich editor / PDF lib | large, sometimes Node-bound | defer if client-only; if it needs a Node API it's an `edge-runtime-constraints` problem, not a trim |
| `zod` appearing oversized | usually fine (shared schema, Rule 8) — but a giant schema module imported wholesale can add up | narrow → import the specific schema, not a barrel of all schemas |

## Decision order for each offender
1. **Is it a type-only need?** Then it should be `import type` and cost zero. Fix the import kind, done.
2. **Is it server-renderable?** Move the work to a Server Component and pass the result as props.
3. **Is it needed in the browser but not immediately?** `defer` with `next/dynamic` + a loading state.
4. **Is a lighter equivalent available?** `swap`/`narrow`.
5. **Is it heavy *and* edge-incompatible?** Stop — hand to `edge-runtime-constraints`; trimming kB
   won't fix the deploy break.

## Don't over-cut
- A genuinely needed, already-deferred dep is fine; not every large module is a defect.
- Shared chunks amortize across routes — a dep used by every route in the shared chunk may be the
  right call. Quote the number, decide, and record a non-obvious keep in `DECISIONS.md`.
- Always re-measure (`measuring.md`): a swap that saves 2 kB but breaks tree-shaking elsewhere is a loss.
