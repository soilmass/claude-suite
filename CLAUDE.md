# CLAUDE.md — Stack Directives (Source of Truth)

This file is the **single source of truth** for the decided stack. Every skill in
`.claude/skills/` points here. When a skill and this file disagree, this file wins.
When this file and `DECISIONS.md` disagree, `DECISIONS.md` wins (it records the
project-specific resolution of a fork this file states in the abstract).

The split: **`CLAUDE.md` holds decided calls with no repeatable failing task**
(the kind of thing that is just a rule). **Skills hold the repeatable, failure-prone
procedures.** If you find yourself wanting to write a procedure here, it belongs in a
skill; if you find a skill restating a flat decision, it belongs here.

---

## The decided stack (the spine)

These are decided. Do not re-litigate them per-feature; record any deviation in
`DECISIONS.md` with a reason.

- **Framework:** Next.js (App Router only). No Pages Router. If you see `pages/`
  patterns creeping in (`getServerSideProps`, `_app.tsx` data fetching), that is drift — stop.
- **Deployment target:** **Edge runtime.** This is the fork-defining fact. It is why
  the data layer is Drizzle, not Prisma (see below), and why auth and the DB driver
  are their edge-compatible variants.
- **ORM / data layer:** **Drizzle ORM** with `drizzle-kit` for migrations. Schema is
  authored as TypeScript in `src/db/schema/`. Drizzle's inferred types
  (`InferSelectModel` / `InferInsertModel`) are the **root of the type chain** — every
  type downstream (tRPC, Zod, forms, components) traces back to them.
  - *Why not Prisma:* Prisma's edge story remains proxy/driver-adapter dependent and
    adds a runtime engine; Drizzle compiles to plain SQL and runs natively at the edge.
    This is the decided fork. (Recorded in `DECISIONS.md`.)
- **Database driver:** A serverless/HTTP driver compatible with the edge runtime
  (Neon serverless or Turso/libSQL class). No long-lived TCP pool at the edge.
- **Auth:** Clerk, via its **edge-compatible middleware** (`clerkMiddleware` in
  `middleware.ts`). Auth is wired at genesis; features never re-implement it.
- **API:** tRPC. Every procedure is either `publicProcedure` or `protectedProcedure`.
  Procedures are **thin** — they validate, authorize, call a function, and return.
  Business logic lives in plain functions the procedure calls, not inlined in the procedure.
- **Validation:** Zod. **One** schema per entity-operation, **shared** between the
  tRPC input and the client form. Never two drifting copies.
- **Forms:** React Hook Form + the shared Zod schema via `@hookform/resolvers/zod`.
- **Styling:** Tailwind v4. Tokens are **CSS-first** via `@theme` (see Design tokens
  below). No `tailwind.config.js`-as-token-source, no JS token objects.
- **UI primitives:** shadcn/ui (Radix under the hood). Interactive behavior
  (dialogs, menus, comboboxes, focus traps) is **never hand-built** — compose primitives.

---

## The inviolable rules (what `rule-audit` enforces)

These nine are non-negotiable. Generated code that violates them compiles and looks
fine, which is exactly why a human reviewing at speed misses them and why `rule-audit`
exists to scan for them mechanically.

1. **Unbroken type chain.** No `any`, no `@ts-ignore`, no untyped `fetch`/`JSON.parse`
   crossing a boundary. Types trace from Drizzle inference outward, unbroken.
2. **Authorization on every protected procedure.** `protectedProcedure` is necessary
   but not sufficient: every query/mutation touching a user-owned resource MUST also
   check **ownership** (the row belongs to `ctx.auth.userId`). Missing ownership checks
   are the #1 vulnerability class — authentication is not authorization.
3. **No hardcoded style values.** No raw hex, no arbitrary `px` in `className`, no
   magic spacing. Everything resolves to a token (see Design tokens).
4. **All four component states.** Every data-bound component renders **loading,
   empty, error, and success.** Happy-path-only is incomplete, not done.
5. **Money is never a float.** Store and compute money as integer minor units
   (cents) or a decimal type. Never `number`-as-dollars.
6. **Timestamps are UTC, stored as `timestamptz`.** No local-time storage. Convert at
   the display edge only.
7. **No N+1 access.** Use Drizzle relational queries / joins, not per-row queries in a
   loop. A query inside a `.map()` over rows is the tell.
8. **Validated boundaries.** Every external input (tRPC input, route param, webhook
   body, env var) is Zod-parsed before use.
9. **No secrets client-side.** No secret in `NEXT_PUBLIC_*`, no key in a Client
   Component. Server-only stays server-only.

---

## Design tokens (what `design-tokens` produces, what `rule-audit` rule 3 checks against)

- Palette in **OKLCH**, expressed as Tailwind v4 `@theme` CSS variables in the global
  stylesheet. Not a JS object, not `tailwind.config`.
- **Modular type scale**, **8pt spacing system**, **motion tokens** — all as `@theme`
  variables.
- **Contrast is pre-verified to WCAG 2.2 AA** before any palette ships. A palette that
  has not been contrast-checked is not done.

---

## Money, time, IDs (cross-cutting data conventions)

