Purpose: how to hold shareable UI state (filters, sort, tabs, pagination, search) in the URL with typed search-param parsers, so the type chain (Rule 1) stays unbroken from the query string to the component.

# Why the URL is a first-class store

Filters, sort order, the active tab, the page/cursor, and the search query are **view state
that should be linkable**: reloadable, shareable, and respected by Back/Forward. The URL is a
store you already have, with free persistence and sharing. Putting this state in `useState`
throws all of that away.

In the App Router the URL is also the bridge to the server: a Server Component reads
`searchParams`, so URL-held filters drive the server query directly (`data-fetching-cache`
owns the fetch and its caching). One source of truth — the URL — feeds both the client UI and
the server read.

# The failure to avoid: stringly-typed params

`searchParams.get("sort")` returns `string | null`. Reaching for that raw, then comparing
against string literals scattered through the component, is an untyped boundary (Rule 8) and a
broken type chain (Rule 1). Every read needs a **typed parser** with a default.

# Typed search-param state (nuqs-class)

Use a typed search-params library (`nuqs` is the reference) so each param has a parser, a
default, and an inferred type. The parser is the Zod-equivalent boundary for the URL.

```ts
// products-search-params.ts — the single typed definition, shared client + server.
import {
  createSearchParamsCache,
  parseAsStringLiteral,
  parseAsInteger,
} from "nuqs/server";

// Root the option set in the schema, not a hand-typed string union (Rule 1).
import { productCategories } from "~/db/schema/products"; // a pgEnum — use its .enumValues
// Add an "all" sentinel for "no filter"; it must be in the literal set, or the default is a type error.
const categoryOptions = ["all", ...productCategories.enumValues] as const;
export const sortKeys = ["name", "price", "createdAt"] as const;

export const productSearchParams = {
  category: parseAsStringLiteral(categoryOptions).withDefault("all"),
  sort: parseAsStringLiteral(sortKeys).withDefault("createdAt"),
  page: parseAsInteger.withDefault(1),
} as const;

// Server: parse searchParams in the RSC and feed the typed values to the query.
export const productSearchCache = createSearchParamsCache(productSearchParams);
```

```tsx
// ProductFilters.tsx — Client Component. Reads/writes the typed params.
"use client";
import { useQueryStates } from "nuqs";
import { productSearchParams, sortKeys } from "./products-search-params";

export function ProductFilters() {
  const [{ category, sort }, setParams] = useQueryStates(productSearchParams);
  // `category` and `sort` are typed literals here — no string-vs-literal guesswork.
  return (
    <Select value={sort} onValueChange={(v) => setParams({ sort: v as typeof sort })}>
      {sortKeys.map((k) => (
        <SelectItem key={k} value={k}>{k}</SelectItem>
      ))}
    </Select>
  );
}
```

```tsx
// page.tsx — Server Component. Same typed params drive the server query.
import { productSearchCache } from "./products-search-params";

type SearchParams = Promise<Record<string, string | string[] | undefined>>; // Next 15 async params
export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const { category, sort, page } = await productSearchCache.parse(searchParams);
  // Typed values → tRPC server caller / Drizzle query. data-fetching-cache owns caching.
}
```

# Rules that still apply

- **Defaults are explicit.** Every param has a `withDefault`, so a missing param is a value,
  not `undefined` leaking into the query.
- **The option set is inferred, not hand-typed.** Sort keys / category values trace to the
  Drizzle column / pgEnum or a shared `as const`, so adding a category can't silently break a
  filter (Rule 1).
- **Validate at the boundary (Rule 8).** A parser that rejects junk (`?page=banana`) and falls
  back to the default is the URL's equivalent of a Zod parse. Never trust a raw param.
- **Never put secrets or server-only ids you don't want enumerated in the URL.** A public,
  guessable `?org=42` invites IDOR — ownership is still checked server-side (Rule 2), and
  prefer non-enumerable ids (UUIDv7) for anything sensitive in a link.

# When the param list gets unwieldy

If a page accumulates a dozen params, keep only the **shareable** ones in the URL and push the
rest down to local state. Group related params (a `filters` object serialized to one param)
only when they always change together; otherwise keep them separate so each is independently
linkable.
