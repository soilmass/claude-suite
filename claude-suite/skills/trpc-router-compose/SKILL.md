---
name: trpc-router-compose
description: >
  Stand up and grow the tRPC wiring on the edge stack: build the request context
  (Clerk auth + edge Drizzle client), initialize tRPC once, define the
  publicProcedure / protectedProcedure bases, merge sub-routers into the root
  appRouter, and export the AppRouter type the client consumes. This is the
  plumbing every feature plugs into, not a feature itself. Get the context shape
  and the type-only client import right once, here, so every downstream slice
  inherits an unbroken type chain (rule 1) and never leaks a secret to the client
  (rule 9).
  Use when: "set up trpc", "compose routers", "trpc context", "app router type".
  Do NOT use for: a single procedure plus its UI (use vertical-slice); writing the
  auth/logging/ratelimit middleware that procedures wrap (use trpc-middleware).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the router-wiring failure class: edge-incompatible
    context, the server router leaking into the client bundle, and an untyped AppRouter.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# trpc-router-compose

The wiring layer for tRPC on the decided edge stack (see `../../CLAUDE.md`): one
context factory, one `initTRPC` call, the two procedure bases, the root router merge,
and the `AppRouter` type export. Done right once, every `vertical-slice` plugs in and
the type chain holds end to end. Done wrong, the whole app inherits an edge-incompatible
context, a fat server bundle on the client, or `any` at the boundary.

## Non-Negotiable Rules

- **Never import the router *implementation* into client code.** The client imports
  `type { AppRouter }` only (`import type`), so no server code or secret reaches the
  bundle (rule 9). A value import of `appRouter` is the tell.
- **Never put a long-lived TCP pool or Node-only API in the context factory.** The
  context runs at the edge — use the serverless/HTTP Drizzle client (Neon/Turso class),
  per `../../CLAUDE.md`. `pg.Pool` or `fs` in context is drift.
- **Never type the context or `ctx.auth` as `any`/loose.** `createTRPCContext`'s return
  type is the root of every procedure's `ctx` type (rule 1); infer it, export it.
- **Never gate ownership in the root or context.** Context attaches `auth` and `db`;
  `protectedProcedure` asserts authentication; per-row ownership (rule 2) lives in the
  procedure body — this skill does not own it.

Refuse these rationalizations: "a value import is fine, tree-shaking drops it";
"I'll use the normal pg driver, edge can reach the DB anyway"; "`ctx: any` until the
features land"; "I'll check ownership centrally in context to save repetition."

## When to Use

- Standing up tRPC for the first time after `t3-genesis` (or it was stubbed and needs filling).
- Adding a new top-level sub-router (e.g. `billing`, `projects`) and merging it into root.
- Fixing a broken `AppRouter` type export or a client that pulls in server code.
- Building the route handler + RSC/server-side caller that feed the context in.

## When NOT to Use

- Building one procedure and its form/UI end to end — use **vertical-slice** (it
  *consumes* the bases this skill exports).
- Authoring the auth/logging/rate-limit/timing middleware itself — use **trpc-middleware**;
  this skill only wires the bases those middlewares extend.
- Designing tables behind a router — use **schema-design**.
- Auditing finished wiring against the nine rules — use **rule-audit**.

## Procedure

