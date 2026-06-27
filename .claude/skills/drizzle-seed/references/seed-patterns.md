# seed-patterns — idempotent, type-derived Drizzle seed scripts for the edge stack

Real patterns for `src/db/seed/`. Every fixture row type traces to Drizzle inference (rule 1);
every script is safe to re-run. Cite rules by number; the canon is `../../CLAUDE.md`.

---

## 1. Env guard — refuse a destructive run on the wrong target (rules 8)

```ts
// src/db/seed/env.ts
import { z } from "zod";

const SeedEnv = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SEED_RESET: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export const env = SeedEnv.parse(process.env); // rule 8: parse before use

// Destructive resets only against a clearly-dev/preview target.
export function assertDevTarget() {
  const url = env.DATABASE_URL;
  const looksDev =
    env.NODE_ENV !== "production" &&
    /(localhost|127\.0\.0\.1|-dev|-preview|\.local|neon-preview)/.test(url);
  if (env.SEED_RESET && !looksDev) {
    throw new Error(
      `Refusing to reset: DATABASE_URL does not look like a dev/preview target.`,
    );
  }
}
```

Never read `process.env.X` raw in the seed body — parse once, import `env`.

---

## 2. Fixtures typed from `$inferInsert` — the type chain holds (rule 1)

Do not write loose object literals. Tie each fixture array to the table's insert type so a
schema change breaks the build, not production.

```ts
import { users, posts } from "@/db/schema";

// If a column is added/renamed/made non-null, this stops compiling — exactly what we want.
const userFixtures: (typeof users.$inferInsert)[] = [
  { email: "ada@example.dev", displayName: "Ada", clerkId: "user_seed_ada" },
  { email: "linus@example.dev", displayName: "Linus", clerkId: "user_seed_linus" },
];
```

For data-convention columns:

```ts
// rule 5: money is integer minor units, never a float
const orderFixtures: (typeof orders.$inferInsert)[] = [
  { externalOrderId: "ord_demo_1", amountCents: 1999, currency: "USD" },
];

// rule 6: UTC timestamptz. new Date() is UTC internally; never store a local string.
const eventFixtures: (typeof events.$inferInsert)[] = [
  { slug: "kickoff", startsAt: new Date("2026-01-15T09:00:00Z") },
];
```

If you accept dollars as input, convert at the fixture edge: `Math.round(dollars * 100)`.

---

## 3. Idempotency — upsert on a deterministic natural key

Pick a stable key per entity (email, slug, external id). Postgres / libSQL via Drizzle:

```ts
import { sql } from "drizzle-orm";

// onConflictDoNothing: re-running is a no-op for existing rows
await db.insert(users).values(userFixtures).onConflictDoNothing({ target: users.email });

// onConflictDoUpdate: keep fixtures authoritative on every run
await db
  .insert(posts)
  .values(postFixtures)
  .onConflictDoUpdate({
    target: posts.slug,
    set: { title: sql`excluded.title`, body: sql`excluded.body` },
  });
```

The natural key must have a unique index in the schema (schema-design owns that). If it does
not, add the index there first — do not paper over it in the seed.

### Alternative: truncate-and-reinsert (opt-in only)

```ts
if (env.SEED_RESET) {
  assertDevTarget();
  // child → parent order to respect FKs; or use TRUNCATE ... CASCADE deliberately
  await db.delete(posts);
  await db.delete(users);
}
```

Record the choice (upsert vs reset-default) in `DECISIONS.md`; reset-by-default is a footgun.

---

## 4. Dependency order, transactions, no N+1 (rule 7)

Seed parents first, capture ids with `.returning()`, then batch children in ONE insert. Never
`await db.insert(child)` inside a loop over parents.

```ts
await db.transaction(async (tx) => {
  const insertedUsers = await tx
    .insert(users)
    .values(userFixtures)
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id, email: users.email });

  const byEmail = new Map(insertedUsers.map((u) => [u.email, u.id]));

  // Build all child rows in memory, insert once — not a query per parent.
  const postFixtures: (typeof posts.$inferInsert)[] = [
    { slug: "hello", title: "Hello", body: "...", authorId: byEmail.get("ada@example.dev")! },
  ].filter((p) => p.authorId !== undefined);

  await tx.insert(posts).values(postFixtures).onConflictDoNothing({ target: posts.slug });
});
```

Note: with `onConflictDoNothing`, `.returning()` only returns newly inserted rows. If a parent
may already exist, re-select the ids you need (`tx.select(...).where(inArray(users.email, ...))`)
rather than assuming the returning set is complete.

---

## 5. Reproducible randomness

If you generate data, seed the PRNG so idempotency assertions hold:

```ts
import { faker } from "@faker-js/faker";
faker.seed(42); // fixed → same output every run
```

Unseeded faker silently breaks the "run twice, same counts" check.

---

## 6. Runner + npm script

```ts
// src/db/seed/index.ts
import { db } from "@/db/client";
import { env, assertDevTarget } from "./env";

async function main() {
  assertDevTarget();
  // ...transactional inserts from sections 3–4...
  console.log("seed complete");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

```jsonc
// package.json
{
  "scripts": {
    "db:seed": "tsx src/db/seed/index.ts",
    "db:seed:reset": "SEED_RESET=true tsx src/db/seed/index.ts"
  }
}
```

`db:seed` is non-destructive (upsert); the reset variant is a separate, explicit command.

---

## 7. Verify idempotency (definition of done for a seed)

```bash
pnpm db:seed
# capture counts, then:
pnpm db:seed
# counts MUST be identical. If they grew, the conflict target is wrong or missing.
```

This is the single check that proves the encoded failure class is closed.

---

## Quick checklist

- [ ] Env Zod-parsed; reset refuses non-dev targets (rules 8).
- [ ] Every fixture array typed as `typeof table.$inferInsert` (rule 1).
- [ ] Deterministic natural key + unique index → upsert, not bare insert.
- [ ] Money in cents (rule 5); timestamps UTC `Date` (rule 6); IDs per decided strategy.
- [ ] Parents before children, batched, in a transaction, no loop inserts (rule 7).
- [ ] `db:seed` non-destructive; reset is opt-in; choice recorded in `DECISIONS.md`.
- [ ] Ran twice → identical row counts.
