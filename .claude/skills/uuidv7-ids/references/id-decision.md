Purpose: the decision framework for choosing a primary-key type per table — the trust-boundary test, why UUIDv7 over v4, why never an exposed serial, and how IDs are validated at boundaries.

# Choosing a primary-key type per table

## The one test: does this ID cross a trust boundary?

Run this for every table:

> Does this row's identifier ever leave the server — in a URL path/query, an API response
> body, an email or notification link, a webhook payload, or as a foreign key another party
> can reference?

- **Yes (or "maybe", or "not yet but plausibly")** → **UUIDv7**. Public-facing, sortable,
  non-enumerable. This is the `../../CLAUDE.md` default for public IDs.
- **No, never — the row is read only server-side as part of another aggregate** → **BIGSERIAL**
  is acceptable. Record the "internal-only" justification in `DECISIONS.md`.

When you cannot prove "no, never," choose UUIDv7. The asymmetry is the whole point:

| Wrong choice | Cost |
| --- | --- |
| UUIDv7 on a row that turned out internal-only | a few bytes/row, marginal write overhead |
| Serial on a row that turned out public-facing | IDOR surface, enumeration, business-metric leak — a security defect requiring a destructive migration to fix |

## Why an exposed serial is a defect, not a style choice

A sequential integer in a public position leaks two things even with auth in place:

1. **Enumeration / IDOR surface.** `/orders/1042` invites `/orders/1041`, `/orders/1`, … If
   the ownership check (Rule 2) is ever missing or buggy on one endpoint, the whole table is
   walkable. Non-enumerable IDs make that bug non-catastrophic — defense in depth.
2. **Business-metric leak.** The max visible ID (and the gap between two IDs over time) reveals
   total volume and growth rate. Competitors read your order/signup counts off the URL bar. The
   "German tank problem."

Non-enumerable IDs are **not** authorization. The ownership filter
(`eq(table.userId, ctx.auth.userId)`, Rule 2) is still mandatory on every protected procedure.
UUIDv7 reduces blast radius; it does not replace the check.

## Why UUIDv7, never v4, for the PK

UUIDv4 is fully random. As a primary key its random high bits scatter every insert to a random
leaf of the btree:

- index pages fragment, cache hit rate drops, and inserts amplify writes (page splits) — felt
  acutely at the edge where the DB round-trip is already the cost center.

UUIDv7 puts a 48-bit Unix-millisecond timestamp in the high bits with random low bits:

- **time-ordered** → new rows append to the right of the btree like a serial, so insert
  locality and index health match a sequential key;
- **still non-enumerable** → the random tail (and the millisecond granularity) means you cannot
  guess the next ID;
- **bonus:** `ORDER BY id` is approximately chronological, so it doubles as a creation-order
  sort without a separate column for coarse cases (still store `created_at` per Rule 6 for
  anything you actually sort/filter on by time).

So: if the answer is "a UUID," it is **v7**. Never v4 for a PK. Never `text` — use the native
16-byte `uuid` type (see `drizzle-id-columns.md`).

## Boundary validation (Rule 8)

A public UUID arriving from the outside is untrusted input. Parse it before it touches a query:

```ts
// shared zod schema — one copy, used by the tRPC input AND any form
export const orderIdInput = z.object({ id: z.string().uuid() });
```

- tRPC: `.input(orderIdInput)` — the procedure receives a validated `string`.
- App Router route param: `z.string().uuid().parse(params.id)` before the query; a malformed
  `[id]` should 404/400, not reach Drizzle.
- Never interpolate a raw route param into a `where`; never `JSON.parse` an ID off a payload
  without parsing (Rule 1, Rule 8).

## Recording the call

Per `../../CLAUDE.md`, decide per table at schema time and record non-obvious choices in
`DECISIONS.md`:

- every BIGSERIAL choice, with the "internal-only / never leaves the server" justification;
- the v7 generation site (app-side vs. Postgres `uuidv7()`/extension) once, project-wide;
- any deviation (e.g. a legacy table keeping its serial PK behind a public lookup table).
