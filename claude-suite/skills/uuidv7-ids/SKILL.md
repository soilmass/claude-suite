---
name: uuidv7-ids
description: >
  Decide the primary-key type for each table on the edge stack: UUIDv7 for anything that
  appears in a URL, an API response, or a foreign key crossing a trust boundary (time-sortable
  so it indexes like a serial, random-tailed so it is not enumerable), and BIGSERIAL only for
  rows that never leave the server. Covers how to generate v7 at the edge (app-side vs.
  Postgres `uuidv7()`), the Drizzle column definitions for each, and how to record the per-table
  call. Stops the two opposite mistakes: leaking sequential integer IDs in public URLs, and
  paying random-UUID write-amplification for internal-only rows.
  Use when: "id strategy", "uuid v7", "primary key type", "public ids", "enumerable ids".
  Do NOT use for: designing the whole schema — tables, columns, relations (use schema-design),
  or running the abuse/threat review on a feature (use security-pass).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the enumerable-ID failure class: sequential integer primary
    keys exposed in public URLs/APIs (IDOR surface + business-metric leak), and the inverse
    waste of random UUIDs on internal-only rows. Baseline section is the encoded failure class;
    replace with an observed transcript.
---

# uuidv7-ids

The per-table decision skill for *which* primary-key type a table gets and *why*: UUIDv7 when
the identifier is public-facing, BIGSERIAL when the row is internal-only. It emits the exact
Drizzle column definition and the one-line rationale recorded against it.

This implements the IDs convention in `../../CLAUDE.md` (UUIDv7 for public-facing, sortable and
non-enumerable; `BIGSERIAL` acceptable for internal-only rows). The spine and nine rules live
there; this skill keeps Rule 8 in view — every ID arriving as a route param or tRPC input is
Zod-parsed (`z.string().uuid()`) before it touches a query.

---

## Non-Negotiable Rules

A sequential integer in a URL is a defect that compiles, passes review, and ships — the schema
looks identical to a correct one. These are hard lines:

- **Never expose a sequential/auto-increment ID across a trust boundary.** Any value that lands
  in a URL, an API response body, an email link, or a foreign key referenced by another party
  is UUIDv7. `serial`/`bigserial` in a public position is an IDOR map and a business-metric leak
  (competitors read your order counts off `/orders/1042`).
- **Never reach for a random UUID (v4) as the primary key.** v4's random high bits scatter
  inserts across the btree, fragmenting the index and amplifying writes; v7's time-ordered
  prefix keeps inserts append-mostly. If you need a UUID, it is v7.
- **Never store a UUID as `text`.** Use the native `uuid` column type so it stores as 16 bytes
  and indexes correctly; `text` doubles the storage and loses validation.
- **Never let ownership rest on an unguessable ID.** A non-enumerable ID is defense in depth,
  not authorization — the ownership check (Rule 2) is still mandatory on every protected
  procedure regardless of ID type.

Refuse these rationalizations: "it's just an internal admin page, an int is fine" (it ends up
in a URL); "UUIDs are slow, use serial everywhere"; "v4 is what everyone uses"; "the ID is
random so we don't need the ownership check."

---

## When to Use

- A new table from `schema-design` needs its primary-key type decided before it ships.
- An identifier will appear in a route (`/invoices/[id]`), an API response, or an email link.
- You are deciding whether a join/FK column or an internal-only table should be UUID or bigint.
- You need the Drizzle column definition + edge-compatible v7 generation for either choice.

## When NOT to Use

- The tables, columns, relations, or cardinality don't exist yet → `schema-design` (this
  skill decides the PK type on top of its output; it does not model the domain).
- You are threat-modeling a feature's abuse cases (IDOR, enumeration) end to end →
  `security-pass` (this skill removes one enumeration vector; that skill reviews the whole).
- You are changing the ID type of a live table with data → `migration-author` (a PK type
  change is destructive and needs expand-contract across deploys).
- You are choosing indexes for the table → `index-strategy`.

---

## Procedure

1. **Classify each ID by trust boundary (high-interrogation).** For every table ask: does this
   ID ever leave the server — in a URL, an API payload, an email, or a foreign key another
   party can reference? Yes → UUIDv7. No, never → BIGSERIAL is acceptable. Getting this wrong
   is a security defect, so interrogate "is it *really* internal-only?" hard. See
   `references/id-decision.md`.

2. **Default to UUIDv7 when in doubt.** The cost of an unnecessary UUID is a few bytes and
   marginal write overhead; the cost of an exposed serial is enumeration and IDOR. When you
   cannot prove a row stays internal, choose UUIDv7. Record any BIGSERIAL choice and its
   "internal-only" justification in `DECISIONS.md`.

3. **Pick the v7 generation site for the edge.** Two valid sources: app-side via a small
   library in `$defaultFn`, or Postgres-side via `uuidv7()` (PG18) / the `pg_uuidv7` extension
   in `.default(sql\`...\`)`. At the edge with an HTTP driver, app-side generation is the
   portable default (no extension dependency, works across Neon/Turso). Record the choice in
   `DECISIONS.md`. See `references/drizzle-id-columns.md`.

