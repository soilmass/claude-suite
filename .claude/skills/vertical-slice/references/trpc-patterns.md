# tRPC patterns: thin procedures, ownership checks, no N+1

## Thin procedure shape

A procedure does four things and nothing else: validate input (via the shared Zod
schema), authorize (ownership), delegate to a plain function, return. Logic in the
function, not the procedure — this keeps procedures readable, testable, and reusable.

```ts
update: protectedProcedure
  .input(updateThingSchema)
  .mutation(async ({ ctx, input }) => {
    await assertOwnsThing(ctx, input.id);   // authorize
    return updateThing(input);              // delegate
  }),
```

Anti-pattern (fat procedure): DB calls, branching, formatting, and side effects all
inlined in the `.mutation` body. Extract them.

## The ownership-check pattern (inviolable rule 2)

`protectedProcedure` guarantees `ctx.auth.userId` exists. It does NOT guarantee the
caller owns the row they named. Always re-check:

```ts
async function assertOwnsThing(ctx: Ctx, id: string) {
  const row = await ctx.db.query.things.findFirst({
    where: (t, { eq }) => eq(t.id, id),
    columns: { ownerId: true },
  });
  if (!row || row.ownerId !== ctx.auth.userId) {
    throw new TRPCError({ code: "NOT_FOUND" }); // NOT_FOUND, not FORBIDDEN — don't leak existence
  }
}
```

Return `NOT_FOUND` rather than `FORBIDDEN` for rows the user doesn't own, so the API
doesn't confirm the existence of other users' records.

## Avoiding N+1 (inviolable rule 7)

A query inside a loop over rows is the tell. Use Drizzle relational queries / joins:

```ts
// BAD: N+1
const projects = await ctx.db.query.projects.findMany({ where: ... });
for (const p of projects) {
  p.tasks = await ctx.db.query.tasks.findMany({ where: eq(tasks.projectId, p.id) }); // 1 query per row
}

// GOOD: one query with the relation
const projects = await ctx.db.query.projects.findMany({
  where: ...,
  with: { tasks: true },
});
```
