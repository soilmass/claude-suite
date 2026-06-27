Purpose: the reusable test harness — a type-safe caller factory, a `Context`-typed auth/db mock, an in-memory edge DB, and per-test reset — that every tRPC integration test builds on.

# Test harness

## 1. The caller factory

`createCallerFactory` is exported from the same `initTRPC` instance `trpc-router-compose`
created. Re-export it next to `appRouter`, then build a caller per request in tests.

```ts
// src/server/api/trpc.ts  (already exists from trpc-router-compose)
export const createCallerFactory = t.createCallerFactory;
export type Context = Awaited<ReturnType<typeof createTRPCContext>>;
```

```ts
// test/helpers/caller.ts
import { createCallerFactory } from "~/server/api/trpc";
import { appRouter } from "~/server/api/root";
import type { Context } from "~/server/api/trpc";
import { testDb } from "./db";

const createCaller = createCallerFactory(appRouter);
```

## 2. A typed ctx/auth mock (rule 1 — no `any`)

The mock must satisfy `Context`. Clerk's edge `auth()` returns a discriminated object; for a
test we only need the fields the procedures read. Build it through a typed helper and cast to
`Context["auth"]` — never `any`, never `@ts-ignore`.

```ts
// test/helpers/auth.ts
import type { Context } from "~/server/api/trpc";

/** Minimal Clerk auth object, typed to the context's auth slot. */
export function mockAuth(userId: string | null): Context["auth"] {
  return {
    userId,
    sessionClaims: userId ? { sub: userId } : null,
    orgId: null,
    // add only the fields your procedures actually read
  } as Context["auth"];
}
```

```ts
// test/helpers/caller.ts (continued)
import { mockAuth } from "./auth";

export function callerFor(userId: string | null) {
  const ctx: Context = {
    auth: mockAuth(userId),
    db: testDb,
    headers: new Headers(),
  };
  return createCaller(ctx);
}
```

`callerFor("user_owner")`, `callerFor("user_other")`, and `callerFor(null)` are the three
identities every ownership matrix needs. `protectedProcedure`'s `enforceAuth` middleware
rejects the `null` case with `UNAUTHORIZED` before the resolver runs.

## 3. An in-memory edge DB

Match the production driver decision (record in `DECISIONS.md`):

### Neon (Postgres) → PGlite

```ts
// test/helpers/db.ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "~/db/schema";

const client = new PGlite(); // in-memory
export const testDb = drizzle(client, { schema });

export async function setupSchema() {
  await migrate(testDb, { migrationsFolder: "./drizzle" });
}
```

PGlite is real Postgres in WASM, so `timestamptz`, `jsonb`, and FK constraints behave as in
production. Apply your committed `drizzle-kit` migrations rather than `push` so the tested
schema is the deployed schema.

### Turso / libSQL → `:memory:`

```ts
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "~/db/schema";

export const testDb = drizzle(createClient({ url: ":memory:" }), { schema });
```

## 4. Reset between tests

Pick one, consistently:

```ts
// option A — truncate (Postgres/PGlite)
import { afterEach } from "vitest";
import { sql } from "drizzle-orm";

afterEach(async () => {
  await testDb.execute(
    sql`TRUNCATE TABLE posts, users RESTART IDENTITY CASCADE`,
  );
});
```

```ts
// option B — transaction rollback per test (fastest, most isolated)
import { beforeEach, afterEach } from "vitest";
// wrap each test body in testDb.transaction(async (tx) => { ...; throw ROLLBACK });
// inject `tx` as ctx.db so the rollback undoes everything the test wrote.
```

Rollback isolation is preferable when the driver supports nested transactions; otherwise
truncate. Either way, no test may depend on another test's rows.

## 5. Vitest config note

Run these in the `node` environment (no jsdom) — they exercise server code, not the DOM.
Keep them in a separate `integration` project from `vitest-unit`'s fast unit suite so a slow
DB boot never taxes the unit feedback loop. Call `setupSchema()` once in a global setup file.