- **Money:** integer minor units, or a typed decimal. Rule 5.
- **Time:** `timestamptz`, UTC, convert at display. Rule 6.
- **IDs:** UUIDv7 for anything public-facing (sortable, non-enumerable); `BIGSERIAL`
  acceptable for internal-only rows. Decide per table at schema time and record
  non-obvious choices in `DECISIONS.md`.
- **Soft vs hard delete:** decided per entity at schema time; a `deleted_at timestamptz`
  nullable column when soft. Not a default — an explicit call.

## Schema conventions (what `schema-design` follows)

- Table and column names: `snake_case`.
- Every table: a primary key, `created_at` and `updated_at` (`timestamptz`, default now).
- Every relation explicit, with the correct cardinality and a foreign-key constraint.
- Index every foreign key and every column you filter or sort on frequently.
- Normalize by default; reach for a `jsonb` column only for genuinely schemaless,
  non-queried data, and record the choice.

## Migrations (what `migration-author` enforces)

- **Expand-contract, always**, for anything destructive (rename, drop, type change):
  expand (add new) → migrate data → switch reads/writes → contract (remove old), across
  separate deploys.
- Every migration is **reversible** (a working `down`).
- Generated via `drizzle-kit generate`; reviewed before apply; never auto-applied
  destructively in CI without a gate.

## Quality gates (definition of done)

A change is done only when all four pass:

- **`rule-audit`** — the nine rules above, clean.
- **`a11y-gate`** — axe clean + the manual WCAG 2.2 AA items checked.
- **`security-pass`** — threat-model questions answered, headers verified, deps scanned.
- **`design-gate`** — design-system adherence + craft: spacing and type on-scale, colors used
  by semantic role and colorblind-safe, hierarchy legible, the four states crafted. Defers
  contrast to `a11y-gate` and hardcoded-value detection to `rule-audit`.

Plus the deterministic, non-skill gates:

- **Performance budget (CI):** LCP / INP / CLS at **p75** within budget. Build-failing.
  Deterministic — lives in CI config, not a skill. Thresholds are maintained by
  `perishable-refresh` since they date.
- **Dependency scan (CI):** automated; `security-pass` confirms it ran, doesn't replace it.

**Enforcement model.** The mechanical gates run in CI and block merge (`rule-audit` scan, the
a11y axe run via `ci-a11y-test`, perf budget, dependency scan). The judgment gates a CI job
cannot decide — `security-pass` and `design-gate`, plus the manual halves of
`rule-audit`/`a11y-gate` — are confirmed on the PR via a required reviewer acknowledgement, not
left implicit. `ci-pipeline` wires both halves.

---

## API, integration & edge conventions

- **Idempotency.** Every effectful mutation and all webhook processing is safe to retry — an
  idempotency key + dedup store, processed exactly once (`idempotency-keys`). The retry is the
  rule, not the exception.
- **Error taxonomy.** Failures are typed `TRPCError` codes from one shared taxonomy, mapped to
  the form field; no stack trace, internal message, SQL, or PII reaches the client
  (`error-taxonomy`, Rule-9-adjacent).
- **Rate limiting.** Protected and public procedures are rate-limited; auth endpoints are
  hardened against brute-force / credential-stuffing (`rate-limit-strategy` over `trpc-middleware`).
- **Inbound webhooks.** Verify the signature **before** parsing, Zod-parse the verified payload,
  process idempotently keyed on the event id (`webhook-handler`).
- **Money/atomicity at the edge.** Multi-statement interactive transactions don't exist over the
  HTTP driver — use guarded single statements, CTEs, `db.batch`, or idempotent sagas with a named
  consistency boundary (`edge-transactions`).

### Edge runtime boundaries (and the escape hatch)

The edge runtime has **no long-lived compute and no persistent connections** — so background
jobs / queues / cron and websockets / SSE are **out of band by design**, not unsupported. When a
feature needs them, don't force them into an edge route: offload async work to a queue/worker
(QStash, Inngest, a durable workflow) and use a managed realtime service for live updates, then
record the choice in `DECISIONS.md`. The edge stays the request path; long-running work lives
beside it.

---

## Microcopy & voice

Product copy is in the product's voice (see project voice notes). This is a human-pass
concern with a `CLAUDE.md` reminder, **not** a skill — too subjective to formalize
without over-fitting. Draft in-voice; a human reviews.

## Observability & cost

- OTel traces + Sentry, instrumented at genesis.
- **Log discipline:** structured, leveled, sampled. Indiscriminate logging is the top
  edge cost driver — do not log per-request bodies or PII.
- A **spend cap** is set before launch, not after the bill.

---

## Decision records

Every resolved fork (a place where this file states an abstract default and the project
made it concrete) goes in `DECISIONS.md` **as it happens**, with date and one-line
rationale. Skills that resolve a fork record it there rather than choosing silently.

## Maintenance

The dated specifics in this file and the reference — OWASP ordering, Core Web Vitals
metrics and thresholds, tool versions, the Drizzle/Clerk/edge-driver standings — **perish.**
`perishable-refresh` re-verifies them against current sources and proposes updates; it
never rewrites this file silently. Durable principles (the spine, the nine rules, the
type-chain discipline) are stable by design and are not touched by refresh.
