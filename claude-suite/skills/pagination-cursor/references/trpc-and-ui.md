Purpose: the tRPC list procedure shaped for infinite queries, the `useInfiniteQuery` + `getNextPageParam` client wiring, and the four-state list component.

# The tRPC list procedure

Thin (per CLAUDE.md): validate input, scope ownership, call the keyset query, shape the page.
The input takes an optional opaque cursor string and a bounded page size — both Zod-validated
(Rule 8). The cursor is decoded inside the procedure via the shared `decodeCursor`.

```ts
import { z } from "zod";
import { and, eq, desc, sql } from "drizzle-orm";
import { protectedProcedure } from "~/server/api/trpc";
import { orders } from "~/db/schema";
import { decodeCursor, encodeCursor } from "~/server/pagination/orderCursor";

export const listOrders = protectedProcedure
  .input(
    z.object({
      // cursor is the opaque string; decoded + validated below (Rule 8)
      cursor: z.string().nullish(),
      limit: z.number().int().min(1).max(100).default(20), // bounded — Rule 8
    }),
  )
  .query(async ({ ctx, input }) => {
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;

    const rows = await ctx.db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.userId, ctx.auth.userId), // Rule 2: ownership, ANDed not replaced
          cursor
            ? sql`(${orders.createdAt}, ${orders.id}) < (${cursor.createdAt}, ${cursor.id})`
            : undefined,
        ),
      )
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(input.limit + 1); // sentinel row

    // hasNext = we fetched the extra row; drop it from the page
    let nextCursor: string | null = null;
    if (rows.length > input.limit) {
      const last = rows.pop()!; // the sentinel is the (limit+1)th row
      // the cursor for the NEXT page is the last row we actually return
      const lastReturned = rows[rows.length - 1]!;
      nextCursor = encodeCursor(lastReturned);
      void last;
    }

    return { items: rows, nextCursor };
  });
```

Notes:
- `cursor` is `nullish()` so the first page can omit it.
- `limit` is `.max(100)` — never let the client request an unbounded page (Rule 8, and an
  edge cost guard).
- The return type `{ items, nextCursor }` is fully inferred; `useInfiniteQuery` reads it
  type-safely on the client (Rule 1). No cast anywhere.
- If a paged row needs related data, build the per-page query with
  `drizzle-relational-queries` (`with`/join) — still one query per page, never N+1 (Rule 7).

# Client: `useInfiniteQuery` + `getNextPageParam`

tRPC's React Query integration exposes `useInfiniteQuery` for any procedure with a `cursor`
input. `getNextPageParam` reads the `nextCursor` the procedure returned; React Query feeds it
back as the next `cursor`.

```tsx
"use client";
import { api } from "~/trpc/react";

export function OrdersList() {
  const query = api.orders.list.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );

  // Rule 4 — loading (initial)
  if (query.isPending) return <ListSkeleton />;

  // Rule 4 — error, with retry
  if (query.isError)
    return <ErrorState message="Couldn't load orders." onRetry={() => query.refetch()} />;

  const items = query.data.pages.flatMap((p) => p.items);

  // Rule 4 — empty (distinct from loading)
  if (items.length === 0) return <EmptyState label="No orders yet." />;

  // Rule 4 — success
  return (
    <div className="flex flex-col gap-md">
      <ul className="flex flex-col gap-sm">
        {items.map((o) => (
          <OrderRow key={o.id} order={o} />
        ))}
      </ul>
      {query.hasNextPage && (
        <button
          className="rounded-md bg-surface px-md py-sm text-fg"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
```

All `className` values resolve to `@theme` tokens (`gap-md`, `px-md`, `bg-surface`, `text-fg`)
— no raw hex or arbitrary px (Rule 3). Replace the token names with the project's actual
tokens from `design-tokens`.

# Infinite scroll instead of a button

Swap the button for an IntersectionObserver sentinel that calls `fetchNextPage` when it
scrolls into view:

```tsx
import { useEffect, useRef } from "react";

function useInfiniteScroll(onReach: () => void, enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!enabled || !ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && onReach(),
      { rootMargin: "200px" }, // prefetch slightly before the bottom
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onReach, enabled]);
  return ref;
}
```

Render `<div ref={sentinelRef} />` after the list and pass
`useInfiniteScroll(() => query.fetchNextPage(), query.hasNextPage && !query.isFetchingNextPage)`.
Keep the "Load more" button too as a keyboard/AX fallback so the list is operable without a
scroll-triggered fetch (a11y-gate concern).

# The four states, restated for lists (Rule 4)

- **Loading** — `isPending` on the first fetch → a skeleton, not a bare spinner where
  possible. `isFetchingNextPage` is a *separate* in-list indicator, not the top-level loading
  state.
- **Empty** — zero items after a successful fetch. Must be visually distinct from loading; a
  spinner that never resolves on an empty list is the classic Rule 4 miss.
- **Error** — `isError` → a message plus a retry (`refetch`). A failed *next-page* fetch
  should surface inline (e.g. a "Retry" under the list) without blowing away loaded pages.
- **Success** — the flattened list plus the load-more affordance while `hasNextPage`.

# Bidirectional (scroll up for newer)

For a chat-style view that pages both directions, return `prevCursor` too and provide
`getPreviousPageParam`. The "older" predicate uses `<` with `desc` order; the "newer"
predicate uses `>` with `asc` order (then reverse for display). Keep each direction's
`orderBy` and comparison operator in lockstep (see `keyset-pagination.md`).
