# CLAUDE.md — Stack Directives (Source of Truth for `claude-suite`)

This is the **bundled, self-contained source of truth** for the `claude-suite` distribution.
Every skill, agent, command, and hook in this suite points here. When a primitive and this
file disagree, this file wins. When this file and `DECISIONS.md` disagree, `DECISIONS.md`
wins (it records the project-specific resolution of a fork this file states in the abstract).

> This file mirrors the spine and nine rules of the parent repository's root `CLAUDE.md`.
> It is bundled so the suite remains valid when installed into a project that does not have
> the parent repo's root file. If you install this suite into an existing repo that already
> has its own root `CLAUDE.md`, treat the root file as canonical and delete this copy.

The split: **`CLAUDE.md` holds decided calls with no repeatable failing task** (the kind of
thing that is just a rule). **Skills hold the repeatable, failure-prone procedures.** If you
find yourself wanting to write a procedure here, it belongs in a skill; if a skill restates
a flat decision, it belongs here.

---

## The decided stack (the spine)

These are decided. Do not re-litigate them per-feature; record any deviation in
`DECISIONS.md` with a reason.

- **Framework:** Next.js (App Router only). No Pages Router. `getServerSideProps`,
  `_app.tsx` data fetching, or a `pages/` directory is drift — stop.
- **Deployment target:** **Edge runtime.** This is the fork-defining fact. It is why the
  data layer is Drizzle (not Prisma) and why auth and the DB driver are edge-compatible.
- **ORM / data layer:** **Drizzle ORM** with `drizzle-kit` for migrations. Schema is
  authored as TypeScript in `src/db/schema/`. Drizzle's inferred types
  (`$inferSelect` / `$inferInsert`, `InferSelectModel` / `InferInsertModel`) are the **root
  of the type chain** — every type downstream (tRPC, Zod, forms, components) traces back.
- **Database driver:** A serverless/HTTP driver compatible with the edge runtime (Neon
  serverless or Turso/libSQL class). No long-lived TCP pool at the edge.
- **Auth:** Clerk, via its **edge-compatible middleware** (`clerkMiddleware` in
  `middleware.ts`). Auth is wired at genesis; features never re-implement it.
- **API:** tRPC. Every procedure is `publicProcedure` or `protectedProcedure`. Procedures
  are **thin** — validate, authorize, call a function, return. Business logic lives in plain
  functions the procedure calls, not inlined.
- **Validation:** Zod. **One** schema per entity-operation, **shared** between the tRPC
  input and the client form. Never two drifting copies.
- **Forms:** React Hook Form + the shared Zod schema via `@hookform/resolvers/zod`.
- **Styling:** Tailwind v4. Tokens are **CSS-first** via `@theme`. No `tailwind.config.js`
  as token source, no JS token objects.
- **UI primitives:** shadcn/ui (Radix under the hood). Interactive behavior (dialogs, menus,
  comboboxes, focus traps) is **never hand-built** — compose primitives.

---

## The nine inviolable rules (what `rule-audit` enforces)

Non-negotiable. Generated code that violates them compiles and looks fine, which is exactly
why a human reviewing at speed misses them and why `rule-audit` scans for them mechanically.

1. **Unbroken type chain.** No `any`, no `@ts-ignore`, no untyped `fetch`/`JSON.parse`
   crossing a boundary. Types trace from Drizzle inference outward, unbroken.
2. **Authorization on every protected procedure.** `protectedProcedure` is necessary but not
   sufficient: every query/mutation touching a user-owned resource MUST also check
   **ownership** (the row belongs to `ctx.auth.userId`). Missing ownership checks are the #1
   vulnerability class — authentication is not authorization.
3. **No hardcoded style values.** No raw hex, no arbitrary `px` in `className`, no magic
   spacing. Everything resolves to a token.
4. **All four component states.** Every data-bound component renders **loading, empty,
   error, and success.** Happy-path-only is incomplete, not done.
5. **Money is never a float.** Store and compute money as integer minor units (cents) or a
   decimal type. Never `number`-as-dollars.
6. **Timestamps are UTC, stored as `timestamptz`.** No local-time storage. Convert at the
   display edge only.
7. **No N+1 access.** Use Drizzle relational queries / joins, not per-row queries in a loop.
   A query inside a `.map()` over rows is the tell.
8. **Validated boundaries.** Every external input (tRPC input, route param, webhook body,
   env var) is Zod-parsed before use.
9. **No secrets client-side.** No secret in `NEXT_PUBLIC_*`, no key in a Client Component.
   Server-only stays server-only.

---

## Design tokens

- Palette in **OKLCH**, expressed as Tailwind v4 `@theme` CSS variables in the global
  stylesheet. Not a JS object, not `tailwind.config`.
- **Modular type scale**, **8pt spacing system**, **motion tokens** — all `@theme` variables.
- **Contrast is pre-verified to WCAG 2.2 AA** before any palette ships.

## Money, time, IDs

- **Money:** integer minor units, or a typed decimal. Rule 5.
- **Time:** `timestamptz`, UTC, convert at display. Rule 6.
- **IDs:** UUIDv7 for anything public-facing (sortable, non-enumerable); `BIGSERIAL`
  acceptable for internal-only rows. Decide per table at schema time; record non-obvious
  choices in `DECISIONS.md`.
- **Soft vs hard delete:** decided per entity at schema time; a `deleted_at timestamptz`
  nullable column when soft. An explicit call, not a default.

## Schema conventions

- Table and column names: `snake_case`.
- Every table: a primary key, `created_at` and `updated_at` (`timestamptz`, default now).
- Every relation explicit, correct cardinality, a foreign-key constraint.
- Index every foreign key and every column you filter or sort on frequently.
- Normalize by default; reach for `jsonb` only for genuinely schemaless, non-queried data,
  and record the choice.

## Migrations

- **Expand-contract, always** for anything destructive: expand (add new) → migrate data →
  switch reads/writes → contract (remove old), across separate deploys.
- Every migration **reversible** (a working `down`).
- Generated via `drizzle-kit generate`; reviewed before apply; never auto-applied
  destructively in CI without a gate.

## Quality gates (definition of done)

A change is done only when all four pass: **`rule-audit`** (nine rules clean), **`a11y-gate`**
(axe clean + manual WCAG 2.2 AA items), **`security-pass`** (threat model answered, headers
verified, deps scanned), and **`design-gate`** (design-system adherence + craft: spacing/type
on-scale, colors used by semantic role and colorblind-safe, hierarchy legible, the four states
crafted — defers contrast to `a11y-gate`, hardcoded values to `rule-audit`). Plus deterministic
CI gates: **performance budget** (LCP/INP/CLS at p75) and the **dependency scan**.

## Observability & cost

- OTel traces + Sentry, instrumented at genesis.
- **Log discipline:** structured, leveled, sampled. Indiscriminate logging is the top edge
  cost driver — do not log per-request bodies or PII.
- A **spend cap** is set before launch, not after the bill.

## Decision records & maintenance

Every resolved fork goes in `DECISIONS.md` as it happens, with date and one-line rationale.
The dated specifics in this file — OWASP ordering, Core Web Vitals thresholds, tool versions,
the Drizzle/Clerk/edge-driver standings — **perish**; `perishable-refresh` re-verifies them.
Durable principles (the spine, the nine rules, the type-chain discipline) are stable by
design.
