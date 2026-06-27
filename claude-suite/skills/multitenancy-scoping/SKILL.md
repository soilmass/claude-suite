---
name: multitenancy-scoping
description: >
  Scope every read and write by org/tenant across the whole app — Rule 2 at the
  collection level rather than the single row. Establishes the tenant context (Clerk
  `orgId`) in middleware, the `org_id` column convention on every tenant-owned table,
  and the discipline that every Drizzle query carries an `eq(table.orgId, ctx.orgId)`
  predicate so one tenant can never read or mutate another's rows. Covers the tenant
  guard, scoped query helpers, cross-tenant join hazards, and the "no orgId = global"
  audit gap.
  Use when: "multi tenant", "org scoping", "tenant isolation", "scope by organization".
  Do NOT use for: single-resource ownership by one user (use vertical-slice), or the
  generic auth/rate-limit middleware builders themselves (use trpc-middleware).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the cross-tenant data-leak failure class: a query that
    authenticates and even checks single-user ownership but omits the org/tenant predicate,
    so members of org A read or mutate org B's rows. Baseline section is the encoded
    failure class; replace with an observed transcript.
---

# multitenancy-scoping

The skill for getting tenant isolation right everywhere, not just on the row in front of
you. Where `vertical-slice` checks that *this* row belongs to *this* user, multitenancy is
Rule 2 (`../../CLAUDE.md`) scaled to the collection: every query against a tenant-owned
table must be filtered by the caller's `org_id`, or it silently spans tenants. The leak
compiles, passes single-tenant dev testing, and ships. This skill makes the tenant
predicate structural — established once in context, enforced on every query.

---

## Non-Negotiable Rules

Cross-tenant leakage is the most expensive vulnerability class in a multi-tenant app, and it
ships as ordinary-looking code:

- **Never query a tenant-owned table without an `eq(table.orgId, ctx.orgId)` predicate.**
  Not at the root `where` of a select, not in an update/delete `where`, not in an aggregate.
  A query missing it returns every tenant's rows (Rule 2, collection scale).
- **Never scope a write by `id` alone.** `update/delete … where eq(table.id, input.id)`
  with no `orgId` lets a caller mutate another tenant's row by guessing an id. Both
  predicates, always: `and(eq(id), eq(orgId))`.
- **Never derive `orgId` from client input.** The tenant comes from the verified session
  (Clerk `auth().orgId`) in context, never from the request body, a route param, or a
  header — those are Rule 8 boundaries and trivially spoofable.
- **Never let a join reach an unscoped table.** Scoping the parent does not scope a joined
  child unless the child is also constrained; a join to a table without an `org_id`
  predicate re-opens the leak through the relation.

Refuse these rationalizations: "the user is already authenticated, that's enough"; "it's
keyed by id, ids are unguessable"; "I'll read orgId from the request, it's faster"; "the
parent is scoped so the join is safe."

---

## When to Use

- A table is owned by an organization/workspace/team, not a single user, and any member of
  that org may access its rows.
- Adding the tenant context to `createTRPCContext` so `ctx.orgId` is present and non-null on
  org-scoped procedures.
- Writing or reviewing any Drizzle read/write over a tenant table — the predicate goes in.
- Introducing a scoped query helper so feature code can't forget the predicate.

## When NOT to Use

- A row owned by exactly one user with no org dimension → `vertical-slice` owns single-user
  ownership.
- Building the `protectedProcedure` auth gate, logging, or rate-limit middleware itself →
  `trpc-middleware` (this skill extends its context; it does not rebuild it).
- Defining the tables and adding the `org_id` column + index from scratch → `schema-design`.
- Threat-modeling a feature's broader abuse cases → `security-pass`.

---

## Procedure

1. **Establish the tenant in context (high-interrogation — the cost of being wrong is a
   cross-tenant breach).** Add an `orgProcedure` that reads Clerk's `auth().orgId`, throws
   `TRPCError({ code: "FORBIDDEN" })` when null, and narrows `ctx.orgId` to `string`. Build
   it as `protectedProcedure.use(...)` — never a parallel gate. See
   `references/tenant-context.md`.
2. **Decide the membership source of truth and record it.** Clerk Organizations gives
   `orgId` + `orgRole` in the session; that is the default. If tenancy lives in your own
   `memberships` table instead, the guard must verify membership there. Record which in
   `DECISIONS.md` — it is a fork.
3. **Confirm every tenant table carries `org_id` (medium-interrogation).** The column,
   its FK to the orgs/Clerk-org reference, and an index belong to `schema-design`. If a
   tenant table lacks `org_id`, stop and add it there; do not fake scoping in app code. See
   `references/scoping-patterns.md`.
4. **Add the tenant predicate to every query — reads and writes.** Root `where` for selects
   and relational queries; `and(eq(id), eq(orgId))` for update/delete. Prefer a scoped
   helper (`scopedDb(ctx.orgId)` or a `withOrg` predicate builder) so feature code composes
   it rather than retyping it. See `references/scoping-patterns.md`.
5. **Audit every join and relation for tenant reach.** A `leftJoin`/`with` to a child table
   must also constrain that child's `org_id` (or be provably reachable only through the
   scoped parent's FK). Cross-tenant joins are the subtle leak. See
   `references/scoping-patterns.md`.