1. **Decide the context's contents (interrogation: high).** Context is the root of every
   `ctx` type; a wrong shape costs a refactor across every procedure. It carries exactly
   `auth` (from Clerk's edge `auth()`), `db` (the edge Drizzle client), and request-scoped
   extras (headers). Nothing feature-specific. See `references/context.md`.

2. **Write `createTRPCContext` edge-compatibly (interrogation: high).** One async factory
   that reads Clerk auth and hands back the edge `db`. No Node-only APIs, no TCP pool
   (Non-Negotiable). Export `type Context = Awaited<ReturnType<typeof createTRPCContext>>`
   so the type flows. See `references/context.md`.

3. **Initialize tRPC once with a typed transformer and errorFormatter (interrogation: medium).**
   A single `initTRPC.context<Context>().create({ transformer: superjson, errorFormatter })`.
   The errorFormatter surfaces Zod flattening so client forms can read field errors (rule 8).
   See `references/context.md`.

4. **Export the procedure bases (interrogation: medium).** `publicProcedure = t.procedure`
   and `protectedProcedure = t.procedure.use(enforceAuth)` where `enforceAuth` narrows
   `ctx.auth.userId` to non-null. The actual middleware bodies are **trpc-middleware**'s job;
   here you only compose them onto the bases. See `references/router-composition.md`.

5. **Merge sub-routers into the root (interrogation: medium).** `createTRPCRouter({ ... })`
   namespaced by domain (`post`, `billing`). Keep the root flat — namespaces, not deep
   nesting. Record any non-obvious namespace split in `DECISIONS.md`. See
   `references/router-composition.md`.

6. **Export `AppRouter` as a type and wire the client type-only (interrogation: high).**
   `export type AppRouter = typeof appRouter` from the server; the client does
   `import type { AppRouter }` (Non-Negotiable, rule 9). See `references/router-composition.md`.

7. **Mount the fetch route handler and the server-side caller (interrogation: medium).**
   The App Router handler at `app/api/trpc/[trpc]/route.ts` uses `fetchRequestHandler` with
   `createTRPCContext`; the RSC/server caller reuses the same factory so context never forks.
   See `references/router-composition.md`.

## Composes With

- **Pairs with:** `trpc-middleware` (owns the middleware bodies this skill composes onto the
  bases; `protectedProcedure`'s `enforceAuth` lives there).
- **Feeds:** `vertical-slice` (every slice imports `publicProcedure`/`protectedProcedure`,
  `createTRPCRouter`, and merges its sub-router into the root defined here).
- **Consumes:** `t3-genesis` (scaffolds the initial stubs), `schema-design` (the `db` schema
  the context's client is typed against).
- **Hands off:** `rule-audit` (verify rules 1, 8, 9 on the wiring), `security-pass`.

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> This is the encoded failure *class*, not a captured transcript. Replace with a real one
> when observed.

**Failure class encoded:** Without this skill, generated tRPC wiring typically ships:
- A context that imports a Node `pg.Pool` / `postgres-js` TCP client — works in `next dev`,
  throws or hangs once deployed to the edge runtime.
- The client calling `createTRPCClient<typeof appRouter>` with a **value** import of
  `appRouter`, dragging server code (and any secret it touches) into the browser bundle (rule 9).
- `AppRouter` never exported as a type, or exported as `any`, breaking inference so every
  client call returns `unknown`/`any` (rule 1).
- `initTRPC` called per-router instead of once, so transformer/errorFormatter config diverges
  and Zod field errors never reach forms (rule 8).
- Deeply nested routers (`router.user.profile.settings`) instead of flat domain namespaces,
  making the surface hard to merge and audit.

## Examples

- **Input:** "set up trpc for the app." → **Output:** `src/server/api/trpc.ts` with edge
  `createTRPCContext` (Clerk `auth()` + Neon Drizzle client), one `initTRPC.context<Context>()`
  with superjson + Zod errorFormatter, exported `publicProcedure`/`protectedProcedure`;
  `src/server/api/root.ts` exporting `appRouter` + `export type AppRouter`; the
  `app/api/trpc/[trpc]/route.ts` fetch handler; client wired with `import type { AppRouter }`.

- **Input:** "compose routers — add a billing router." → **Output:** `billingRouter` defined
  with `createTRPCRouter`, merged into root as `billing: billingRouter` (flat namespace);
  `AppRouter` type re-flows automatically; money fields noted to follow rule 5 in the slice.

- **Input:** "the client says every query returns `any`." → **Output:** diagnose the missing
  `export type AppRouter = typeof appRouter` (or a value import); fix to a type-only import,
  inference restored across all calls.

## Edge Cases

- **Need a server-side call from an RSC or a cron** → build a caller via `appRouter.createCaller(ctx)`
  reusing `createTRPCContext`, not a second context; don't hit the HTTP handler internally.
- **A sub-router has no auth'd procedures** → still merge it the same way; `publicProcedure`
  is fine, but confirm it touches no user-owned rows (rule 2 is a `vertical-slice` concern).
- **Two domains share a helper** → put the plain function in `src/server/services/`, call it
  from both routers; procedures stay thin per `../../CLAUDE.md`, don't cross-import routers.
- **Webhook (Clerk/Stripe) needs the db** → that's a Next route handler with its own Zod-parsed
  body (rule 8), not a tRPC procedure; don't force it through this context.

## References

- `references/context.md` — the edge `createTRPCContext` factory, `Context` type inference,
  `initTRPC` setup, superjson transformer, and the Zod errorFormatter, with real code.
- `references/router-composition.md` — procedure bases, root router merge with flat namespaces,
  `AppRouter` type export, the fetch route handler, the server-side caller, and the type-only
  client import.

## Scripts

Reserved; empty for now. A check that greps client code for a **value** import of `appRouter`
(rule 9 violation) would justify a script once the false-positive rate is understood — until
then `rule-audit` covers it.
