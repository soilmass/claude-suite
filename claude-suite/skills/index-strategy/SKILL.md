---
name: index-strategy
description: >
  Choose the right indexes for a Drizzle table by reasoning from query shape, not by
  guessing or indexing everything. Covers the non-negotiable floor (an index on every
  foreign key), composite indexes for multi-column filters and their left-prefix /
  column-order rules, partial indexes for soft-delete (`deleted_at IS NULL`) and status
  enums, unique constraints vs. unique indexes, and when an index costs more on writes
  than it saves on reads. Produces the `index()` / `uniqueIndex()` lines that belong in
  the schema, plus the rationale recorded against each.
  Use when: "add an index", "indexing strategy", "what to index", "composite index", "slow filter".
  Do NOT use for: diagnosing why a specific query is slow with EXPLAIN (use query-optimization),
  or defining the tables, columns, and relations themselves (use schema-design).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the missing/mis-ordered index failure class: unindexed
    foreign keys, single-column indexes where a composite is needed, and full indexes where
    a partial fits soft-delete/status. Baseline section is the encoded failure class;
    replace with an observed transcript.
---

# index-strategy

The decision skill for *which* indexes a table needs and *why*, driven by the queries that
actually run against it. Given a table plus its read patterns, it emits the precise
`index()` / `uniqueIndex()` definitions — every foreign key indexed, a composite (correct
column order) for each multi-column filter, a partial index for soft-delete/status — each
with its one-line rationale.

The spine and the nine inviolable rules live in `../../CLAUDE.md`. This skill obeys the
schema conventions there (index every FK and every frequently-filtered/sorted column) and
keeps Rule 6 in view (timestamp columns you sort on are `timestamptz`).

---

## Non-Negotiable Rules

An unindexed hot path looks fine on a seed and falls over in production, so these are hard
lines:

- **Never leave a foreign key unindexed.** Postgres does not auto-index the referencing
  side of an FK; every `references()` column gets an `index()` (schema convention in
  `../../CLAUDE.md`).
- **Never satisfy a multi-column filter with separate single-column indexes** where one
  composite serves it; reason about column order (equality first, then sort/range) instead.
- **Never put a full index where a partial fits** on a soft-delete/status table: if reads
  always carry `deleted_at IS NULL` or `status = 'active'`, the index carries that
  predicate so dead rows never bloat it.
- **Never add an index without naming the query it serves.** No read behind it = pure write
  tax and bloat.

Refuse these rationalizations: "the FK probably gets indexed automatically"; "I'll index
each column separately, the planner will combine them"; "index everything, storage is
cheap"; "we'll add the index once it's slow in prod."

---

## When to Use

- A new table from `schema-design` needs its index set decided before it ships.
- A read pattern filters/sorts on more than one column and you need the right composite.
- A table uses soft delete (`deleted_at`) or a status enum and reads always scope by it.
- A uniqueness rule must be enforced at the database (one membership per user+org).

## When NOT to Use

- A specific query is already slow and you need EXPLAIN/ANALYZE to find why →
  `query-optimization` (it owns diagnosis; this skill owns the up-front choice).
- The tables, columns, relations, or cardinality don't exist yet → `schema-design`
  (this skill consumes its output and decides indexes on top).
- You are changing an index on a live table with data → `migration-author` (adding an
  index on a large table needs `CREATE INDEX CONCURRENTLY` and a coordinated deploy).
- You are reshaping how data is fetched (N+1, joins) → `drizzle-relational-queries`.

---

## Procedure

1. **List the real query shapes first (medium-interrogation).** Enumerate every
   `where`/`orderBy`/join the procedures issue against the table — equality, range, sort,
   and FK join columns. Indexes serve queries; without the list you are guessing. See
   `references/index-selection.md`.

2. **Index every foreign key — no discussion.** Each `references()` column gets a plain
   `index()`: the floor from `../../CLAUDE.md` and the most common omission. It makes joins
   and ownership filters (`eq(table.userId, ctx.auth.userId)`, Rule 2) seek, not scan. See
   `references/drizzle-index-syntax.md`.

3. **Build a composite for each multi-column filter, in the right column order.** Equality
   first, then sort, then range last (the "ESR" rule). `(userId, createdAt)` serves `where
   userId = ? order by createdAt` AND `where userId = ?` via the left prefix — replacing a
   standalone `userId` index. See `references/index-selection.md`.

4. **Use a partial index for soft-delete and status predicates.** When reads always carry
   `deleted_at IS NULL` or `status = 'active'`, attach the same `.where()` to the index so
   it covers only live/active rows. See `references/index-selection.md`.

5. **Distinguish a uniqueness rule from a read index.** A business invariant (one active
   membership per `(userId, orgId)`) is a `uniqueIndex()` — often partial, to allow
   re-joining after soft delete. Validate the input filling those columns at the boundary
   (Rule 8). See `references/drizzle-index-syntax.md`.

