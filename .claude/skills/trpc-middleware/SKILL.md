---
name: trpc-middleware
description: >
  Author the tRPC middleware layer for the edge stack: the `protectedProcedure` auth gate
  that narrows `ctx.auth.userId` to non-null (the foundation Rule 2 builds on), plus
  structured logging/timing and a rate-limit middleware — while keeping every procedure thin
  (validate, authorize, call a function, return). Produces the reusable procedure builders in
  `src/server/api/trpc.ts`, not per-feature logic.
  Use when: "trpc middleware", "protected procedure", "rate limit procedure", "auth middleware".
  Do NOT use for: per-feature ownership checks on a specific row (use vertical-slice), or
  threat-modeling a feature's abuse cases (use security-pass).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the failure class where the auth gate authenticates but
    procedures skip ownership, where business logic leaks into middleware, and where logging
    middleware records request bodies/PII at the edge. Baseline section is the encoded
    failure class; replace with an observed transcript.
---

# trpc-middleware

The procedure-builder layer every tRPC router stands on. This skill builds the shared
middleware in `src/server/api/trpc.ts` — the `protectedProcedure` auth gate, request
logging/timing, and rate limiting — so that `vertical-slice` only ever adds the thin,
per-feature ownership check on top. It draws the line between what the gate guarantees
(an authenticated `ctx.auth.userId`) and what it deliberately does not (ownership of a
specific row — Rule 2). The spine and rules live in `../../CLAUDE.md`; this skill does not
restate them.

---

## Non-Negotiable Rules

The auth gate is where a whole class of vulnerabilities is either prevented or invited:

- **Never let `protectedProcedure` imply authorization.** The gate proves *who* the caller is
  and narrows the context type; it does NOT prove the caller owns the row. Every procedure
  over a user-owned resource still checks ownership against `ctx.auth.userId` (Rule 2). The
  middleware's job is to make that check *possible* by guaranteeing a non-null userId, never
  to stand in for it.
- **Never put business logic in middleware.** Middleware does cross-cutting concerns
  (auth narrowing, logging, rate limiting). Domain reads/writes stay in the plain functions a
  thin procedure calls. A DB query for a feature's data inside middleware is drift.
- **Never log request input bodies, headers with tokens, or PII.** Log discipline is the top
  edge cost driver and a leak vector — log path, duration, userId, outcome; never `rawInput`.
- **Never trust `ctx.headers`/IP for rate-limit identity without validation.** Spoofable
  inputs are Rule 8 boundaries; key the limiter on `ctx.auth.userId` for protected routes.

Refuse these rationalizations: "protectedProcedure already secures it, ownership is
redundant"; "I'll log the whole input, it's just for debugging"; "one quick query in the
middleware saves a function call"; "rate-limit by IP is fine, headers are trustworthy."

---

## When to Use

- Standing up `src/server/api/trpc.ts`: `createTRPCContext`, the `t` instance, and the
  `publicProcedure` / `protectedProcedure` builders.
- Adding a cross-cutting middleware: timing/structured logging, or a rate-limit gate.
- Composing a new reusable procedure variant (e.g. `rateLimitedProcedure`) from existing ones.

## When NOT to Use

- Checking that *this* row belongs to the caller → `vertical-slice` owns per-feature ownership.
- Reasoning about a feature's abuse cases, headers, or dependency scan → `security-pass`.
- Scoping queries to an org/tenant rather than a single user → `multitenancy-scoping`.
- The first-time scaffold of the whole repo (which seeds this file) → `t3-genesis`.

---

## Procedure

1. **Confirm the context shape first (medium-interrogation).** `createTRPCContext` must expose
   Clerk's `auth` (from `clerkMiddleware`) and the edge `db`. Decide whether `auth` is the
   resolved object or a getter; this dictates how the gate narrows types. See
   `references/procedure-builders.md`.
2. **Build the auth gate as a type-narrowing middleware.** The `protectedProcedure` middleware
   throws `TRPCError({ code: "UNAUTHORIZED" })` when `ctx.auth.userId` is null, then calls
   `next({ ctx: { auth: { ...ctx.auth, userId } } })` so downstream `ctx.auth.userId` is
   typed `string`, not `string | null`. This is the Rule 2 foundation, not Rule 2 itself.
   See `references/procedure-builders.md`.
3. **Keep procedures thin — state the contract in code comments.** The builder file is where
   "validate, authorize, call a function, return" is enforced by convention: a banner noting
   middleware does cross-cutting work only; domain logic lives in `src/server/<feature>`.
4. **Add timing + structured logging middleware (low-interrogation).** Measure
   `Date.now()` around `next()`, emit one leveled, structured line: path, type, durationMs,
   userId (if present), ok/err. Never `rawInput`. Honors the log-discipline note in
   `../../CLAUDE.md`. See `references/observability-and-ratelimit.md`.
