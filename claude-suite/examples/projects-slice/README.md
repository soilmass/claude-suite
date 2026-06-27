# Example: a clean vertical slice (projects: create + rename)

A reference implementation of a type-safe feature slice on the decided edge stack, used to
validate the review/gate layer. It is **clean against all nine rules** and was confirmed so by
`rule-audit` (scan exit 0 — only informational ownership hints), the `t3-reviewer` agent
(CLEAN verdict), and `n1-hunter-agent` (no N+1).

- `schema.ts` — Drizzle table (snake_case, PK, `timestamptz`, FK index) + the two shared Zod
  schemas (one per operation).
- `router.ts` — thin tRPC procedures with the ownership check (Rule 2), no N+1 (Rule 7), and a
  batch-load helper (`inArray`).
- `ProjectList.tsx` — a data-bound component rendering all four states (Rule 4), tokens only
  (Rule 3).

Imports use `~/...` aliases that assume a scaffolded T3 app; this directory is illustrative,
not a buildable package. Pair it with the deliberately-flawed counterpart used in testing to
see what each rule violation looks like.
