# Factory patterns — typed, schema-derived test fixtures

Purpose: concrete patterns for in-code test factories that derive from Drizzle inference and
honor the nine rules. Builders are pure; persistence is an explicit, separate wrapper.

## 1. The inferred-type factory signature

Type the return to the table's insert shape and merge overrides last. A renamed or new
non-null column fails the build here (rule 1) instead of leaking a stale shape into tests.

```ts
// src/test/factories/user.ts
import { users } from "@/db/schema";
import { uuidv7 } from "uuidv7";

type NewUser = typeof users.$inferInsert;

let seq = 0; // monotonic counter -> unique-by-default, deterministic

export function makeUser(overrides: Partial<NewUser> = {}): NewUser {
  const n = ++seq;
  return {
    id: uuidv7(),               // public-facing id strategy (sortable, non-enumerable)
    email: `user${n}@test.dev`, // unique per call, not random
    displayName: `Test User ${n}`,
    createdAt: new Date(),      // UTC Date -> timestamptz (rule 6)
    updatedAt: new Date(),
    ...overrides,               // caller varies only what the test is about
  };
}
```

Rules in play: `Partial<NewUser>` keeps the override surface type-safe; spreading overrides
last lets a test set exactly one field; no `as`, no `any` (rule 1).

## 2. Money and time defaults

Never put dollars or local time in a default. Store the canonical form; convert only at a
display edge, never in fixtures.

```ts
type NewOrder = typeof orders.$inferInsert;

export function makeOrder(overrides: Partial<NewOrder> = {}): NewOrder {
  return {
    id: uuidv7(),
    userId: uuidv7(),     // unique per call — see §4
    amountCents: 1999,    // integer minor units, NOT 19.99 (rule 5)
    currency: "USD",
    placedAt: new Date(), // UTC (rule 6)
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
```

If a test thinks in dollars, convert at the call site: `makeOrder({ amountCents: Math.round(
dollars * 100) })`. The factory's stored unit stays integer cents.

## 3. Pure builder vs. persisting wrapper

The factory builds an object. A separate, explicit `seedX(db, …)` persists it — so unit tests
stay DB-free and only integration tests pay for a connection.

```ts
// pure — unit tests use this
export function makeOrder(overrides: Partial<NewOrder> = {}): NewOrder { /* §2 */ }

// persisting — integration tests use this
export async function seedOrder(
  db: TestDb,
  overrides: Partial<NewOrder> = {},
): Promise<typeof orders.$inferSelect> {
  const [row] = await db.insert(orders).values(makeOrder(overrides)).returning();
  return row; // $inferSelect shape: includes db-generated columns
}
```

`$inferInsert` for what you write; `$inferSelect` for what a query returns (it carries
defaults/generated columns). Faking a query *result* in a unit test? Use `$inferSelect`.

## 4. Ownership ids must be unique or required (rule 2)

The #1 vulnerability class is missing ownership checks. A factory that defaults every row's
`userId` to one constant makes ownership tests pass for the wrong reason: every row "belongs"
to the same user, so the deny path is never exercised.

```ts
// BAD — defeats ownership tests
export const makeBadOrder = (o = {}) => ({ ...base, userId: "user_1", ...o });

// GOOD — unique per call; tests opt in to a specific owner
export const makeOrder = (o: Partial<NewOrder> = {}) => ({ ...base, userId: uuidv7(), ...o });
```

Ownership test shape this enables:

```ts
const owner = makeUser();
const intruder = makeUser();                 // distinct id
const order = await seedOrder(db, { userId: owner.id });

// procedure must check the row belongs to ctx.auth.userId (rule 2)
await expect(
  caller({ userId: intruder.id }).orders.get({ id: order.id }),
).rejects.toThrow(/forbidden|not found/i);
```

For Clerk: default to clearly-marked test ids (`user_test_${n}`) or require the caller to pass
a real `ctx.auth.userId`; never collide with production Clerk ids.

## 5. Deterministic randomness

A flaky factory makes a flaky suite. Prefer the monotonic counter (§1) for unique fields. If
faker is genuinely needed, seed it once so a failure reproduces:

```ts
import { faker } from "@faker-js/faker";
faker.seed(1234); // fixed -> reproducible across runs
```

## 6. Related graphs without N+1 thinking

Build a parent, then a typed array of children referencing its id — one map, mirroring the
Drizzle relational shape so integration tests exercise the join (rule 7), not per-row stubs.

```ts
const post = makePost();
const comments: (typeof comments.$inferInsert)[] = Array.from({ length: 5 }, () =>
  makeComment({ postId: post.id }),
);
// seed in dependency order, batched:
await db.insert(postsTable).values(post);
await db.insert(commentsTable).values(comments); // single statement, not a loop
```

## Checklist

- [ ] Return type is `typeof table.$inferInsert` (or `$inferSelect` for results) — no `as`/`any`.
- [ ] Overrides spread last; defaults are all valid.
- [ ] Money is integer minor units; time is a UTC `Date`.
- [ ] Ownership fields unique per call or required — never a shared constant.
- [ ] Builder is pure; persistence is a separate `seedX(db, …)`.
- [ ] Unique fields use a counter (or seeded faker), not bare random.
- [ ] Related rows built as a typed array referencing the parent id, inserted batched.
