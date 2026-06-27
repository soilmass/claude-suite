---
name: drizzle-seed
description: >
  Author idempotent seed scripts and dev fixtures whose row shapes derive from Drizzle's
  inferred insert types, so the seed compiles against the live schema and re-running it
  never duplicates or crashes. Seeds run against a real edge-compatible DB connection,
  honor the stack's money/time/ID conventions, and stay in `src/db/seed/` separate from
  application code. Use when: "seed the database", "seed script", "dev fixtures",
  "populate data". Do NOT use for: in-code test fixtures and per-test factories (use
  test-data-factories); defining or changing the tables themselves (use schema-design).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the non-idempotent / type-drifted seed failure class:
    seeds that hardcode row literals, duplicate on re-run, and float money.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# drizzle-seed

Produce a seed script that populates a development (or preview) database from data shaped by
Drizzle's `$inferInsert` types, so the type chain (rule 1) runs from schema to fixture and the
script is safe to run repeatedly. See `../../CLAUDE.md` for the spine and the nine rules; this
skill is the procedure for the seed itself, not the schema and not test data.

## Non-Negotiable Rules

- **Never make a seed that duplicates on a second run.** Use deterministic natural keys with
  `onConflictDoNothing` / `onConflictDoUpdate`, or truncate-then-insert behind an explicit
  flag — never bare `insert` that piles up rows.
- **Never hardcode row object literals that bypass the schema type.** Every fixture row is
  typed as `typeof table.$inferInsert`; if a column is added or renamed the seed must fail to
  compile (rule 1).
- **Never run a destructive seed against a non-dev target.** Guard on `DATABASE_URL` /
  `NODE_ENV`; refuse to truncate when the target is not clearly a dev/preview database.
- **Never float money or store local time in fixtures.** Cents as integers (rule 5), UTC
  `timestamptz` via `new Date()` in UTC (rule 6), and the table's decided ID strategy.

Refuse these rationalizations: "it's just dev data so types/cents don't matter", "I'll add the
conflict handling later", "truncation is fine, this is only my machine", "a quick literal array
is faster than wiring the inferred type".

## When to Use

- You need realistic local data to develop or demo a feature against.
- You want a preview/staging database populated reproducibly from a script in the repo.
- You're adding fixtures for a newly designed entity and want them schema-checked.
- A teammate needs a one-command `db:seed` to get a working dataset.

## When NOT to Use

- Building per-test data inside the test suite (factories, builders, `beforeEach` rows) —
  use **test-data-factories**.
- Defining, normalizing, or relating the tables the seed inserts into — use **schema-design**.
- Evolving an existing schema (rename/drop/type change) — use **migration-author**; reseed
  after the migration lands.
- Building the feature that reads this data — use **vertical-slice**.

## Procedure

1. **Confirm the target is a dev/preview database (interrogation: high).** Being wrong here is
   destructive. Read `DATABASE_URL`, refuse to proceed with truncation unless the host/name
   marks it dev or preview, and Zod-parse the env (rule 8). See `references/seed-patterns.md`.
2. **Derive every row type from the schema (interrogation: low).** Type fixture arrays as
   `Array<typeof table.$inferInsert>`. Do not write untyped literals; the compiler is the gate
   that catches schema drift (rule 1). See `references/seed-patterns.md`.
3. **Choose deterministic keys for idempotency (interrogation: medium).** Pick a stable natural
   key per entity (slug, email, external id) so re-runs upsert instead of duplicate. Decide
   upsert vs truncate-and-reinsert and record the non-obvious choice in `DECISIONS.md`.
4. **Honor data conventions in the fixtures (interrogation: medium).** Money as integer minor
   units (rule 5); timestamps as UTC `Date` (rule 6); IDs per the table's decided strategy
   (UUIDv7 public / BIGSERIAL internal). See `references/seed-patterns.md`.
5. **Insert in dependency order, in a transaction, without N+1 (interrogation: low).** Seed
   parents before children, capture returned ids via `.returning()`, and batch child inserts
   in one statement — never a query per parent in a loop (rule 7). See `references/seed-patterns.md`.
