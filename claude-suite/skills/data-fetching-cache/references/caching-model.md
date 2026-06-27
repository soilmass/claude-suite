Purpose: the rendering/caching decision model for the edge — static vs ISR vs dynamic, the `fetch` cache options, what forces a route dynamic, and `cache()` vs `unstable_cache`.

# Rendering decision table

| Data shape | Render mode | How |
| --- | --- | --- |
| Public, rarely changes (marketing, docs) | Static | default; nothing dynamic in scope |
| Public, changes on a schedule (pricing, blog index) | ISR | `export const revalidate = N` on the segment, or `fetch(url, { next: { revalidate: N } })` |
| Per-user / authed / request-specific | Dynamic | reading `auth()`, `cookies()`, `headers()`, or `searchParams` opts the route out of static automatically — do not fight it back to static |
| Public but event-driven freshness | Static + tags | cacheable `fetch` with `next: { tags: [...] }`, invalidated by `revalidateTag` on the triggering event |

Rule of thumb: decide the **read location** (server, Rule 9) first, then the **render mode**,
then the **cache option**. Cache scope must never break ownership (Rule 2).

# What forces a route dynamic

Any of these in the render path makes the segment dynamic — by design, not a bug:

- `cookies()`, `headers()`, `draftMode()`
- Clerk `auth()` / `currentUser()` (reads headers)
- `searchParams` in a `page.tsx`
- a `fetch` with `cache: "no-store"`
- `export const dynamic = "force-dynamic"`

Conversely, `export const dynamic = "force-static"` will try to prerender and will **strip**
dynamic data — never apply it to an authed route; it silently produces wrong/empty data.

# `fetch` cache options (be explicit — defaults shifted across Next versions)

```ts
// Cacheable, time-revalidated, tagged for on-demand invalidation:
const res = await fetch(url, { next: { revalidate: 3600, tags: ["pricing"] } });

// Always fresh, per request (also forces the route dynamic):
const res = await fetch(url, { cache: "no-store" });

// Explicitly cache forever until a tag invalidation:
const res = await fetch(url, { cache: "force-cache", next: { tags: ["pricing"] } });
```

Do not rely on the implicit default. State `cache` or `next.revalidate` on every `fetch`
whose freshness matters, and `perishable-refresh` owns re-checking the current default.

# `cache()` vs `unstable_cache` (non-`fetch` work, e.g. Drizzle reads)

- **React `cache()`** — request-scoped memoization. Dedupes identical calls *within a single
  request render* (e.g. a query called by both `layout` and `page`). Does not persist across
  requests, so it cannot leak across users. Use it to avoid re-querying in one render.

```ts
import { cache } from "react";
export const getNote = cache(async (id: string, userId: string) => {
  return db.query.notes.findFirst({
    where: (n, { and, eq }) => and(eq(n.id, id), eq(n.userId, userId)), // ownership, Rule 2
  });
});
```

- **`unstable_cache`** — persistent cross-request cache with tags + TTL. Powerful and
  dangerous: the cache key must encode every input that changes the result, including the
  user id for per-user data, or you serve one user's data to another (Rule 2).

```ts
import { unstable_cache } from "next/cache";
const getUserNotes = (userId: string) =>
  unstable_cache(
    async () => db.query.notes.findMany({ where: (n, { eq }) => eq(n.userId, userId) }),
    ["notes", userId],                 // key parts — userId is REQUIRED here
    { tags: [`notes:${userId}`], revalidate: 60 },
  )();
```

Prefer `cache()` for per-user data unless you have measured a real cross-request win and can
key it safely. Fix N+1 (Rule 7) in the Drizzle query (relational `with`/joins), not by caching
a loop.

# Edge notes

- The DB driver is a per-request HTTP/serverless connection (Neon/Turso class). Never close
  over a connection inside `unstable_cache` such that it is reused across requests — see
  `edge-runtime-constraints`.
- Money rendered from cache is still integer minor units (Rule 5); timestamps still
  `timestamptz` converted at display (Rule 6) — caching changes none of that.
