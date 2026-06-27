Purpose: how to reconcile the optimistic guess with server truth on settle, handle infinite queries and concurrent mutations, and a rollback/typing checklist for review.

# Reconciliation and pitfalls

## Why settle-invalidate is mandatory, not optional

The optimistic value is a prediction. The server returns the authority: the real id, the
real `updated_at`, any derived columns (counts, computed status). `onSettled` runs on
success and error, so a single `invalidate()` there guarantees the cache converges to
truth either way. Skipping it leaves the cache holding a temp id or a wrong timestamp that
never self-corrects until the next unrelated refetch.

Two reconciliation strategies, pick per case (record non-obvious choices in `DECISIONS.md`):

- **Invalidate (default).** Simple, always correct, costs one refetch. Use unless the
  refetch causes a visible flicker.
- **Patch from server result (`onSuccess`).** Write the returned row into the cache with
  `setData` and skip the refetch. Lower latency, no flicker, but you must map the server
  row into the cache shape yourself. Reconciliation/staleness policy is owned by
  `data-fetching-cache` — defer to it when choosing.

The temp id is minted client-side in `onMutate` (`crypto.randomUUID()`), not part of the
mutation input — so return it in the context and read it back as `ctx?.tempId`, not
`input.tempId`:

```tsx
onSuccess(serverRow, _input, ctx) {
  utils.comment.list.setData({ threadId: serverRow.threadId }, (old) =>
    old?.map((c) => (c.id === ctx?.tempId ? serverRow : c)),
  );
},
```

## Infinite / paginated queries

An infinite query's cache is `{ pages, pageParams }`, not a flat array. Use
`setInfiniteData` (and `cancel`/`getInfiniteData`) and map over `pages`:

```tsx
await utils.feed.list.cancel();
const prev = utils.feed.list.getInfiniteData();
utils.feed.list.setInfiniteData(undefined, (old) =>
  old && {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      items: page.items.map((i) => (i.id === input.id ? { ...i, ...input } : i)),
    })),
  },
);
return { prev };
```

`setData` over an infinite cache silently writes the wrong shape and the list goes blank.

## Concurrent mutations on the same key

`cancel()` stops in-flight *queries*, not other in-flight mutations. Two optimistic writes
to the same key can interleave. Mitigations, in order of preference:

1. **Disable the control while pending** (`disabled={mutation.isPending}`) — the simplest;
   also satisfies the loading facet of rule 4.
2. **Debounce rapid identical actions** (e.g. a toggle spammed) before firing the mutation.
3. If genuinely concurrent edits to one record are a product requirement, that is a
   conflict-resolution problem, not an optimistic-UI one — do not paper over it with
   optimism; surface server conflicts explicitly.

Each mutation still snapshots independently, so the last `onError` to run restores the last
snapshot it took — fine for the disable/debounce cases, incorrect if true concurrency is
allowed, which is why you prevent it rather than handle it.

## Making the error visible (rule 4)

A rollback that renders nothing looks like "the click did nothing." The error state must be
on screen: an inline message, a toast plus a re-enabled control, or an aria-live
announcement (which `a11y-gate` will check). When the optimistic action is a form submit,
`rhf-advanced` owns mapping the server error back onto fields / `root.serverError` — call
into it rather than re-implementing.

## Review checklist

- [ ] `await utils.x.cancel(input)` precedes every `setData` in `onMutate`.
- [ ] `onMutate` returns a snapshot context for **every** key it writes.
- [ ] `onError` restores **every** snapshotted key from context.
- [ ] `onSettled` (or an `onSuccess` patch) reconciles **every** key.
- [ ] The cache updater is typed `(old) => …` over the inferred output; no `any`, no `!`,
      `undefined` handled (rule 1).
- [ ] Optimistic rows satisfy the full inferred select type — money integer minor units
      (rule 5), timestamps `new Date()` UTC (rule 6).
- [ ] Infinite queries use `setInfiniteData`, not `setData`.
- [ ] The error/rollback state renders something the user can see and act on (rule 4).
- [ ] The procedure behind the mutation still Zod-validates (rule 8) and checks ownership
      against `ctx.auth.userId` (rule 2) — optimism changes nothing server-side.
