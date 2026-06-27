# Rule checklist — the judgment-pass companion

Per rule: what to look for, how it's usually missed, the fix. Rules defined in
`../../../CLAUDE.md`; this is how to *check* them.

## 1 — Unbroken type chain
- **Look for:** `any`, `@ts-ignore`, `@ts-expect-error`, untyped `fetch`/`JSON.parse`.
- **Missed because:** an `any` makes a stubborn boundary compile, so it ships.
- **Fix:** infer from Drizzle (`$inferSelect`) or the router (`inferRouterOutputs`); if
  types won't line up, the design is wrong.

## 2 — Authorization (ownership) — HIGHEST VALUE, LEAST MECHANICAL
- **Look for:** every `protectedProcedure` touching a user-owned row. Confirm an
  ownership assertion (`row.ownerId === ctx.auth.userId`) runs before the read/write.
- **Missed because:** `protectedProcedure` *looks* like enough; authentication is
  mistaken for authorization.
- **Fix:** add `assertOwns…`, throw `NOT_FOUND` (not `FORBIDDEN`) on mismatch so
  existence doesn't leak.

## 3 — No hardcoded style
- **Look for:** hex, arbitrary px, magic spacing in `className`.
- **Fix:** resolve to an `@theme` token.

## 4 — Four component states
- **Look for:** every data-bound component renders loading, empty, error, success.
- **Missed because:** the success state is the one you build to see it work.
- **Fix:** add the missing states; empty usually needs a CTA, error a retry.

## 5 — Money never float · 6 — Time UTC timestamptz · 7 — No N+1
- See CLAUDE.md; the script flags candidates; confirm intent for rule 7 (batch logic can
  look like N+1).

## 8 — Validated boundaries
- **Look for:** every tRPC input, route param, webhook body, env var Zod-parsed before
  use.

## 9 — No client-side secrets
- **Look for:** secrets in `NEXT_PUBLIC_*` or imported into Client Components.