6. **Subtract: drop indexes no query justifies.** Each index taxes every write. Remove any
   no enumerated query reads, any made redundant by a composite's left prefix, and any
   low-selectivity index a partial would serve better. See `references/index-selection.md`.

7. **Record the rationale and hand off application.** Ship each index with the query it
   serves (comment or `DECISIONS.md`, especially non-obvious column orders/predicates).
   Indexing a live, large table is a `migration-author` concern (`CREATE INDEX
   CONCURRENTLY`); a new table's indexes ship in the initial schema.


## Composes With

- **Consumes:** `schema-design` — the tables, FK constraints, and `relations()` it indexes
  are defined there; this skill decides the index set on top.
- **Pairs with:** `query-optimization` — that skill diagnoses a slow query with EXPLAIN and
  may prescribe an index; this one chooses the set proactively. Same column-order reasoning
  from opposite ends (after-the-fact vs. up-front).
- **Hands off:** indexing a populated table → `migration-author` (concurrent build,
  coordinated deploy); a missing relation or wrong cardinality → `schema-design`.


## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> This is the encoded failure class, not a captured transcript. Replace it after running
> the task without the skill and recording what the agent actually does.

**Failure class encoded:** Asked to "add the right indexes for the orders table," the agent
defines FK columns (`userId`, `orgId`) and ships **zero** indexes, assuming Postgres indexes
foreign keys automatically (it does not) — every ownership filter and join becomes a
sequential scan. Variants: for `where userId = ? and status = 'active' order by created_at
desc` it adds three single-column indexes instead of one partial composite `(userId,
createdAt) where status = 'active'`, so the planner bitmap-ANDs and still re-sorts; it gives
`deleted_at`/`status` full indexes that bloat with every dead row; it orders the composite
`(createdAt, userId)` so the frequent `where userId = ?` left-prefix lookup can't use it;
and it "indexes everything," taxing every write. Each passes on a 50-row seed, then scans
millions at the edge.


## Examples

**Input:** "Orders table: belongs to a user and an org, has a status enum, soft-deleted via
`deleted_at`. The hot read is the user's active orders newest-first."
**Output:** `index('orders_user_id_idx').on(t.userId)` and
`index('orders_org_id_idx').on(t.orgId)` (FK floor); a partial composite for the hot read —
`index('orders_user_active_idx').on(t.userId, t.createdAt.desc()).where(sql\`${t.deletedAt}
is null and ${t.status} = 'active'\`)` — equality column first, sort column last, predicate
matching the always-present filter. No standalone `status` or `createdAt` index; the
composite's left prefix already serves `where userId = ?`.

**Input:** "Memberships: a user can belong to an org once, but may rejoin after leaving
(soft delete)."
**Output:** A *partial* unique index, not a plain unique constraint:
`uniqueIndex('memberships_user_org_active_idx').on(t.userId, t.orgId).where(sql\`${t.deletedAt}
is null\`)` — enforces one *active* membership per user+org while allowing historical
soft-deleted rows, and serves the membership lookup. Plus `index()` on each FK.

**Input:** "Audit log, append-only, queried by `entityId` then time range."
**Output:** One composite `index('audit_entity_time_idx').on(t.entityId, t.createdAt)` —
equality (`entityId`) before range (`createdAt`); no index on the rarely-read `actorId`. On
an append-heavy table every extra index is pure write cost.


## Edge Cases

- **A filter column has very low selectivity** (a 2-value boolean) → prefer a *partial*
  index keyed on the hot value, or fold it into a composite's predicate, over a standalone
  index the planner ignores.
- **You filter on a `jsonb` field** → a btree index won't serve key lookups; use a GIN
  index, and reconsider whether that data should be a real column (`schema-design`) per the
  jsonb guidance in `../../CLAUDE.md`.
- **The table is large and already in production** → do not add the index inline; hand to
  `migration-author` for `CREATE INDEX CONCURRENTLY` so the build doesn't lock writes.
- **Two candidate composites overlap** (`(a,b)` and `(a)`) → keep only `(a,b)`; its left
  prefix covers `(a)`. But `(a,b)` does NOT cover `(b)` — if a query filters on `b` alone,
  that needs its own index.

## References

- `references/index-selection.md` — the decision framework: FK floor, composite column
  order (ESR / left-prefix), partial indexes for soft-delete and status, selectivity, and
  the subtraction pass that removes write-taxing indexes no query reads.
- `references/drizzle-index-syntax.md` — the real Drizzle DSL: `index()`, `uniqueIndex()`,
  `.on()` with `.asc()`/`.desc()`, partial `.where(sql\`…\`)`, the third-arg index callback
  in `pgTable`, naming conventions, and the drizzle-kit generate/apply note.

## Scripts

`scripts/` is reserved. A signal that would justify one: a static check that lists every
`references()` column in `src/db/schema/` and flags any without a matching `index()` —
mechanically enforceable, unlike the query-shape reasoning that is the core of this skill.
