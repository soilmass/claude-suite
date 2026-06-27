---
name: trpc-integration-test
description: >
  Write integration tests for a tRPC procedure by invoking it through a
  type-safe caller with a mocked Clerk auth + edge Drizzle context, then
  asserting the security-critical behavior: the ownership check (rule 2) and
  the Zod input boundary (rule 8). The point is the negative cases — a
  non-owner is denied, an unauthenticated caller is rejected, malformed input
  fails before the resolver — not just the happy path. Locks a procedure's
  auth contract so a later refactor that drops a `.where(userId)` filter turns
  a test red instead of shipping a data leak.
  Use when: "test the api", "integration test", "test a procedure", "test ownership check".
  Do NOT use for: pure logic functions with no ctx (use vitest-unit); full
  browser/e2e sign-in and navigation flows (use playwright-e2e); building the
  procedure itself (use vertical-slice); generating seed rows (use test-data-factories).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the happy-path-only test failure class: tests that
    call a procedure only as its owner and never exercise the ownership filter or the
    Zod boundary, so rule 2 / rule 8 regressions ship green.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# trpc-integration-test

Integration tests that drive a tRPC procedure through a real `createCaller` with a
mocked context (see `../../CLAUDE.md`), proving the authorization and validation
behavior the type system cannot. The procedure compiles and returns the right shape
whether or not it filters by owner; only a test that calls it *as a different user*
proves rule 2 holds. This skill encodes that negative-case discipline.

## Non-Negotiable Rules

- **Never assert only the happy path.** Every protectedProcedure over a user-owned row
  gets the three-case matrix: owner succeeds, non-owner is denied, unauthenticated is
  rejected. A green test that never calls as a non-owner proves nothing about rule 2.
- **Never assert merely that the call "throws."** Assert the `TRPCError.code`
  (`FORBIDDEN`/`NOT_FOUND`/`UNAUTHORIZED`/`BAD_REQUEST`). A throw for the wrong reason
  passes a code-agnostic test and hides the real bug.
- **Never reuse one userId across owner and attacker fixtures.** Distinct Clerk userIds,
  or the ownership filter is never actually exercised — the "attacker" is the owner.
- **Never bypass the procedure to assert.** Seed rows directly via `test-data-factories`,
  but read/mutate them *only* through the caller, so the procedure's Zod parse (rule 8)
  and ownership `where` both run.

Refuse these rationalizations: "the ownership check is obviously there, I read it";
"`rejects.toThrow()` is enough"; "I'll reuse one test user to keep it simple";
"I'll call the service function directly, the procedure is just a wrapper."

## When to Use

- Writing integration tests for a tRPC query or mutation after `vertical-slice` builds it.
- Asserting the ownership check on a `protectedProcedure` that touches a user-owned row.
- Asserting that malformed input is rejected at the procedure boundary before the resolver.
- Locking a list query so it never returns another user's rows.

## When NOT to Use

- Testing a pure business-logic function/helper with no `ctx` — use **vitest-unit**.
- Full browser flows (Clerk sign-in, navigation, form submit) — use **playwright-e2e**.
- Building the procedure under test — use **vertical-slice** (write the test alongside it).
- Generating the seed rows/fixtures — use **test-data-factories** (this skill consumes them).
- Statically auditing a diff for a missing ownership check — use **rule-audit**.

## Procedure

1. **Pick the test-DB strategy (interrogation: high).** Edge driver decides it: Neon →
   PGlite (`@electric-sql/pglite`) in-memory; Turso/libSQL → `:memory:`. Or wrap each test
   in a rolled-back transaction. Wrong here means flaky or slow suites. Record the choice in
   `DECISIONS.md`. See `references/test-harness.md`.
2. **Build the caller factory and a typed ctx mock (interrogation: medium).** Export
   `const createCaller = createCallerFactory(appRouter)` and a `callerFor(userId)` helper that
   builds a `Context`-typed object `{ auth, db, headers }`. Cast the mock auth to `Context["auth"]`,
   never `any` (rule 1). See `references/test-harness.md`.
3. **Seed via factories, never via the procedure (interrogation: medium).** Insert owner and
   non-owner rows directly through `test-data-factories` so the data exists independent of the
   code under test. See `references/ownership-matrix.md`.
4. **Assert the ownership matrix for every user-owned procedure (interrogation: high).** Owner
   call succeeds; non-owner call rejects with the right code; unauthenticated call rejects
   `UNAUTHORIZED`. This is the executable form of rule 2. See `references/ownership-matrix.md`.
