Purpose: procedure bases, the flat root-router merge, the AppRouter type export, the fetch route handler, the server-side caller, and the type-only client import — real code for steps 4–7.

# Router composition + client wiring

## 4. Procedure bases (`src/server/api/trpc.ts`, continued)

```ts
import { TRPCError } from "@trpc/server";

// publicProcedure: anyone. protectedProcedure: authenticated (rule 2's first half).
export const publicProcedure = t_.procedure;

// enforceAuth narrows ctx.auth.userId to a non-null string. The full middleware
// (logging, ratelimit, timing) is trpc-middleware's job — here we only compose it on.
const enforceAuth = t_.middleware(({ ctx, next }) => {
  if (!ctx.auth.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    // Re-provide auth with userId narrowed to string so procedures get a non-null type.
    ctx: { ...ctx, auth: { ...ctx.auth, userId: ctx.auth.userId } },
  });
});

export const protectedProcedure = t_.procedure.use(enforceAuth);
```

> `protectedProcedure` proves the caller is authenticated, NOT that they own the row.
> Ownership (`where eq(table.userId, ctx.auth.userId)`) is rule 2 and lives in each
> procedure body — see `vertical-slice`. Do not centralize it here.

## 5. Sub-routers + flat root merge (`src/server/api/root.ts`)

Keep the root **flat**: one namespace per domain, no deep nesting.

```ts
// src/server/api/routers/post.ts
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const postRouter = createTRPCRouter({
  // each procedure stays thin: validate -> authorize/own -> call a service -> return
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.query.posts.findMany({ where: (p, { eq }) => eq(p.userId, ctx.auth.userId) }),
  ),
});
```

```ts
// src/server/api/root.ts
import { createTRPCRouter, createCallerFactory } from "~/server/api/trpc";
import { postRouter } from "~/server/api/routers/post";
import { billingRouter } from "~/server/api/routers/billing";

export const appRouter = createTRPCRouter({
  post: postRouter,
  billing: billingRouter, // add new domains as flat keys
});

// 6. The ONLY thing the client is allowed to learn about the server.
export type AppRouter = typeof appRouter;

// server-side caller factory (step 7)
export const createCaller = createCallerFactory(appRouter);
```

Adding a domain = define its router with `createTRPCRouter`, import it, add one key.
The `AppRouter` type re-flows automatically — no client change needed.

## 7a. The edge fetch route handler (`app/api/trpc/[trpc]/route.ts`)

```ts
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

export const runtime = "edge"; // the fork-defining fact (see ../../CLAUDE.md)

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
  });

export { handler as GET, handler as POST };
```

## 7b. Server-side caller (RSC, cron, webhooks-as-internal-calls)

Reuse the same context factory — never fork a second context.

```ts
// src/server/api/caller.ts
import { headers } from "next/headers";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

export async function serverApi() {
  const ctx = await createTRPCContext({ headers: await headers() });
  return createCaller(ctx); // typed exactly like the client
}
```

## 8. The client — TYPE-ONLY import (rule 9)

```ts
// src/trpc/react.tsx
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "~/server/api/root"; // import type — value import leaks server code

export const api = createTRPCReact<AppRouter>();
```

```ts
// link config (client) — superjson must match the server transformer
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";

httpBatchLink({ url: "/api/trpc", transformer: superjson });
```

The single most important line is `import type { AppRouter }`. A value import
(`import { appRouter }`) pulls the server router — and every secret in its dependency
graph — into the browser bundle. That is a rule 9 violation that still compiles.

## Composition checklist (audit before handing to rule-audit)

- [ ] `initTRPC` called exactly once; transformer + errorFormatter live there.
- [ ] `createTRPCContext` uses the edge driver and Clerk `auth()`; no Node-only APIs.
- [ ] `Context` is inferred and exported; no `any` on `ctx` (rule 1).
- [ ] Root router is flat, namespaced by domain.
- [ ] `export type AppRouter = typeof appRouter` present.
- [ ] Client uses `import type { AppRouter }` (rule 9); client transformer matches server.
- [ ] Route handler sets `runtime = "edge"` and reuses `createTRPCContext`.
- [ ] Server caller reuses `createTRPCContext`, not a hand-rolled context.
