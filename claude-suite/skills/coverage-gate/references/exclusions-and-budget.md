Purpose: what to exclude from coverage on the edge stack and why, which modules earn per-file floors, and the ratchet policy that keeps the budget honest.

# The exclusion principle

Coverage measures *logic you could have tested but didn't*. Anything with no testable branch in it
only dilutes the number — and a diluted number lets real untested logic hide. So exclude code that
is generated, declarative, or scaffolded; keep every hand-written branch in scope.

## Exclude (no logic to test)

| Path | Why excluded |
| --- | --- |
| `src/db/migrations/**` | drizzle-kit generated SQL + journal; not executed by tests |
| `src/db/schema/**` | table/relation definitions are declarative; types flow from them (Rule 1) but there is no branch to cover |
| `**/*.config.*` | build/test/tooling config |
| `**/*.d.ts` | type declarations, zero runtime |
| `src/env.*` | the env Zod schema (Rule 8) gets ONE dedicated boundary test; excluded here so it isn't double-counted as a thin always-true module |
| `src/components/ui/**` | shadcn primitives — composed, not authored (per CLAUDE.md); their behavior is Radix's, tested upstream |
| `src/**/index.ts` | barrel re-exports: no logic |
| `**/*.stories.tsx`, `.next/**` | Storybook / framework-generated |

## Never exclude (this is the logic the gate protects)

- The plain functions thin tRPC procedures call (money math, scoring, state transitions) — the
  exact layer `vitest-unit` targets.
- Ownership / authorization helpers (Rule 2).
- Shared Zod schemas' refinements (Rule 8).
- tRPC procedure bodies (covered by `trpc-integration-test`).

Excluding any of these to "fix" a failing threshold is the anti-pattern in this skill's
Non-Negotiable Rules — you would be hiding precisely what the gate exists to catch. If a file
genuinely has an unreachable line, use a line-level `/* v8 ignore next */`, not a file exclusion,
and record it in `DECISIONS.md`.

# Per-file floors for high-blast-radius modules

A global average is a weighted blur: 91% global can mean a 100%-covered 900-line UI tree and a
0%-covered 90-line money module. Set strict per-file floors so the dangerous files cannot hide:

| Glob | Floor | Rule |
| --- | --- | --- |
| `src/lib/money/**` | `branches: 100` | 5 — every rounding/sign branch on integer minor units |
| `src/server/api/**/ownership.ts` | `branches: 100, lines: 100` | 2 — the allow/deny branch is the whole point |
| `src/lib/validation/**` | `functions: 95, lines: 95` | 8 — each refinement's accept and reject path |
| date/UTC helpers | `branches: 90+` | 6 — boundary/month/DST branches |

`branches: 100` on money and ownership is the honest target: line coverage rewards running the
happy path; branch coverage forces the `else` (the denied request, the negative quantity, the
empty result) that maps to the four-states gap (Rule 4) and the ownership gap (Rule 2).

# Setting the initial budget

Do not paste an aspirational `90`. Measure first:

```bash
pnpm test:coverage   # read the text-summary totals
```

Set each global metric to the **measured value rounded down** to the nearest whole (or nearest 5).
An enforced floor at today's real number beats an ignored floor at a dream number — a gate that
blocks every PR gets disabled, which is worse than no gate. Record the starting numbers and the
date in `DECISIONS.md`.

# The ratchet

- `autoUpdate: true` raises the in-file thresholds after a green run; commit the bump as part of the
  change that added the tests.
- The floor only moves up. A red build means a test is missing — write it (`vitest-unit`,
  `trpc-integration-test`). Lowering the threshold to go green is forbidden; it converts the gate
  into a rubber stamp and is the exact drift this skill prevents.
- Review the ratcheted numbers at each `perishable-refresh` pass alongside the other dated CI
  thresholds, so the budget reflects current reality rather than a one-time setup.

# Coverage theater — the smells

- A high global number with no `branches` threshold set.
- An `exclude` list that grew right after a threshold started failing.
- `--coverage` in a script but no `thresholds`, or a CI step wrapped in `|| true`.
- 100% on a module that is all getters/barrel exports, masking a 0% sibling that holds the logic.
