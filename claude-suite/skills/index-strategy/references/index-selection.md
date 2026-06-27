Purpose: the decision framework for choosing indexes from query shape — the FK floor,
composite column order, partial indexes, selectivity, and the subtraction pass.

# Choosing indexes from query shape

An index exists to serve a query. Start from the queries, not the columns. For each table,
write down every read the tRPC procedures issue against it:

- **equality** predicates — `where eq(t.userId, ...)`
- **range** predicates — `where gte(t.createdAt, ...)`, `between`, `>`/`<`
- **sort** columns — `orderBy(desc(t.createdAt))`
- **join** columns — every FK used in a join or ownership filter
- **always-present** predicates — `deleted_at is null`, `status = 'active'`

The index set falls out of that list. Nothing else justifies an index.

## 1. The foreign-key floor (non-negotiable)

Postgres automatically indexes the *primary key* and the *referenced* side of an FK (the
target's PK). It does **not** index the *referencing* column. So a child row pointing at a
parent (`orders.userId -> users.id`) has no index on `orders.userId` unless you add one.

Consequence without it:
- Ownership filters `eq(orders.userId, ctx.auth.userId)` (Rule 2) sequentially scan.
- Joins from parent to children scan.
- `ON DELETE` cascade checks scan the child table.

Rule: **every `references()` column gets an `index()`.** This is the single most common
omission and the cheapest to get right.

## 2. Composite indexes and column order (ESR + left prefix)

A multi-column filter wants ONE composite index, not several single-column ones. Postgres
*can* bitmap-AND two single-column indexes, but it is slower than a purpose-built composite
and still can't satisfy an `ORDER BY` from them.

Order the columns **E → S → R**: Equality first, then Sort, then Range.

- Equality columns must come first — they narrow to a contiguous slice of the index.
- The sort column comes next so the slice is already ordered (no separate sort step).
- An open-ended range column comes last; columns after a range can't be used for further
  seeking.

Example: `where userId = ? and status = ? order by created_at desc`
→ `(userId, status, createdAt desc)`. The two equalities pin a slice, `createdAt desc`
returns it pre-sorted.

**Left-prefix rule:** an index on `(a, b, c)` also serves queries on `(a)` and `(a, b)` —
it does NOT serve `(b)`, `(c)`, or `(b, c)`. So:
- A composite `(userId, createdAt)` makes a standalone `(userId)` index redundant — drop it.
- If a query filters on `createdAt` alone, the composite does not help; it needs its own.

Match the index's sort direction to the query when you sort one way consistently
(`createdAt desc` for newest-first feeds); mixed directions only matter for multi-column
sorts.

## 3. Partial indexes for soft-delete and status

When a predicate is *always* present in the reads, push it into the index with `.where()`.
The index then stores only the rows that match, staying small and skipping dead/inactive
rows entirely.

- **Soft delete:** reads carry `deleted_at is null` (Rule 6 tombstones are excluded at
  read time). Index `... .where(sql\`${t.deletedAt} is null\`)`. The index never grows with
  deleted rows.
- **Status:** a worker polls `where status = 'pending'`. A partial index on
  `.where(sql\`${t.status} = 'pending'\`)` is tiny and ignores the millions of `done` rows.
- **Partial unique:** "one *active* membership per user+org" → `uniqueIndex(...).on(userId,
  orgId).where(deleted_at is null)`. Enforces the invariant only over live rows, so a user
  can rejoin after a soft delete.

A partial index is only usable when the query's predicate provably implies the index's
predicate. Keep the index's `.where()` identical to the always-present filter.

## 4. Selectivity — when an index won't help

An index pays off when it eliminates most rows. A column with few distinct values (a
boolean, a 3-value status across evenly-split rows) has low selectivity; the planner often
chooses a sequential scan over it anyway.

- Don't add a standalone index on a low-cardinality boolean.
- Instead make it a *partial* index keyed on the hot value, or a predicate inside a
  composite (`(userId, createdAt) where status = 'active'`).
- High-selectivity columns (ids, emails, slugs, timestamps) are the good index targets.

## 5. The subtraction pass

Every index is a tax on writes (each insert/update/delete maintains it) and consumes
storage and cache. After choosing, remove:

- Any index no enumerated query reads (you couldn't name the filter/sort/join → delete it).
- Any single-column index made redundant by a composite's left prefix.
- Any low-selectivity standalone index a partial would serve better.
- Redundant overlap: keep `(a, b)`, drop `(a)`; but keep a separate `(b)` if a query needs
  `b` alone.

Append-heavy tables (audit logs, events) feel write tax most — index them most sparingly.

## Worked checklist (per table)

1. Listed every where/orderBy/join against the table? 
2. Every `references()` column has an `index()`?
3. Each multi-column filter has one composite, columns in E→S→R order?
4. Standalone indexes redundant to a composite left-prefix removed?
5. Always-present `deleted_at is null` / `status = ?` pushed into partial `.where()`?
6. Business uniqueness enforced with `uniqueIndex()` (partial if soft-delete applies)?
7. Each surviving index annotated with the query it serves (comment or `DECISIONS.md`)?
8. Live/large table? → hand to `migration-author` for `CONCURRENTLY`.
