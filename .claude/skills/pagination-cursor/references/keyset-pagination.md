Purpose: the keyset (cursor) pagination mechanics — why not offset, the `(sort, id)` tuple predicate in Drizzle, the composite index, and the opaque Zod-validated cursor.

# Why keyset, not offset

`LIMIT n OFFSET k` tells the database to fetch `k + n` rows and throw away the first `k`. Two
failures follow:

- **Cost grows with the page number.** Page 500 scans ~500·n rows before returning n. At the
  edge (short CPU/time budgets, per-invocation billing) this gets expensive and slow fast.
- **It drifts under mutation.** Offsets address rows by *position*. Insert or delete a row
  between two page fetches and the window shifts: the last row of page 1 reappears as the
  first of page 2 (duplicate), or a row is jumped (skip). Feeds and activity lists mutate
  constantly, so this is not a corner case.

Keyset (a.k.a. cursor / seek) pages by *value*: "give me the next n rows whose sort key is
strictly past the last row I saw." It addresses rows by content, so inserts/deletes elsewhere
don't shift the window, and with the right index each page is an O(n) index range scan
regardless of depth.

The tradeoff keyset accepts: you can only go to the next/previous page (no "jump to page
47"), and an exact total count is not cheap. For feeds, infinite scroll, and "load more" that
is exactly the right shape.

# The sort key MUST be unique

Keyset compares the last-seen sort value against the next rows. If the sort column is not
unique (timestamps collide at millisecond resolution under load), `< lastValue` either drops
every tied row after the boundary or, with `<=`, repeats them. Fix: sort by the column **plus
a unique tiebreaker** — the primary key — and cursor on the composite tuple.

Prefer a UUIDv7 (or other time-sortable) PK (per CLAUDE.md "Money, time, IDs"): id order then
matches insert order, so even paging by id alone is stable and monotonic.

# The tuple predicate in Drizzle

Order by `(created_at desc, id desc)`. The cursor is the last returned row's
`(created_at, id)`. The next page is every row whose tuple is strictly less than the cursor.

## Row-value form (clean, one comparison)

Postgres supports row-value comparison `(a, b) < (x, y)`, which is exactly the lexicographic
semantics keyset needs. Express it with `sql`:

```ts
import { and, eq, desc, sql } from "drizzle-orm";

const rows = await db
  .select()
  .from(orders)
  .where(
    and(
      eq(orders.userId, ctx.auth.userId), // Rule 2: ownership ANDed in, never replaced
      cursor
        ? sql`(${orders.createdAt}, ${orders.id}) < (${cursor.createdAt}, ${cursor.id})`
        : undefined, // first page: no cursor predicate
    ),
  )
  .orderBy(desc(orders.createdAt), desc(orders.id))
  .limit(input.limit + 1); // +1 sentinel row to detect "has next page"
```

Note `and(..., undefined)` is fine — Drizzle drops `undefined` conditions, so the first page
(no cursor) cleanly omits the keyset predicate.

## OR-expanded form (portable, if you avoid raw row-values)

Equivalent without row-value syntax:

```ts
const keyset = cursor
  ? or(
      lt(orders.createdAt, cursor.createdAt),
      and(eq(orders.createdAt, cursor.createdAt), lt(orders.id, cursor.id)),
    )
  : undefined;
```

Both are identical in result. The row-value form is terser and the planner handles it well on
a matching composite index; the OR form is easier to read for mixed-direction sorts.

# Ascending vs descending

Keep the comparison operator and the `orderBy` direction in lockstep:

- `orderBy(desc(col), desc(id))` → predicate uses `<` (`(col, id) < (cursor...)`).
- `orderBy(asc(col), asc(id))`  → predicate uses `>`.

A mismatch returns rows in the wrong window and is a common silent bug.

# The composite index (required for it to be fast)

Keyset without a matching index still range-scans badly. Add an index whose columns are
`(filter columns…, sort column, id)` in the sort direction:

```ts
// in the table definition
(t) => ({
  userCreatedIdx: index("orders_user_created_id_idx").on(
    t.userId,
    t.createdAt,
    t.id,
  ),
})
```

The leading `userId` matches the ownership filter; `createdAt, id` match the order + cursor.
If the column isn't indexed, hand off to `schema-design` (new table) or `migration-author`
(live table) — do not ship keyset over an unindexed sort.

# The opaque, Zod-validated cursor (Rule 8, Rule 1)

The cursor crosses the network from an untrusted client. Encode it opaquely (clients should
not parse or fabricate it) and **validate on decode** — a forged/garbled cursor must fail
parse, never reshape SQL.

```ts
import { z } from "zod";

// what a cursor decodes to — one shared schema (CLAUDE.md: one Zod schema per op)
export const orderCursor = z.object({
  createdAt: z.coerce.date(),
  id: z.string().uuid(),
});
export type OrderCursor = z.infer<typeof orderCursor>;

export function encodeCursor(row: { createdAt: Date; id: string }): string {
  const json = JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id });
  return btoa(encodeURIComponent(json)); // Web-standard, edge-safe — no Node Buffer
}

// decode is a validated boundary: parse, never trust
export function decodeCursor(raw: string): OrderCursor {
  const json = JSON.parse(decodeURIComponent(atob(raw)));
  return orderCursor.parse(json); // throws on a bad/forged cursor — Rule 8
}
```

`btoa`/`atob` with `encodeURIComponent` are Web-standard APIs available natively at the edge —
no Node `Buffer` (the stack runs on the edge runtime; Node built-ins are off-limits). The
`encodeURIComponent` wrap keeps `btoa` safe for non-Latin1 characters. `createdAt` round-trips
as an ISO string (Rule 6: UTC at the boundary). The decoded type flows into the predicate
inferred — no `any`, no cast (Rule 1).

# The `limit + 1` next-cursor trick

Fetch one more row than the page size. If you got `limit + 1` rows, there is a next page:
drop the extra row and emit its predecessor's cursor; otherwise `nextCursor` is null. This
avoids a separate `count()` to know whether more pages exist. See `trpc-and-ui.md` for the
procedure code that applies it.
