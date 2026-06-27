Purpose: the canonical tRPC + TanStack Query optimistic-mutation cycle (cancel → snapshot → typed setData → rollback → invalidate), with single-key, list+detail, and optimistic-create variants.

# Optimistic mutation pattern

All cache access goes through tRPC's typed query-utils proxy, `api.useUtils()` (tRPC v11;
`api.useContext()` on older v10). Never reach for the raw `QueryClient` — `useUtils` keeps
the key shape and the inferred output type in the chain (rule 1). Query-key shape and
staleness policy are owned by `data-fetching-cache`; this file only shows the optimistic
mechanics layered on top.

The four-callback contract on `useMutation`:

| callback     | job                                                            |
|--------------|---------------------------------------------------------------|
| `onMutate`   | cancel in-flight, snapshot, write optimistic value, return ctx |
| `onError`    | restore the snapshot from ctx, surface the error              |
| `onSettled`  | invalidate to reconcile with server truth (success AND error) |
| `onSuccess`  | (optional) patch in the real server row to avoid a refetch    |

## Single-key toggle

```tsx
const utils = api.useUtils();

const toggle = api.todo.toggle.useMutation({
  async onMutate(input) {
    // 1. stop in-flight refetches so they can't clobber the optimistic write (rule: cancel)
    await utils.todo.list.cancel();
    // 2. snapshot for exact rollback
    const prev = utils.todo.list.getData();
    // 3. typed updater — handle undefined, no `any`, no `!` (rule 1)
    utils.todo.list.setData(undefined, (old) =>
      old?.map((t) => (t.id === input.id ? { ...t, done: input.done } : t)),
    );
    // 4. context for onError
    return { prev };
  },
  onError(_err, _input, ctx) {
    utils.todo.list.setData(undefined, ctx?.prev); // restore exactly
    // surface it — rule 4: the rollback is the error state, it must be visible
  },
  onSettled() {
    void utils.todo.list.invalidate(); // reconcile guess with server truth
  },
});
```

`setData(input, updater)` — the first arg is the **query input** the cache entry was keyed
by. For a no-arg query pass `undefined`. Mismatching the input writes a phantom entry and
the visible one never updates.

## List + detail (multiple keys, one mutation)

A record shown both in a list and on its own detail page lives in two cache entries; update
both or they diverge.

```tsx
const edit = api.todo.update.useMutation({
  async onMutate(input) {
    await Promise.all([
      utils.todo.list.cancel(),
      utils.todo.byId.cancel({ id: input.id }),
    ]);
    const prevList = utils.todo.list.getData();
    const prevDetail = utils.todo.byId.getData({ id: input.id });

    utils.todo.list.setData(undefined, (old) =>
      old?.map((t) => (t.id === input.id ? { ...t, ...input } : t)),
    );
    utils.todo.byId.setData({ id: input.id }, (old) =>
      old ? { ...old, ...input } : old,
    );

    return { prevList, prevDetail };
  },
  onError(_err, input, ctx) {
    utils.todo.list.setData(undefined, ctx?.prevList);
    utils.todo.byId.setData({ id: input.id }, ctx?.prevDetail);
  },
  onSettled(_data, _err, input) {
    void utils.todo.list.invalidate();
    void utils.todo.byId.invalidate({ id: input.id });
  },
});
```

## Optimistic create (temp id, reconciled on settle)

The server owns the real id and timestamps; the client mints a temporary, type-correct row
and lets the settle-invalidate replace it.

```tsx
const add = api.comment.create.useMutation({
  async onMutate(input) {
    await utils.comment.list.cancel({ threadId: input.threadId });
    const prev = utils.comment.list.getData({ threadId: input.threadId });

    const tempId = crypto.randomUUID(); // temp; server replaces on invalidate
    // satisfies the inferred select type — no partial cast (rule 1)
    const optimistic: RouterOutputs["comment"]["list"][number] = {
      id: tempId,
      threadId: input.threadId,
      body: input.body,
      authorId: currentUserId,        // client already knows the signed-in user
      createdAt: new Date(),          // UTC instant; display layer localizes (rule 6)
      updatedAt: new Date(),
    };

    utils.comment.list.setData({ threadId: input.threadId }, (old) =>
      old ? [...old, optimistic] : [optimistic],
    );
    return { prev, tempId };          // tempId travels in ctx for an onSuccess patch
  },
  onError(_e, input, ctx) {
    utils.comment.list.setData({ threadId: input.threadId }, ctx?.prev);
  },
  onSettled(_d, _e, input) {
    void utils.comment.list.invalidate({ threadId: input.threadId });
  },
});
```

`RouterOutputs` is the `inferRouterOutputs<AppRouter>` helper exported from your tRPC
client setup — it keeps the optimistic row anchored to the same type the query returns,
which traces back to Drizzle's `$inferSelect` (rule 1). Money fields stay integer minor
units in the optimistic row (rule 5); never fabricate a server-derived total.

## Server side is unchanged

Optimism is purely a client illusion. The procedure is still a thin `protectedProcedure`
that Zod-parses its input (rule 8) and checks the row belongs to `ctx.auth.userId`
(rule 2) before mutating. A confident UI over a missing ownership check is still the #1
vulnerability — the optimistic write does not touch the server's authorization at all.
