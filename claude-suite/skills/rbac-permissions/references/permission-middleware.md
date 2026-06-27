Purpose: the `permissionProcedure`/`roleProcedure` middleware built on `orgProcedure`, default-deny enforcement, why the per-row ownership check (Rule 2) still runs in the procedure body, and the allow/deny test patterns.

# Permission middleware

## Where it sits in the stack

The gates fire in order, each proving one thing:

1. `protectedProcedure` — *who* (`ctx.auth.userId` non-null). `trpc-middleware`.
2. `orgProcedure` — *which org* (`ctx.orgId`/`ctx.orgRole` narrowed, queries scoped). `multitenancy-scoping`.
3. `permissionProcedure(perm)` — *may this role do this action class*. **This skill.**
4. The ownership predicate in the procedure body — *this specific row*. Rule 2, `vertical-slice`.

RBAC is layer 3. It never collapses layer 4 into itself.

## `permissionProcedure` — built on the org gate

```ts
// src/server/api/rbac.ts
import { TRPCError } from "@trpc/server";
import { orgProcedure } from "./trpc"; // from multitenancy-scoping; already narrowed orgId/orgRole
import { can, toRole, type Permission } from "./permissions";

/** Gate an org procedure on a single permission. Default-deny via can(). */
export function permissionProcedure(permission: Permission) {
  return orgProcedure.use(({ ctx, next }) => {
    const role = toRole(ctx.orgRole); // verified session role → app Role
    if (!can(role, permission)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Missing permission: ${permission}`,
      });
    }
    return next(); // ctx unchanged — orgId/orgRole already narrowed upstream
  });
}
```

`permissionProcedure` *composes* `orgProcedure` (which composes `protectedProcedure`) — it is
never a parallel gate. Each layer is the previous one `.use()`-extended, so you cannot reach the
permission check without having passed auth and tenant scoping.

A coarser `roleProcedure("admin")` is occasionally useful for a whole admin router, but prefer
permissions: they survive a role reshuffle without a code change.

## The ownership check still runs — RBAC did not remove it

This is the load-bearing point. The role gate proved the caller *may delete posts as a class*.
It did **not** prove this post is in their org (or theirs). The body still carries the predicate:

```ts
// src/server/api/routers/post.ts
deletePost: permissionProcedure("post:delete")
  .input(deletePostSchema) // shared Zod schema (Rule 8)
  .mutation(async ({ ctx, input }) => {
    // RBAC passed. Ownership/tenant is a SEPARATE gate (Rule 2):
    const [deleted] = await ctx.db
      .delete(posts)
      .where(and(eq(posts.id, input.id), eq(posts.orgId, ctx.orgId)))
      .returning();

    if (!deleted) {
      // Zero rows: the post isn't in the caller's org. Don't reveal it exists elsewhere.
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    return deleted;
  });
```

For a **personal** resource (owned by one user, not the whole org), the predicate is the owner
column instead: `and(eq(posts.id, input.id), eq(posts.userId, ctx.auth.userId))`. Either way the
row is gated independently of the role. Drop this predicate and `permissionProcedure("post:delete")`
becomes a delete-any-post-in-any-org primitive for every editor — the exact failure this skill exists
to prevent.

## Surfacing permissions to the client (for Rule 4 states)

The same matrix decides whether the UI shows a control. Expose a `can`-derived flag from the
session, but treat the client value as cosmetic — the server gate is the real boundary. Never
trust a client-asserted permission.

```ts
// a tiny query the client reads to hide controls it isn't allowed to use
permissions: orgProcedure.query(({ ctx }) => {
  const role = toRole(ctx.orgRole);
  return {
    canDeletePost: can(role, "post:delete"),
    canInvite: can(role, "member:invite"),
  };
}),
```

## Test the deny path, not just the allow path

An allow-only test passes even when default-deny is broken. Assert rejection explicitly, and
assert ownership holds *independently* of an authorized role:

```ts
test("viewer cannot delete a post", async () => {
  const viewer = await callerFor({ orgId: "org_A", orgRole: "org:member" });
  await expect(viewer.post.deletePost({ id: somePostId })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

test("an editor still cannot delete another org's post", async () => {
  const editorA = await callerFor({ orgId: "org_A", orgRole: "org:editor" });
  const bPost = await seedPost({ orgId: "org_B" });
  // RBAC would allow the action class; the org predicate must still reject the row.
  await expect(editorA.post.deletePost({ id: bPost.id })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});

test("only admin may assign roles", async () => {
  const editor = await callerFor({ orgId: "org_A", orgRole: "org:editor" });
  await expect(
    editor.member.assignRole({ userId: "u_2", role: "editor" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
```

The second test is the one that catches the headline failure: a role that *may* perform the
action class is still stopped at the row by ownership/tenant. Run these as part of the
`security-pass` review for any role-gated feature.
