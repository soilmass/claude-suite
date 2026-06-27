Purpose: build the `orgProcedure` tenant gate on top of `trpc-middleware`'s `protectedProcedure`, narrowing the verified Clerk org into `ctx.orgId` so org-scoped procedures cannot run without a tenant.

# Tenant context

The tenant must come from the verified session, never from client input (Rule 8). With Clerk
Organizations, the active org is on the auth object as `orgId` and the caller's role as
`orgRole`. The gate's job is to prove `orgId` is present and narrow its type, exactly as
`protectedProcedure` does for `userId`.

## The org gate (built on `protectedProcedure`)

```ts
// src/server/api/trpc.ts — extends the gate from trpc-middleware, does not replace it.
import { TRPCError } from "@trpc/server";

// protectedProcedure already narrowed ctx.auth.userId to string (see trpc-middleware).
export const orgProcedure = protectedProcedure.use(({ ctx, next }) => {
  const orgId = ctx.auth.orgId; // Clerk: active organization on the session
  if (!orgId) {
    // No active org selected, or user belongs to none.
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No active organization in context.",
    });
  }
  return next({
    ctx: {
      ...ctx, // preserve db, auth, and everything upstream — never replace the context
      // re-narrow: downstream ctx.orgId is `string`, not `string | null | undefined`
      orgId,
      orgRole: ctx.auth.orgRole, // for role checks (admin-only mutations, etc.)
    },
  });
});
```

`ctx.auth` is populated by `clerkMiddleware` in `middleware.ts` and surfaced through
`createTRPCContext` (wired by `t3-genesis` / `trpc-middleware`). Do not re-read Clerk in the
procedure; consume the context.

## Context shape

`createTRPCContext` should expose the Clerk `auth` object so the gate can read `orgId`:

```ts
// auth() from "@clerk/nextjs/server" inside the route handler that builds context.
export async function createTRPCContext(opts: { headers: Headers }) {
  const authObject = await auth(); // { userId, orgId, orgRole, ... }
  return { auth: authObject, db, ...opts };
}
```

## Role checks within a tenant

Membership in an org is not the same as permission within it. For admin-only mutations,
gate on `ctx.orgRole` after the org gate:

```ts
export const orgAdminProcedure = orgProcedure.use(({ ctx, next }) => {
  if (ctx.orgRole !== "org:admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Org admin required." });
  }
  return next();
});
```

## Fork: Clerk Organizations vs. your own `memberships` table

Two valid sources of tenancy — pick one and record it in `DECISIONS.md`:

- **Clerk Organizations (default).** `orgId`/`orgRole` come free in the session. No extra
  query. Best when Clerk owns the org model end to end.
- **Own `memberships` table.** When orgs/roles live in your DB (custom roles, billing tiers,
  invitations you control), the gate must verify membership:

  `activeOrgId` is **not** procedure input — it is part of the verified session, established in
  `createTRPCContext` (e.g. from a session claim or a signed cookie) so the gate can read it
  off `ctx`. If you store the active org in your own session state, surface it there:

  ```ts
  // src/server/api/trpc.ts — createTRPCContext exposes the verified active org.
  export async function createTRPCContext(opts: { headers: Headers }) {
    const authObject = await auth(); // Clerk session
    // activeOrgId from your own session state (cookie/claim), NOT from request input.
    const activeOrgId = authObject.sessionClaims?.activeOrgId ?? null;
    return { auth: authObject, db, activeOrgId, ...opts };
  }
  ```

  ```ts
  export const orgProcedure = protectedProcedure.use(async ({ ctx, next }) => {
    // orgId still must NOT come from input for the *authorization* decision; derive the
    // caller's org(s) from the session/membership, then constrain to the active one.
    if (!ctx.activeOrgId) throw new TRPCError({ code: "FORBIDDEN" });
    const membership = await ctx.db.query.memberships.findFirst({
      where: and(
        eq(memberships.userId, ctx.auth.userId),
        eq(memberships.orgId, ctx.activeOrgId), // active org from verified session state
      ),
    });
    if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
    // spread ctx to preserve db, auth, and everything upstream.
    return next({ ctx: { ...ctx, orgId: membership.orgId, orgRole: membership.role } });
  });
  ```

  This adds one query per request; cache or co-locate with the auth read if it matters at the
  edge. The membership lookup is itself scoped by `userId` (Rule 2) — never trust a requested
  `orgId` as proof of membership.

## Empty-org state

A signed-in user with no active organization hits `FORBIDDEN`. That is correct at the API
layer; the UI must render a "create or select an organization" state (Rule 4) rather than
calling org-scoped procedures that will reject.
