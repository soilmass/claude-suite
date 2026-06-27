Purpose: the `src/server/api/trpc.ts` builder file — context, the `t` instance, `publicProcedure`, and the type-narrowing `protectedProcedure` auth gate that is Rule 2's foundation.

# Procedure builders (`src/server/api/trpc.ts`)

This is the single file that defines how every router procedure is built. Routers import
`publicProcedure` / `protectedProcedure` from here; they never call `initTRPC` themselves.

## 1. Context

Context resolves once per request and carries the edge `db` and Clerk's `auth`. Under
`clerkMiddleware` (in `middleware.ts`), `auth()` is available in route handlers; pass its
result into the context factory.

```ts
// src/server/api/trpc.ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { auth } from "@clerk/nextjs/server";
import { db } from "~/server/db";

export async function createTRPCContext(opts: { headers: Headers }) {
  // auth() comes from Clerk's edge middleware; userId is `string | null` here.
  const authState = await auth();
  return {
    db,
    auth: authState,        // { userId: string | null, ... }
    headers: opts.headers,
  };
}
type Context = Awaited<ReturnType<typeof createTRPCContext>>;
```

Notes:
- `db` is the serverless/HTTP edge driver (Neon/Turso class) — no TCP pool (spine).
- Keep `auth` as Clerk's object so the gate can narrow `userId` and the rest stays available.

## 2. The `t` instance

```ts
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Surface Zod boundary failures (Rule 8) without leaking internals.
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;
```

## 3. `publicProcedure`

```ts
// Thin-procedure contract: a procedure validates (Zod input), authorizes, calls a
// plain function in src/server/<feature>/, and returns. No domain logic in middleware.
export const publicProcedure = t.procedure.use(timingLogger); // timingLogger: see observability ref
```

## 4. `protectedProcedure` — the type-narrowing auth gate (Rule 2 foundation)

The gate does two things: throw if unauthenticated, and **re-narrow `ctx`** so downstream
`ctx.auth.userId` is `string`, not `string | null`. Without the re-narrow, every procedure
that follows still sees a nullable userId and the type system stops helping you write the
ownership check.

```ts
export const protectedProcedure = t.procedure
  .use(timingLogger)
  .use(({ ctx, next }) => {
    if (!ctx.auth.userId) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({
      ctx: {
        // Narrow: userId is now `string` for everything downstream.
        auth: { ...ctx.auth, userId: ctx.auth.userId },
      },
    });
  });
```

## 5. What the gate does NOT do — Rule 2 belongs to the procedure

`protectedProcedure` proves authentication (a valid user) and narrows the type. It does
**not** prove the row belongs to that user. Authorization is per-resource and lives in the
procedure body or the domain function it calls:

```ts
// In a feature router — NOT in middleware. Owned by vertical-slice.
getInvoice: protectedProcedure
  .input(z.object({ id: z.string().uuid() }))         // Rule 8: validated boundary
  .query(async ({ ctx, input }) => {
    const row = await getInvoiceById(ctx.db, input.id); // plain function, no N+1 (Rule 7)
    // Rule 2: ownership — the row must belong to the caller.
    if (!row || row.userId !== ctx.auth.userId) {
      throw new TRPCError({ code: "NOT_FOUND" }); // 404 not 403: don't confirm existence
    }
    return row;
  }),
```

Why 404 over 403: returning 403 confirms the resource exists to a non-owner — an enumeration
leak. Prefer `NOT_FOUND` for resources the caller may not see.

## 6. Composition, not forking

New variants are existing builders extended with `.use()`:

```ts
// keyed rate limiting on top of the auth gate — see observability-and-ratelimit.md
export const rateLimitedProcedure = protectedProcedure.use(rateLimit);
```

Never create a parallel `t.procedure` chain that re-implements the gate; that's how the
auth check drifts out of sync across builders.

## Review checklist for this file

- [ ] Gate throws `UNAUTHORIZED` and **re-narrows** `ctx.auth.userId` to `string`.
- [ ] No `db` query for feature data inside any middleware (cross-cutting only).
- [ ] No `any` / `@ts-ignore` in the builder file (Rule 1).
- [ ] Every variant is composed via `.use()`, not a forked `t.procedure` chain.
- [ ] Banner comment states the thin-procedure contract and that ownership is per-procedure.
