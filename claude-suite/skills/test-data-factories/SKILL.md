---
name: test-data-factories
description: >
  Build typed, in-code test factories whose object shapes derive from Drizzle's inferred
  insert/select types, so a fixture never drifts from the live schema and a column rename
  fails the test build instead of silently passing stale data. Factories produce one
  overridable object per call, honor the stack's money/time/ID conventions, and live in
  the test tree — not the seed tree, not the app code. Use when: "test factory", "fixtures",
  "test data", "build a fake user". Do NOT use for: populating a real dev/preview database
  (use drizzle-seed); deciding what to test or the testing pyramid (use test-strategy).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the drifting-fixture failure class: hand-built test
    objects typed as `any`/partial literals that diverge from the schema and lie about
    money/time/ownership.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# test-data-factories

Produce factory functions that mint test rows from Drizzle's `$inferInsert` / `$inferSelect`
types, so the type chain (rule 1) runs unbroken from schema into every test, and a schema
change breaks the test build at the factory rather than leaking a wrong shape downstream.
See `../../CLAUDE.md` for the spine and nine rules; this skill owns the in-code fixture
builder, not the database seed and not the test plan.

## Non-Negotiable Rules

- **Never type a fixture as `any`, `as Foo`, or a bare partial literal.** A factory returns
  `typeof table.$inferInsert` (or `$inferSelect` for query results); a renamed/added column
  must fail to compile (rule 1).
- **Never bake real or float money / local time into a default.** Defaults use integer minor
  units (rule 5) and UTC `Date` values (rule 6); never `19.99`, never a local date string.
- **Never default an ownership field to a shared constant across factories.** `userId` /
  `ownerId` defaults must be unique per call (or required), so ownership tests (rule 2) can't
  accidentally pass by every row sharing one id.
- **Never reach into the database from a factory.** A factory is a pure object builder;
  persisting belongs to the test's setup or `drizzle-seed`, kept separate.

Refuse these rationalizations: "it's just a test object so the type doesn't matter", "I'll
cast it for now", "every fixture can share `userId: 'test'`", "dollars are fine in a test",
"let the factory insert it too, that's less code".

## When to Use

- A unit or integration test needs a valid row/DTO and you want it schema-checked.
- You're writing many tests that each need a user/post/order with one field varied.
- An ownership test needs two users' rows that must not collide on `userId`.
- You want overridable defaults so each test states only the field it cares about.

## When NOT to Use

- Populating a real dev/preview/staging database from a script — use **drizzle-seed**.
- Deciding what to test, the unit/integration split, or coverage targets — use
  **test-strategy**.
- Writing the actual unit assertions/runner config — use **vitest-unit**.
- Designing or changing the tables the factory mirrors — use **schema-design** /
  **migration-author**.

## Procedure

1. **Anchor every factory to the schema type (interrogation: low).** Type the return as
   `typeof table.$inferInsert`; the function's job is to fill required columns with valid
   defaults and spread caller overrides last. The compiler is the anti-drift gate (rule 1).
   See `references/factory-patterns.md`.
2. **Make overrides the entire ergonomic surface (interrogation: low).** Signature is
   `makeX(overrides: Partial<typeof table.$inferInsert> = {})` returning `{ ...defaults,
   ...overrides }`. Tests vary one field; defaults stay valid. See `references/factory-patterns.md`.
3. **Encode data conventions in the defaults (interrogation: medium).** Money as integer
   minor units (rule 5), timestamps as UTC `Date` (rule 6), IDs per the table's decided
   strategy — UUIDv7 public / BIGSERIAL internal. See `references/factory-patterns.md`.
4. **Keep ownership fields unique or required (interrogation: high).** Ownership bugs are the
   #1 class (rule 2); a factory that defaults `userId` to one constant silently defeats every
   ownership test. Generate a fresh id per call or force the caller to pass one.
5. **Separate the pure builder from any persistence (interrogation: medium).** `makeX` builds;
   if a test needs the row in the DB, a thin `seedX(db, overrides)` wraps an `insert(...)
   .returning()`. Never let the builder touch the DB. See `references/factory-patterns.md`.