5. **Add rate limiting only where justified (high-interrogation — cost of being wrong is a
   DoS hole or a blocked legit user).** Key on `ctx.auth.userId` for protected routes; use an
   edge-compatible store (Upstash Ratelimit / Redis REST), never an in-memory Map at the edge.
   Throw `TRPCError({ code: "TOO_MANY_REQUESTS" })`. See `references/observability-and-ratelimit.md`.
6. **Compose, don't fork.** Build `rateLimitedProcedure = protectedProcedure.use(rateLimit)`
   rather than a parallel builder. Each new variant is the previous one `.use()`-extended.
7. **Validate every boundary the middleware reads (Rule 8).** Env (limiter URL/token), and any
   header you key on, are Zod-parsed in the context/config, not read raw. Record any new
   procedure variant or limiter choice in `DECISIONS.md`.

---

## Composes With

- **Feeds:** `vertical-slice` — it imports `protectedProcedure` and adds the per-row ownership
  check on top of the gate this skill builds.
- **Pairs with:** `security-pass` (confirms the gate + limiter answer the threat model),
  `multitenancy-scoping` (extends the gate to tenant-scoped context).
- **Consumes:** the context and Clerk wiring seeded by `t3-genesis`.
- **Runs against:** `rule-audit` — Rule 2 and Rule 8 findings point back here when the gate
  or boundary validation is wrong.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent told to implement as
> a typical dev would, with no project conventions). The encoded failure class was confirmed.

**Observed run.** Prompt: "Add a tRPC procedure to delete a post.". With no skill the agent produced:

```ts
export const postRouter = createTRPCRouter({
  deletePost: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(posts).where(eq(posts.id, input.id));
      return { success: true };
    }),
});
```

Its own note: *"Used protectedProcedure so only signed-in users can call it, and delete the post directly by its id."* — this treats authentication as authorization (Rule 2): any signed-in user can delete any post because the `where` clause filters by `id` alone, never by `ctx.auth.userId`.

**Failure class (confirmed).** The auth gate proves *who* the caller is but not *what* they own; a procedure that trusts `protectedProcedure` and omits the ownership predicate hands every signed-in user a delete-anything primitive. The naive version compounds this with a hard delete (no `deleted_at`), a serial/integer public id instead of UUIDv7, no audit record of who deleted what, and a hand-rolled `{ success: true }` instead of a typed result. This skill builds the gate that makes the ownership check *possible* and draws the line so the per-feature check is never skipped.

---

## Examples

**Input:** "Set up our protected procedure."
**Output:** Builds `t = initTRPC.context<Context>().create()`, then
`protectedProcedure = t.procedure.use(({ ctx, next }) => { if (!ctx.auth.userId) throw new
TRPCError({ code: "UNAUTHORIZED" }); return next({ ctx: { auth: { ...ctx.auth, userId:
ctx.auth.userId } } }); })`. Adds the timing/logging middleware and a banner comment that
ownership is still the caller's job. Notes "this gate is Rule 2's foundation, not Rule 2."

**Input:** "Add rate limiting to the mutation that sends invites."
**Output:** Confirms identity to key on (userId, not IP) and the edge store (Upstash REST).
Builds `rateLimitedProcedure = protectedProcedure.use(rateLimit)`, where `rateLimit` calls
`ratelimit.limit(ctx.auth.userId)` and throws `TOO_MANY_REQUESTS` on deny. Hands the
ownership check on the invited resource to `vertical-slice`; records the limiter in
`DECISIONS.md`. When asked to log inputs for debugging, it refuses `rawInput` (log discipline)
and offers a redacted, allow-listed projection instead.

---

## Edge Cases

- **A procedure must be public but rate-limited** → compose `publicProcedure.use(rateLimit)`
  and key the limiter on a validated IP (Rule 8), accepting it is best-effort, not identity.
- **You need the org/tenant, not just the user** → stop; that narrowing belongs to
  `multitenancy-scoping`, which extends this gate's context.
- **In-memory limiter "works" in dev** → it does not survive at the edge (per-isolate, ephemeral);
  require the external store before shipping, note the dev/prod gap in `DECISIONS.md`.
- **Middleware needs data to authorize** → that's a per-row ownership check, not middleware;
  move it into the procedure body / domain function (`vertical-slice`).

---

## References

- `references/procedure-builders.md` — the `trpc.ts` builder file: context, `t` instance,
  `publicProcedure`, the type-narrowing `protectedProcedure` gate, and the thin-procedure contract.
- `references/observability-and-ratelimit.md` — timing/structured-logging middleware (PII-safe)
  and an edge-compatible rate-limit middleware keyed on userId, with composition examples.

## Scripts

- Reserved; `scripts/.gitkeep` only. A script would be justified if a mechanical check could
  flag a `protectedProcedure` whose middleware returns `next()` without re-narrowing `ctx`, or
  a logging middleware referencing `rawInput` — both are AST-detectable. `rule-audit` covers
  the Rule 2/Rule 8 surface for now.