6. **Wire the runner and npm script (interrogation: low).** A `tsx`/`dotenv` entry point and a
   `db:seed` script; make `--reset` an explicit opt-in flag, not the default. See
   `references/seed-patterns.md`.
7. **Verify idempotency (interrogation: medium).** Run the seed twice; assert row counts are
   identical the second time. This is the one check that proves the failure class is closed.

## Composes With

- **Consumes:** `schema-design` (the tables and their `$inferInsert` types), `t3-genesis` (the
  edge DB client and env wiring).
- **Pairs with:** `test-data-factories` (shares the same inferred-type builders; factories for
  tests, seeds for a populated dev DB), `schema-design` (reseed when entities change).
- **Hands off:** to `migration-author` when a fixture won't type-check because the schema must
  change first; to `vertical-slice` once data exists to build against.
- **Runs against:** a dev/preview database only — never the production connection.

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project conventions). The encoded failure class was confirmed.

**Observed run.** Asked to seed users and posts, the naive agent redefined the `users` and `posts`
tables *inline* in `seed.ts` (rather than importing from `src/db/schema`), reached for the
node-postgres `Pool` (a long-lived TCP driver, not the stack's edge-compatible serverless driver),
and made re-running "safe" by wiping everything first — a destructive delete-all with no env guard
and no transaction wrapping the delete/insert sequence.

```ts
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);
// wipe so re-running gives a clean slate
await db.delete(posts);
await db.delete(users);
await db.insert(users).values([
  { clerkId: "user_seed_alice", name: "Alice", email: "alice@example.com" },
  // ...
]).returning();
```

**Failure class (confirmed).** Idempotency was faked with truncation instead of an upsert on a
natural key (`email`/`clerkId`), so the script destroys real data if ever pointed at a shared or
staging DB — and with no env guard nothing stops that. The inline table redefinition breaks the
single-source type chain (rule 1), the fixtures are never Zod-validated (rule 8), and the
non-atomic delete/insert sequence can leave the DB half-seeded. This skill replaces wipe-then-insert
with schema-derived, env-guarded, transactional upserts.

## Examples

**Input:** "Seed the database with a few users and their posts for local dev."
**Output:** A `src/db/seed/index.ts` that Zod-parses env and asserts a dev target, types
`users` fixtures as `(typeof users.$inferInsert)[]` keyed by email with
`onConflictDoNothing({ target: users.email })`, inserts users `.returning({ id })`, then batch-
inserts posts mapped to those ids in a single statement inside `db.transaction(...)`. A
`db:seed` script and an idempotency note in the PR.

**Input:** "Populate the preview DB with sample orders, amounts in dollars."
**Output:** Seed stores `amount_cents: 1999` integers (rule 5), `placed_at` as a UTC `Date`,
upserts on an `external_order_id` natural key, and is rejected at runtime if `DATABASE_URL`
isn't a recognized preview host. Dollar inputs are converted to cents at the fixture edge.

**Input:** "Add fixtures for the new `projects` entity I just designed."
**Output:** Confirms the table exists in `src/db/schema/`, derives the fixture type from
`projects.$inferInsert`, and adds an upsert-by-`slug` block to the existing seed. If the type
doesn't resolve, hands off to schema-design rather than inventing columns.

## Edge Cases

- **Clerk-owned user ids** → don't fabricate `ctx.auth.userId` values that collide with real
  Clerk users; seed with clearly-marked dev ids (e.g. `user_seed_*`) and document it.
- **Truly random data wanted** → seed any faker/PRNG with a fixed seed value so runs are
  reproducible; an unseeded faker breaks idempotency assertions.
- **Large dataset (10k+ rows)** → chunk inserts into batched statements; a single mega-insert
  can exceed the edge driver's statement/payload limits.
- **Soft-deleted rows in scope** → set `deleted_at` explicitly per the entity's decided policy
  rather than assuming null; mirrors schema-design's per-entity call.

## References

- `references/seed-patterns.md` — env guard, inferred-type fixtures, upsert vs truncate,
  transactional dependency-ordered inserts, money/time conventions, and the runner wiring.

## Scripts

Reserved; no executable ships with v0.1. A `check-idempotency.mjs` that runs the seed twice and
diffs row counts would earn its place once the seed entry-point path is conventionalized across
projects.