5. **Assert the Zod boundary (interrogation: medium).** Pass invalid input and expect
   `BAD_REQUEST` *before* any row is touched; pass valid input and confirm it passes (rule 8).
   See `references/ownership-matrix.md`.
6. **Assert the success shape against Drizzle-inferred types (interrogation: low).** The
   returned row's type traces from `$inferSelect` (rule 1); spot-check money as integer minor
   units (rule 5) and timestamps as `Date` (rule 6) at the boundary.
7. **Reset state between tests (interrogation: medium).** Truncate or roll back in
   `afterEach`/`beforeEach` so one test's rows never leak into another's assertions.

## Composes With

- **Consumes:** `test-data-factories` (seeds owner/non-owner rows), `trpc-router-compose`
  (provides `appRouter`, `createCallerFactory`, and the `Context` type the mock satisfies).
- **Pairs with:** `vertical-slice` (writes the procedure; write this test as part of the slice),
  `security-pass` (this matrix is the runnable form of its ownership/abuse questions).
- **Runs against:** a feature's `appRouter` sub-router and its `protectedProcedure`s.
- **Hands off:** `rule-audit` (static rule 2/8 scan complements these runtime proofs).

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> This is the encoded failure *class*, not a captured transcript. Replace with a real one
> when observed.

**Failure class encoded:** Without this skill, generated tRPC tests typically ship:
- Only the owner case — the procedure's `.where(eq(table.userId, ctx.auth.userId))` is never
  exercised, so deleting that filter (rule 2) keeps every test green.
- `await expect(...).rejects.toThrow()` with no `code` assertion — a `NOT_FOUND` from an
  unrelated typo passes a test meant to prove `FORBIDDEN`.
- The same `userId` for the "owner" and "other user" fixtures, so the attacker case is
  silently testing the owner.
- The resolver/service function called directly instead of through the caller, skipping the
  Zod input parse (rule 8) and the `protectedProcedure` auth wrapper entirely.
- No unauthenticated case, so a procedure accidentally left on `publicProcedure` still passes.

## Examples

- **Input:** "test the ownership check on `post.delete`." → **Output:** a Vitest file:
  `callerFor("user_owner").post.delete({ id })` resolves; `callerFor("user_other").post.delete({ id })`
  → `rejects.toMatchObject({ code: "NOT_FOUND" })`; `callerFor(null).post.delete({ id })` →
  `rejects.toMatchObject({ code: "UNAUTHORIZED" })`. Owner's row still present after the denied calls.
- **Input:** "integration test `post.create` input validation." → **Output:**
  `caller.post.create({ title: "" })` → `rejects.toMatchObject({ code: "BAD_REQUEST" })`; valid
  input returns a row whose type matches `$inferSelect`, with `priceCents` an integer (rule 5)
  and `createdAt instanceof Date` (rule 6).
- **Input:** "make sure `post.list` doesn't leak other users' rows." → **Output:** seed rows for
  user A and user B; `callerFor("A").post.list()` returns only A's rows; assert
  `result.every(r => r.userId === "A")` and the expected length.

## Edge Cases

- **Procedure reads Clerk org/role claims, not just `userId`** → mock the fuller auth object
  (`sessionClaims`, `orgId`), still typed as `Context["auth"]`; cover the wrong-org case too.
- **A `publicProcedure` that scopes by something other than the user** → there is no `userId`;
  skip the ownership matrix, but assert the public filter and the Zod boundary.
- **The asserted row holds money** → assert integer minor units (rule 5), never a float dollar
  amount; a `priceCents: 1999` assertion, not `19.99`.
- **The procedure uses a relational/joined query (rule 7)** → seed the related rows and assert
  against them so an N+1 refactor stays correct; performance itself is not asserted here.

## References

- `references/test-harness.md` — `createCallerFactory` + typed ctx/auth mock, the `callerFor`
  helper, PGlite and libSQL `:memory:` setups, migration apply, and per-test reset/rollback.
- `references/ownership-matrix.md` — the three-case ownership matrix, the `TRPCError.code`
  assertion helper, the Zod-boundary assertion, and the inferred-type success-shape check.

## Scripts

Reserved; empty for now. A generator that scaffolds the three-case matrix from a router's
`protectedProcedure` list would justify a script once the procedure-introspection shape is
stable — until then the references hold the pattern by hand.
