---
name: pagination-cursor
description: >
  Paginate a list end to end with keyset (cursor) pagination across Drizzle, tRPC, and the
  UI, so large or actively-mutating result sets stay correct and cheap instead of degrading
  with `LIMIT/OFFSET`. Produces a stable sort key, a tie-broken `where` predicate, an opaque
  encoded cursor, a tRPC procedure shaped for `useInfiniteQuery`, and a Load-more / infinite-
  scroll component rendering all four states. Keeps ownership scoping intact while changing
  how rows are paged.
  Use when: "paginate", "cursor pagination", "infinite scroll", "load more", "keyset".
  Do NOT use for: loading a parent's related rows in one query (use drizzle-relational-queries),
  or offset pages over a small fixed set (allowed — see Edge Cases — but prefer keyset).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the offset-pagination failure class: `LIMIT/OFFSET` over
    large or mutating sets, which skips/duplicates rows and scans O(offset) at the edge.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# pagination-cursor

The build-loop skill for paging a list correctly. Given "infinite scroll the user's orders"
or "load more activity," it produces keyset pagination — a stable sort, an opaque cursor, a
tRPC procedure wired for `useInfiniteQuery`, and a component covering all four states —
instead of `LIMIT/OFFSET`, which skips and duplicates rows the moment the set mutates and
scans O(offset) rows on every page.

The spine and the nine inviolable rules live in `../../CLAUDE.md`. This skill does not
restate them; it obeys Rule 8 (the cursor is a validated boundary), Rule 1 (cursor and result
types stay inferred), Rule 2 (ownership scopes the root `where`), and Rule 4 (the list renders
all four states).

---

## Non-Negotiable Rules

Offset pagination compiles, demos fine on a static seed, and silently corrupts under real
traffic — so these are hard lines:

- **Never use `.offset()` for a large or mutating set.** Keyset only: page by
  `where (sort_key, id) < (last_key, last_id)`. Offset re-scans every skipped row and
  drifts when rows are inserted/deleted between pages.
- **Never page on a non-unique, non-stable sort alone.** Sort by a column plus a unique
  tiebreaker (the primary key), and cursor on the composite. A bare `createdAt` cursor
  drops or repeats rows that share a timestamp.
- **Never trust the cursor unparsed.** The cursor arrives from the client; decode and
  `z.parse` it before it touches a query (Rule 8). A malformed or forged cursor must fail
  validation, not reshape the SQL.
- **Never drop ownership when adding the cursor predicate.** The keyset `where` is ANDed
  onto the existing `ctx.auth.userId` scope (Rule 2), never replaces it.

Refuse these rationalizations: "offset is simpler and the list is small"; "createdAt is
unique enough"; "the cursor is just an id, no need to validate it"; "I'll add the tiebreaker
if duplicates show up."

---

## When to Use

- A list endpoint returns more rows than one page and the set grows or mutates (feeds,
  orders, activity, search results, comments).
- You are wiring `useInfiniteQuery` / a "Load more" button / infinite scroll to a tRPC list.
- An existing `LIMIT/OFFSET` (or `page`/`pageSize`) list is slow or shows skipped/duplicated
  rows under load — convert it to keyset.

## When NOT to Use

- You need a parent plus its related child rows in one round trip → `drizzle-relational-queries`
  (it owns the `with`/join shape; this skill pages the top-level list).
