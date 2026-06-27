---
name: optimistic-updates
description: >
  Optimistic UI on the decided edge stack: a tRPC mutation that writes the expected
  result into the TanStack Query cache before the server answers, rolls it back exactly
  on error, and reconciles with server truth on settle. Covers the cancel → snapshot →
  setData → rollback → invalidate cycle via `api.useUtils()`, keeping the type chain
  unbroken and every touched cache key consistent. This is where instant-feedback UI
  silently corrupts the cache: no rollback, no cancel, a stale refetch clobbering the
  optimistic value, or an error that leaves the lie on screen.
  Use when: "optimistic update", "optimistic ui", "instant feedback", "rollback on error".
  Do NOT use for: plain (non-optimistic) mutations (use vertical-slice), or the cache
  key / invalidation / staleness rules themselves (use data-fetching-cache).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the optimistic-cache failure class: setData with no
    cancel, no snapshot, no rollback, and no reconciling invalidate. Baseline section is
    the encoded failure class; replace with an observed transcript.
---

# optimistic-updates

The optimistic-mutation pattern on the decided stack: write the predicted result into the
TanStack Query cache immediately, then make the server the final arbiter — roll back the
exact prior snapshot on error and invalidate to reconcile on settle. The spine and the
nine rules live in `../../CLAUDE.md`; this skill obeys them — chiefly rule 1 (typed cache
updaters), rule 2 (optimistic UI never relaxes server-side ownership), and rule 4 (the
error state is the rollback). It consumes the cache conventions owned by
`data-fetching-cache`; it does not redefine them.

---

## Non-Negotiable Rules

These are observed, compiles-anyway failures in generated optimistic code:

- **Never `setData` without first `await`-ing `cancel()`.** An in-flight refetch that
  resolves after your optimistic write clobbers it with stale server data.
- **Never update without snapshotting and returning the prior value.** `onMutate` returns
  `{ prev }`; `onError` restores it. No snapshot means no honest rollback — the lie stays
  on screen (rule 4: the error state is the rollback).
- **Never skip the reconciling `invalidate()` in `onSettled`.** The optimistic value is a
  guess; server truth (real id, `updated_at`, derived fields) must replace it on settle,
  on success and error alike.
- **Never type the cache updater with `any` or a non-null `!` on `getData()`.** The
  updater is `(old) => …` over the inferred query output; handle `old === undefined`
  (rule 1).

Refuse these rationalizations: "the mutation almost never fails so rollback is optional";
"invalidate is wasteful, the optimistic value is already correct"; "cancel is a race that
won't happen"; "I'll cast `old` to get it compiling."

---

## When to Use

- A toggle/like/reorder/inline-edit needs to feel instant before the server confirms.
- A create/delete should appear/disappear in a list immediately, then reconcile.
- A mutation must roll back cleanly to the pre-action UI when the server rejects it.
- Multiple cache entries (a list and a detail) must stay consistent across one mutation.

## When NOT to Use

- The mutation can wait for the server (a plain pending→success form) → `vertical-slice`.
- The question is which key to use, how stale, or when to invalidate broadly →
  `data-fetching-cache`.
- The form's resolver, field arrays, or server-error mapping is the issue → `rhf-advanced`.
- You are checking finished code against the nine rules → `rule-audit`.

---

## Procedure

1. **Confirm an optimistic update is warranted (low-interrogation).** Optimism pays off
   only when the result is predictable client-side and failure is rare. If the server
   computes something you cannot mirror (server-assigned price, conflict resolution), do a
   plain mutation with a pending state instead — hand to `vertical-slice`.

2. **Identify every cache key the mutation affects (medium-interrogation).** A toggle
   usually touches both `list` and `byId`. List the exact query+input tuples up front; a
   forgotten key shows a stale value next to a fresh one. Cache-key shape is owned by
   `data-fetching-cache` — read it, do not invent keys here.

3. **In `onMutate`: cancel, snapshot, then `setData`.** `await utils.x.cancel()` for each
   affected key, capture `prev = utils.x.getData(input)`, then write the predicted value
   with a typed updater. Return all snapshots as the mutation context. See
   `references/optimistic-mutation-pattern.md`.

4. **For optimistic creates, mint a typed temp row and reconcile its id.** Generate a
   client temp id (e.g. `crypto.randomUUID()`), build a row that satisfies the inferred
   select type — money as integer minor units (rule 5), `created_at` as `new Date()` in
   UTC (rule 6) — and let `onSettled`'s invalidate swap in the server's real id.