4. **Write the Drizzle column definitions, matching FK types to their parent.** UUIDv7:
   `uuid('id').primaryKey().$defaultFn(...)`. Internal: `bigserial('id', { mode: 'number'
   }).primaryKey()`. A foreign key must be the same type as the PK it references — decide the
   parent first, children follow. Both PKs ship beside the standard `created_at`/`updated_at`
   `timestamptz` columns (Rule 6). See `references/drizzle-id-columns.md`.

5. **Validate the ID at every boundary (Rule 8).** Public UUIDs arriving as a route param or
   tRPC input get `z.string().uuid()` before any query; never interpolate a raw param into a
   `where`. This is the shared Zod schema, not an ad-hoc check. See `references/id-decision.md`.

6. **Re-confirm the ownership check is still present (Rule 2).** A non-enumerable ID reduces
   the attack surface but is not authorization. Every protected procedure that loads a row by
   its public ID still filters `eq(table.userId, ctx.auth.userId)`. Pair with `security-pass`
   for the full abuse review.

---

## Composes With

- **Consumes:** `schema-design` — the tables and relations whose primary keys this skill types
  are defined there; this skill decides UUIDv7-vs-BIGSERIAL on top of that output and emits the
  column definitions.
- **Pairs with:** `security-pass` — this skill closes the ID-enumeration / IDOR vector at the
  schema level; that skill runs the broader abuse-case and threat review on the feature.
- **Hands off:** changing the ID type of a populated table → `migration-author` (destructive,
  expand-contract); choosing indexes including the PK and FK indexes → `index-strategy`.

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> This is the encoded failure class, not a captured transcript. Replace it after running the
> task without the skill and recording what the agent actually does.

**Failure class encoded:** Asked to "set up IDs for the orders and invoices tables," the agent
types every primary key as `serial`/`bigserial`, including `orders.id` and `invoices.id` that
go straight into `/orders/[id]` routes and emailed invoice links — handing any user a working
enumeration of every order (`/orders/1`, `/orders/2`, …) and leaking total volume off the max
ID. Told to "use UUIDs," it swaps in random v4 (`gen_random_uuid()`), trading the leak for index
fragmentation and write amplification as random keys scatter across the btree. It stores the
UUID as `text` (32+ bytes, no validation) instead of native `uuid`, mismatches a foreign key
(UUID child pointing at a serial parent), and skips Zod-validating the `[id]` route param so a
malformed ID reaches the query. Each compiles and passes a happy-path review; the enumeration
only surfaces in a pen test.

---

## Examples

**Input:** "Orders table — appears at `/orders/[id]`, referenced in confirmation emails."
**Output:** Public-facing → UUIDv7. `id: uuid('id').primaryKey().$defaultFn(() => uuidv7())`
(app-side generation, edge-portable), plus `created_at`/`updated_at` timestamptz. The route
param is parsed `z.string().uuid()` and the procedure still filters by `ctx.auth.userId`. No
`serial` anywhere a user can see it.

**Input:** "`order_items` join table — only ever read server-side as part of an order, never
addressed by its own ID."
**Output:** Internal-only → `id: bigserial('id', { mode: 'number' }).primaryKey()` is
acceptable; recorded in `DECISIONS.md` with the "never leaves the server" justification. But
its `order_id` foreign key is `uuid` to match the UUIDv7 `orders.id` it references.

**Input:** "We want UUIDs but generated in the database, not the app."
**Output:** Use `.default(sql\`uuidv7()\`)` (Postgres 18) or the `pg_uuidv7` extension; the
column stays native `uuid`. Recorded in `DECISIONS.md` as the deviation, with the dependency
(PG version / extension) noted since it is not portable across the Neon/Turso edge drivers.

---

## Edge Cases

- **Postgres predates native `uuidv7()`** → generate app-side in `$defaultFn` with a v7
  library, or install `pg_uuidv7`; never fall back to v4. Record which in `DECISIONS.md`.
- **You truly need a short, human-typed code** (an invite code, a coupon) → that is not a
  primary key; keep the PK a UUIDv7 and add a separate, indexed, collision-checked `code`
  column. Don't shorten the PK.
- **A composite natural key is tempting** (`(user_id, org_id)`) → still give the table a
  surrogate UUIDv7 PK and enforce the pair with a unique index (`index-strategy`).
- **Migrating an existing `serial` PK to UUIDv7** → this is destructive; do not edit the column
  in place. Hand to `migration-author` for expand-contract (add `uuid` column, backfill,
  switch FKs and reads, contract) across deploys.

## References

- `references/id-decision.md` — the decision framework: the trust-boundary test
  (public-facing vs. internal-only), why v7 not v4 (time-ordered prefix vs. index
  fragmentation), why not exposed serials (IDOR + metric leak), default-to-UUID, and boundary
  validation with `z.string().uuid()`.
- `references/drizzle-id-columns.md` — the real Drizzle column definitions for both choices,
  app-side vs. Postgres-side v7 generation at the edge, native `uuid` vs. `text`, FK type
  matching, and the standard `timestamptz` `created_at`/`updated_at` companions.

## Scripts

`scripts/` is reserved. A signal that would justify one: a static check that scans
`src/db/schema/` for `serial`/`bigserial` primary keys on tables referenced by a `[id]` route
or returned from a router, and flags them — mechanically catchable, unlike the trust-boundary
judgment that is the core of the skill.