- The list never grows past a small fixed bound (a settings enum, a user's <50 tags) and is
  read whole → just `findMany` with an `orderBy`; no pagination layer.
- You are building the whole feature, not just its paged read → `vertical-slice` (call this
  as the list step).
- The sort/filter columns aren't indexed yet → `schema-design` for the index, or
  `migration-author` to add it to a live table; keyset without an index is still slow.

---

## Procedure

1. **Pin the sort order and its unique tiebreaker (medium-interrogation).** Name the sort
   column and confirm a unique, monotonic tiebreaker (the PK, ideally UUIDv7 so id order
   matches insert order); the cursor is the `(sort_value, id)` pair. Getting this wrong
   silently drops rows. See `references/keyset-pagination.md`.

2. **Confirm the sort and filter columns are indexed.** Keyset is only fast with a composite
   index matching `(filter cols…, sort_col, id)` in the sort's direction. If it's missing,
   that's `schema-design` / `migration-author`, not a workaround. See
   `references/keyset-pagination.md`.

3. **Define the cursor as a Zod-validated, opaque value (Rule 8, Rule 1).** Encode the
   `(sort_value, id)` pair (base64 of small JSON) and a Zod schema that decodes + validates
   it; a bad cursor fails parse, never reshapes the query. Share the schema, don't hand-write
   a client copy. See `references/keyset-pagination.md`.

4. **Write the keyset `where`, ANDed onto ownership (Rule 2, Rule 7).** Root-scope by
   `ctx.auth.userId`, then add the tuple comparison `(sort_col, id) < (cursor...)` (row-value
   or OR-expanded form), `orderBy` the same `(sort_col desc, id desc)`, and `limit(pageSize +
   1)`. One O(pageSize) query per page, no offset scan. See `references/keyset-pagination.md`.

5. **Shape the procedure output for `useInfiniteQuery`.** Fetch `limit + 1`; if the extra row
   exists, pop it and set `nextCursor` to the encoded cursor of the last returned row,
   else `nextCursor: null`. Return `{ items, nextCursor }`. The `nextCursor` type stays
   inferred (Rule 1). See `references/trpc-and-ui.md`.

6. **Wire the client with `useInfiniteQuery` + `getNextPageParam`.** Pass
   `getNextPageParam: (last) => last.nextCursor`, flatten `data.pages` for render, and drive
   the next fetch from a "Load more" button or an IntersectionObserver sentinel. See
   `references/trpc-and-ui.md`.

7. **Render all four states (Rule 4) and verify the type chain.** Loading (initial +
   `isFetchingNextPage`), empty (distinct from loading), error (with retry), success. No
   `any`/cast on cursor or items (Rule 1). Record a sort-key or offset-allowed fork in
   `DECISIONS.md`. See `references/trpc-and-ui.md`.

---

## Composes With

- **Consumes:** `drizzle-relational-queries` — when a paged row needs its own related data,
  the per-page query uses that skill's `with`/join shape; this skill only owns the paging.
- **Pairs with:** `vertical-slice` — this is the list-read step inside a slice; the slice
  calls it rather than reinventing pagination.
- **Runs against:** `rule-audit` — the result must pass Rules 1, 2, 4, 7, 8 clean.
- **Hands off:** missing sort/filter index → `schema-design`; adding it to a live table →
  `migration-author`.

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> This is the encoded failure class, not a captured transcript. Replace it after running the
> task without the skill and recording what the agent actually does.

**Failure class encoded:** Asked to "add infinite scroll to the orders list," the agent
writes `db.select().from(orders).limit(20).offset(page * 20)` driven by a `page` input —
offset pagination (re-scans O(offset) rows every page on the edge). Variants: paging on a
bare `orderBy(desc(orders.createdAt))` with no tiebreaker, so two orders sharing a
millisecond are dropped or shown twice across the page boundary; passing the raw client
`cursor` straight into `lt()` with no Zod parse and casting it `as number` (breaks Rules 8,
1); forgetting the `ctx.auth.userId` scope so page two leaks other users' orders (breaks
Rule 2); and a component that treats zero rows as a perpetual spinner (breaks Rule 4). Each
works on a 15-row dev seed and corrupts the moment the table grows and rows are inserted
between page fetches.

---

## Examples

**Input:** "Infinite-scroll the signed-in user's orders, newest first."
**Output:** Cursor = `(createdAt, id)`; `orderBy(desc(createdAt), desc(id))` with the tuple
predicate `(createdAt, id) < (cursor...)` ANDed onto `eq(orders.userId, ctx.auth.userId)`,
`limit(input.limit + 1)`, returning `{ items, nextCursor }`; client uses `useInfiniteQuery`
with `getNextPageParam: (l) => l.nextCursor`. Ownership ANDed in (Rule 2), tuple cursor
Zod-parsed (Rule 8), one O(limit) query (Rule 7).

**Input:** "We already have `?page=` offset pagination on the activity feed; it skips rows."
**Output:** Replace `.offset()` with the keyset predicate above, change the input from
`{ page }` to `{ cursor, limit }`, and swap the client `useQuery` for `useInfiniteQuery`. The
skip/duplicate symptom is the offset drift the conversion removes.

**Input:** "Load-more button for the user's comments, with a tied `createdAt`."
**Output:** Cursor on `(createdAt, id)` (the PK breaks the tie); a "Load more" button calls
`fetchNextPage()` disabled while `isFetchingNextPage`; the four states render explicitly, with
empty ("No comments yet") distinct from the loading spinner (Rule 4).

---

## Edge Cases

- **Small fixed set that is read whole** (a user's handful of saved filters) → skip the
  cursor layer; `findMany` with `orderBy`. Offset is also acceptable here — note the choice
  in `DECISIONS.md` so it isn't mistaken for drift.
- **User-selectable sort (e.g. price, then name)** → the cursor carries the active sort
  column's value plus the id, the index must cover that sort, and you need one cursor shape
  per sort option, not a shared one.
- **Total count / "showing X of N" required** → keyset can't cheaply give an exact total on
  a huge table; show an approximate or cached `count()`, not an `OFFSET`-driven page total.
- **Bidirectional paging (scroll up to older AND newer)** → two keyset predicates (`<` older,
  `>` newer) with mirrored `orderBy`; `useInfiniteQuery` supports `getPreviousPageParam`.

## References

- `references/keyset-pagination.md` — keyset vs offset, the `(sort, id)` tuple predicate in
  Drizzle (row-value and OR-expanded forms), the composite index, the opaque cursor
  encode/decode + Zod schema, and the `limit + 1` next-cursor logic.
- `references/trpc-and-ui.md` — the tRPC list procedure shaped for infinite queries, the
  `useInfiniteQuery` + `getNextPageParam` wiring, the IntersectionObserver sentinel, and the
  four-state list component.

## Scripts

`scripts/` is reserved. A signal that would justify one: a static check flagging `.offset(`
or a `page`/`pageSize` input on a list procedure — but that overlaps `rule-audit`'s remit
(Rule 7), so this skill likely stays script-free.