6. **Handle the "no orgId" cases deliberately.** Personal (no-org) resources, super-admin
   tooling, and genuinely global tables each need an explicit, documented decision — an
   un-scoped query must be a recognizable, intentional exception, not an oversight. Record
   each global/admin exemption in `DECISIONS.md`.
7. **Verify isolation with a two-tenant test, not a one-tenant smoke test.** Seed two orgs;
   assert org A's session cannot read or mutate org B's rows on every endpoint. Single-tenant
   dev data hides the entire failure class. Pair the review with `security-pass`.

---

## Composes With

- **Consumes:** `trpc-middleware` (extends its `protectedProcedure`/context with the org
  gate), `schema-design` (the `org_id` column, FK, and index).
- **Pairs with:** `security-pass` (tenant isolation is a core threat-model line),
  `trpc-middleware` (the gate this skill layers onto).
- **Feeds:** `vertical-slice` — org-scoped features import `orgProcedure` and the scoped
  query helper instead of hand-rolling the predicate.
- **Runs against:** `rule-audit` — Rule 2 findings on collection queries point back here.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent told to implement
> as a typical dev would, with no project conventions). The encoded failure class was confirmed
> — and it surfaced the most dangerous variant: the read was scoped, the write was not.

**Observed run.** Prompt: "list the current org's invoices, and update an invoice's amount by
its id." With no skill the agent produced:

```ts
list: protectedProcedure.query(async ({ ctx }) =>
  ctx.db.select().from(invoices).where(eq(invoices.orgId, ctx.auth.orgId))),   // scoped ✓

update: protectedProcedure
  .input(z.object({ id: z.string(), amount: z.number() }))
  .mutation(async ({ ctx, input }) =>
    ctx.db.update(invoices).set({ amount: input.amount })
      .where(eq(invoices.id, input.id)).returning()),                          // id ONLY ✗
```

Its own note: *"`list` filters by `orgId`; `update` looks up the invoice by its `id` alone."*
This is the cross-tenant IDOR (Rule 2 at scale) **verbatim** — and instructively, the agent
*did* scope the read, then dropped the `orgId` predicate on the write. Any member of org A can
change any invoice in org B by guessing an id. (Bonus: `amount: z.number()` is also float
money, Rule 5.) With one seeded org in dev, nothing is cross-tenant and the hole is invisible.

**Failure class (confirmed).** A query (especially a write) missing the
`and(eq(id), eq(orgId))` predicate; `orgId` read from client input instead of the verified
session; unscoped child joins re-leaking through a relation; validated only against a single
tenant.

---

## Examples

**Input:** "List the current org's projects."
**Output:** `orgProcedure` supplies `ctx.orgId`; the read is
`db.query.projects.findMany({ where: eq(projects.orgId, ctx.orgId), orderBy: (p, { desc })
=> desc(p.createdAt), limit: 50 })`. Tenant predicate at the root, bounded, type inferred
(Rule 1). No `orgId` ever read from input.

**Input:** "Let a member rename a project by id."
**Output:** Both predicates on the write:
`db.update(projects).set({ name: input.name }).where(and(eq(projects.id, input.id),
eq(projects.orgId, ctx.orgId)))`. A zero-row result means the project isn't in the caller's
org → throw `NOT_FOUND` (don't reveal it exists in another tenant). Input is the shared Zod
schema (Rule 8).

**Input:** "Show each project with its tasks for this org."
**Output:** Root scoped, relation kept safe because tasks reach only through the scoped
parent FK — and the predicate is added defensively if `tasks` carries `org_id`:
`db.query.projects.findMany({ where: eq(projects.orgId, ctx.orgId), with: { tasks: { limit:
50, orderBy: (t, { desc }) => desc(t.createdAt) } } })`. Hands the N+1-safe shaping to
`drizzle-relational-queries`.

---

## Edge Cases

- **A resource is personal (no org)** → it belongs to a single user; scope by
  `ctx.auth.userId` via `vertical-slice`, not by `orgId`. Document that the table is
  intentionally user-scoped, not tenant-scoped.
- **A super-admin/back-office view must span tenants** → use a separate, explicitly named
  `adminProcedure` with its own role check; never relax the org predicate on the normal
  path. Record the exemption in `DECISIONS.md`.
- **Clerk org context is absent because the user has no active org** → `orgProcedure` throws
  `FORBIDDEN`; surface an "select/create an organization" state, don't fall through to an
  unscoped query.
- **A lookup/reference table is genuinely global** → mark it as such explicitly so the
  missing predicate reads as intentional to `rule-audit` and reviewers, not as a forgotten
  scope.

## References

- `references/tenant-context.md` — the `orgProcedure` gate built on `trpc-middleware`'s
  `protectedProcedure`: reading Clerk `orgId`/`orgRole`, narrowing `ctx.orgId`, the
  Clerk-orgs-vs-own-`memberships`-table fork, and `FORBIDDEN` handling.
- `references/scoping-patterns.md` — the `org_id` column convention, the scoped query helper,
  read/write predicate patterns (`and(eq(id), eq(orgId))`), join/relation scoping hazards,
  the global/admin exemption pattern, and the two-tenant isolation test.

## Scripts

- Reserved; `scripts/.gitkeep` only. A script would be justified if a mechanical check could
  flag a Drizzle query over a known tenant table whose `where` lacks an `orgId` predicate —
  AST-detectable given a registry of tenant tables. For now `rule-audit` (Rule 2) and the
  two-tenant test cover the surface.