5. **In `onError`: restore the snapshot exactly (high-interrogation — this is where it
   ships broken).** Roll back every key you touched from context: `utils.x.setData(input,
   ctx?.prev)`. Surface the failure in the UI (rule 4); a rollback with no visible error
   reads as "nothing happened." See `references/reconciliation-and-pitfalls.md`.

6. **In `onSettled`: invalidate to reconcile.** `void utils.x.invalidate()` for each key,
   on success and error, so server truth replaces the guess. Server-side, the procedure
   still enforces auth AND ownership (rule 2) and Zod-validates input (rule 8) — optimism
   is a client illusion, never a relaxation of the boundary.

7. **Self-check and record forks.** Cancel before write? snapshot returned and restored?
   every key invalidated on settle? updater typed, no `any`/`!`? If you chose a non-obvious
   policy (e.g. debounced rapid toggles, or surgical `setData` patching instead of
   invalidate to avoid a flicker), record it in `DECISIONS.md`.

---

## Composes With

- **Consumes:** `data-fetching-cache` — the query-key shape, staleness, and invalidation
  policy this skill's `cancel`/`getData`/`setData`/`invalidate` calls operate against.
- **Pairs with:** `vertical-slice` — the slice builds the typed mutation and procedure;
  this skill layers optimism onto its `useMutation`. `rhf-advanced` — when the optimistic
  action is a form submit, it owns the resolver and server-error→field mapping.
- **Feeds:** `rule-audit`, `a11y-gate` — they inspect the result (typed updaters, the
  visible error state, the announced status change).

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> This is the encoded failure *class*, not a captured transcript. Replace it once you run
> the task without the skill and record what actually shipped.

**Failure class encoded:** Asked for "instant feedback," the agent calls
`utils.todo.list.setData(...)` inside `onMutate` with no preceding `cancel()` (so an
in-flight refetch lands a moment later and reverts the UI), never snapshots the prior
value, so `onError` has nothing to restore and the optimistic change sticks even though
the server rejected it; it casts `old as any` in the updater to silence the type error
(rule 1); it updates only the list and forgets the `byId` detail cache, so the same record
shows two values; it omits `onSettled`/`invalidate`, so the optimistic guess (a temp
client id, a wrong `updated_at`) is never reconciled with server truth; and the error
state is a swallowed promise rejection with nothing rendered (rule 4). Every line compiles
and demos perfectly on the happy path.

---

## Examples

**Input:** "Make the 'mark todo done' checkbox feel instant."
**Output:** `api.todo.toggle.useMutation` with `onMutate`: `await utils.todo.list.cancel()`
and `await utils.todo.byId.cancel({ id })`, snapshot both, `setData` the flipped `done`
with a typed `(old) => old && { ...old, done: input.done }` updater → `onError` restores
both snapshots and renders an inline error → `onSettled` invalidates both keys. The
procedure still checks the row belongs to `ctx.auth.userId` (rule 2).

**Input:** "New comment should appear immediately in the thread."
**Output:** `onMutate` cancels `comments.list`, snapshots it, appends a temp row
(`id: crypto.randomUUID()`, `created_at: new Date()` UTC per rule 6) typed to the inferred
comment shape → `onError` rolls the list back and shows the failure → `onSettled`
invalidates `comments.list`, swapping the temp row for the server row.

---

## Edge Cases

- **Infinite/paginated query** → `setInfiniteData` and update the correct page; do not
  `setData` a flat array over an infinite cache shape (see references).
- **Rapid repeated mutations on the same key (spam-clicking a toggle)** → `cancel` already
  guards each; additionally debounce or disable the control while pending so optimistic
  writes do not interleave inconsistently; record the choice in `DECISIONS.md`.
- **A flicker on settle because invalidate refetches a value identical to the optimistic
  one** → patch precisely with `setData` from the mutation's returned server row instead of
  a blanket invalidate; reconciliation policy is owned by `data-fetching-cache`.
- **Server returns the computed truth (final price, conflict-merged body)** → do not
  fabricate it optimistically; show pending and write the server result on success, or
  drop optimism entirely (rule 5 if money is involved).

---

## References

- `references/optimistic-mutation-pattern.md` — the full `useUtils` cancel → snapshot →
  typed `setData` → rollback → invalidate cycle, with single-key, list+detail, and
  optimistic-create (temp id) variants.
- `references/reconciliation-and-pitfalls.md` — reconciliation on settle, infinite-query
  updates, concurrent-mutation handling, and the rollback/typing checklist.

## Scripts

`scripts/` is reserved. A lint rule flagging a `setData` call in an `onMutate` that lacks a
preceding `cancel()` or a returned snapshot would earn its place if transcripts show those
two defects recurring; empty for now.
