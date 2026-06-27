Purpose: the edge-compatible tRPC context factory, its inferred Context type, the single initTRPC setup, the superjson transformer, and the Zod errorFormatter — real code for steps 1–3.

# Context + initTRPC (`src/server/api/trpc.ts`)

The context is the **root of every `ctx` type**. It carries exactly: `auth` (Clerk),
`db` (the edge Drizzle client), and request-scoped `headers`. Nothing feature-specific.

## 1. The edge db client (no TCP pool)

```ts
// src/db/index.ts
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { env } from "~/env"; // Zod-parsed env (rule 8); never raw process.env
import * as schema from "~/db/schema";

// HTTP driver — runs natively at the edge. No long-lived pool, no pg.Pool, no fs.
const sql = neon(env.DATABASE_URL);
export const db = drizzle(sql, { schema });
export type DB = typeof db;
```

> Turso/libSQL is the alternative edge driver (`drizzle-orm/libsql` + `@libsql/client`).
> The choice is recorded in `DECISIONS.md`; do not silently swap drivers.

## 2. The context factory

```ts
// src/server/api/trpc.ts
import { auth } from "@clerk/nextjs/server"; // edge-compatible
import { db } from "~/db";

/**
 * Built once per request and shared by the fetch handler and the RSC caller.
 * `opts.headers` lets the server-side caller forward headers; the fetch handler
 * passes the real Request headers.
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth(); // { userId: string | null, ... }
  return {
    db,
    auth: session,
    headers: opts.headers,
  };
};

// Root of every procedure's ctx type — infer it, export it (rule 1). Never `any`.
export type Context = Awaited<ReturnType<typeof createTRPCContext>>;
```

Notes:
- `auth()` from `@clerk/nextjs/server` is edge-safe; pair it with `clerkMiddleware` in
  `middleware.ts` (wired at genesis). Do not read the JWT by hand.
- `ctx.auth.userId` is `string | null` here. `protectedProcedure` (see
  `router-composition.md`) narrows it to non-null; **ownership** comparisons against it
  are rule 2 and belong in the procedure body, not here.

## 3. initTRPC — exactly once

```ts
import { initTRPC } from "@trpc/server";
import { ZodError } from "zod";
import superjson from "superjson";

const t = initTRPC.context<Context>().create({
  // superjson so Date / Map / Set / bigint survive the boundary (rule 6 timestamps, rule 5 bigint money)
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Flattened Zod errors so RHF can map them to fields (rule 8).
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

// re-exported building blocks
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const t_ = t; // used to build the procedure bases in router-composition.md
```

Call `initTRPC` **once** for the whole app. Every router and middleware derives from this
`t`; a second `initTRPC` forks the transformer/errorFormatter and the failures are subtle
(field errors stop reaching forms, Dates arrive as strings).

## Why these choices map to the rules

- **Rule 1:** `Context` is inferred from `createTRPCContext`, so `ctx.db` and `ctx.auth`
  are fully typed everywhere downstream — no `any` at the entry point.
- **Rule 6 / 5:** superjson preserves `Date` (timestamptz round-trips) and `bigint`
  (integer minor-unit money), so the boundary doesn't silently stringify them.
- **Rule 8:** the errorFormatter is the one place Zod input errors become consumable;
  the actual `.input(schema)` parsing happens per-procedure in `vertical-slice`.
- **Rule 9:** this file is server-only (`@clerk/nextjs/server`, the db client). Nothing
  here may be imported by a Client Component; the client only ever sees the `AppRouter` type.