6. **Seed any randomness deterministically (interrogation: medium).** If using faker/a PRNG,
   fix the seed so a failing test reproduces; prefer counter-based unique values over random
   where collisions would matter. See `references/factory-patterns.md`.
7. **Derive related graphs without N+1 thinking (interrogation: low).** Build a parent then a
   typed array of children referencing its id in one map; mirror Drizzle relational shape
   (rule 7) so integration tests exercise joins, not per-row stubs.

## Composes With

- **Consumes:** `schema-design` (the tables and their `$inferInsert`/`$inferSelect` types),
  `t3-genesis` (the test harness and tsconfig that make the types resolve).
- **Pairs with:** `drizzle-seed` (shares the inferred-type builders; factories for in-test
  objects, seeds for a populated dev DB), `vitest-unit` (consumes factories in `beforeEach`
  and assertions), `trpc-integration-test` (builds inputs and seeded rows for procedure tests).
- **Runs against:** in-memory objects and, via the optional `seedX` wrapper, a test database.
- **Hands off:** to `migration-author` when a factory won't type-check because the schema must
  change first.

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> This is the encoded failure *class* this skill prevents, not a captured transcript. Replace
> it with a real before/after once one is observed.

**Failure class encoded:** Without this skill, generated test data typically ships:

- Hand-written object literals (`const user = { id: 1, name: 'Test' } as User`) that omit
  half the columns and lie about the rest, kept alive by an `as` cast (rule 1 broken).
- Fixtures that stay green after a schema column rename because nothing ties them to
  `$inferInsert` — the drift surfaces only as a runtime failure much later.
- `price: 9.99` floats and `createdAt: '2026-01-01'` local strings copied into every test
  (rules 5, 6).
- Every fixture sharing `userId: 'user_1'`, so an ownership test passes for the wrong reason
  (rule 2 not actually exercised).
- A "factory" that also inserts into the DB, coupling pure unit tests to a live connection.

## Examples

**Input:** "Build a fake user factory for the tests."
**Output:** A `makeUser(overrides: Partial<typeof users.$inferInsert> = {})` in
`src/test/factories/user.ts` returning `{ id: uuidv7(), email: \`u${n++}@test.dev\`,
createdAt: new Date(), ...overrides }`, typed so a new non-null column breaks the build.
Each call yields a unique email and id; no `as`, no DB access.

**Input:** "I need two users and an order owned by one of them for an ownership test."
**Output:** `makeUser()` called twice (distinct ids), `makeOrder({ userId: owner.id,
amountCents: 1999 })` — money in integer cents (rule 5), `userId` explicitly the owner so the
rule-2 test asserts the *other* user gets denied. A `seedOrder(db, …)` wrapper persists it for
the trpc-integration-test.

**Input:** "Give me a post with five comments for a relational query test."
**Output:** `makePost()` then `Array.from({ length: 5 }, () => makeComment({ postId:
post.id }))` — a typed children array referencing the parent id, matching the Drizzle
relational shape so the join (rule 7) is what's under test, not stubbed rows.

## Edge Cases

- **Clerk-owned `userId`** → factory defaults should mint clearly-marked test ids
  (`user_test_*`) or require the caller to pass a real Clerk id; never collide with prod users.
- **Insert vs select shape needed** → use `$inferInsert` for building rows to write,
  `$inferSelect` when faking a query *result* (it includes db-generated columns).
- **Soft-deleted entity under test** → set `deletedAt` explicitly per the entity's decided
  policy rather than assuming null; mirrors schema-design's per-entity call.
- **Unique-constraint collisions across a test run** → use a monotonic counter for the unique
  field instead of random, so parallel tests don't intermittently clash.

## References

- `references/factory-patterns.md` — inferred-type factory signature, override merge, the
  pure-builder vs `seedX` split, money/time/ID defaults, unique-per-call ownership ids,
  deterministic randomness, and related-graph builders.

## Scripts

Reserved; no executable ships with v0.1. A `check-factory-types.mjs` that asserts every
factory's return is assignable to its table's `$inferInsert` would earn its place once the
factories directory path is conventionalized across projects.
