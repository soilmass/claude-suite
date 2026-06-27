---
name: drizzle-relational-queries
description: >
  Load related data in a single round trip using Drizzle's relational query API
  (`db.query.X.findMany({ with })`) or explicit joins, so a parent + its children come
  back in one query instead of one-query-per-row. This is the constructive antidote to
  Rule 7 (no N+1): write the correct shape the first time. Covers `relations()` setup,
  nested `with`, per-relation `columns`/`limit`/`orderBy`, when to drop to a manual join
  or aggregate, and the `inArray` batch pattern for the cases the relational API can't
  express.
  Use when: "load related data", "drizzle join", "relational query", "fetch with relations".
  Do NOT use for: finding existing N+1s in written code (use n1-hunter), or defining the
  tables and relations themselves from scratch (use schema-design).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the N+1 failure class (Rule 7): a query inside a
    `.map()`/`for` over parent rows. Baseline section is the encoded failure class;
    replace with an observed transcript.
---

# drizzle-relational-queries

The build-loop skill for reading related data correctly. Given "show each order with its
line items" or "load the user and their projects," it produces a single nested query
whose result type is fully inferred — never a loop that fires one query per parent row.
It is the constructive twin of `n1-hunter` (which finds the defect after the fact).

The spine and the nine inviolable rules live in `../../CLAUDE.md`. This skill does not
restate them; it obeys Rule 7 (no N+1) and Rule 1 (unbroken type chain), and it keeps
Rule 2 (ownership) intact while reshaping how data is fetched.

---

## Non-Negotiable Rules

The N+1 failure ships as plausible-looking code, so these are hard lines:

- **Never issue a query inside a loop over rows.** No `await db.query…` or `db.select…`
  inside `.map()`, `for`, `for…of`, or `Promise.all(rows.map(...))` where the callback
  queries. That is Rule 7's exact tell. Load children with `with` or a join instead.
- **Never cast the result to fix the shape.** The relational query's return type is
  inferred from your `relations()` and the `with`/`columns` you requested. If it doesn't
  match, the relations or the request are wrong — fix those, not the type (Rule 1).
- **Never widen ownership to make the join easier.** Re-fetching a child set across all
  users and filtering in memory leaks data and breaks Rule 2. Scope by `ctx.auth.userId`
  at the root and let the relation constrain the rest.
- **Never `with` an unbounded collection on a list endpoint.** A list of parents each
  pulling all children is a payload bomb; bound it with per-relation `limit` + `orderBy`,
  or aggregate (a count) instead of hydrating.

Refuse these rationalizations: "it's just a few rows, the loop is fine"; "I'll cast it,
the data is really there"; "fetching all children once and filtering is basically a join";
"I'll add the limit later."

---

## When to Use

- A read needs a parent plus one or more related sets (one-to-many, many-to-one, m2m).
- You are about to write `.map()` over rows and reach for the related record of each.
- A `vertical-slice` procedure's read step needs to hydrate relations.
- A list/detail view needs nested data shaped for the component in one query.

## When NOT to Use

- You are auditing or hunting N+1s already present in code → `n1-hunter`.
- The tables or `relations()` don't exist yet, or cardinality is undecided →
  `schema-design` (it owns relation definition; this skill consumes them).
- The change alters a column/relation's shape on an existing schema →
  `migration-author`.
- You are building the whole feature, not just its read → `vertical-slice` (call this as
  its data-loading step).

---

## Procedure

1. **State the shape you need (low-interrogation).** Name the root entity, each relation
   to pull, the cardinality of each, and whether each child set is bounded or could be
   large. This determines relational-`with` vs. join vs. aggregate. Cheap to get right
   up front, expensive to discover at the payload.

2. **Confirm `relations()` exist for every edge you traverse.** The relational query API
   (`db.query.*`) only sees relations declared with `relations()` in the schema — the FK
   alone is not enough. If a relation is missing, that is `schema-design`'s job; add it
   there, do not work around it with a manual loop. See `references/relational-queries.md`.

3. **Reach for the relational query first (`db.query.X.findMany`).** Use `with` for the
   relations, `columns` to select only the fields the component needs (Rule 1 favors
   narrow types; smaller payloads matter at the edge), and `where` at the root. Anchor
   ownership at the root `where` with `ctx.auth.userId` (Rule 2). See
   `references/relational-queries.md`.

4. **Bound every collection relation.** For any one-to-many pulled on a list, add a
   per-relation `limit` and `orderBy`. If you only need a count or sum, do not hydrate the
   rows — aggregate with a join + `groupBy` instead. See `references/joins-and-aggregates.md`.

5. **Drop to an explicit join when relational `with` doesn't fit.** Aggregates, arbitrary
   join predicates, partial-column cross-table projections, and `DISTINCT` are join
   territory: `db.select({...}).from(a).leftJoin(b, eq(...))`. Choose `inner` vs `left`
   deliberately — `leftJoin` keeps parents with no children, `innerJoin` drops them. See
   `references/joins-and-aggregates.md`.

6. **Use the `inArray` batch pattern as the only sanctioned "two query" fallback.** When
   neither `with` nor a single join is expressible, collect the parent ids and fire ONE
   child query with `inArray(child.parentId, ids)`, then group in memory. Two queries,
   not N. Never a query per id. See `references/joins-and-aggregates.md`.

7. **Verify the type chain and the round-trip count.** The result type must be the
   inferred nested type — no `as`, no `any` (Rule 1). Count the queries the code issues
   for the realistic row count: it must be O(1) (or the 2 of the batch pattern), never
   O(rows). If you resolved a non-obvious fetch-shape fork, record it in `DECISIONS.md`.

---

## Composes With

- **Consumes:** `schema-design` — the `relations()` and FK constraints this skill
  traverses are defined there.
- **Pairs with:** `vertical-slice` — this is the read step inside a slice's tRPC
  procedure; the slice calls it rather than reinventing the fetch.
- **Feeds:** `n1-hunter` — code written with this skill is what the hunter verifies stays
  N+1-free; when the hunter finds a loop, the fix is to apply this skill.
- **Hands off:** missing relation/cardinality → `schema-design`; relation-shape change on
  a live schema → `migration-author`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent told to implement as
> a typical dev would, with no project conventions). The encoded failure class was confirmed.

**Observed run.** Prompt: "Implement a tRPC `getAll` that returns every post with its author." With no skill the agent produced:

```ts
const allPosts = await ctx.db.select().from(posts);
const postsWithAuthors = await Promise.all(
  allPosts.map(async (post) => {
    const author = await ctx.db
      .select().from(users).where(eq(users.id, post.authorId));
    return { ...post, author: author[0] };
  }),
);
```

Its own note: *"Fetched all posts, then mapped over them and ran a per-post query to grab each author — simplest mental model."* — that is Rule 7's exact tell (a query inside `Promise.all`/`.map` over rows instead of a join or relational `with`), and it bites because it issues O(rows) round trips at the edge; the run also leaked `select()` columns (Rule 1/9) and skipped Zod output validation (Rule 8).

**Failure class (confirmed).** The "get the list, then get each item's relation" mental model compiles, passes a 3-row dev seed, and reads as correct — then melts the edge function once row counts grow, because every parent row fires its own child query. Wrapping the loop in `Promise.all` only makes the N+1 concurrent, not singular. This skill prevents it by writing the single-round-trip shape (relational `with` or an explicit join) the first time, with ownership anchored and columns narrowed.

---

## Examples

**Input:** "Show each of the signed-in user's projects with its tasks."
**Output:** One relational query —
`db.query.projects.findMany({ where: eq(projects.ownerId, ctx.auth.userId), with: { tasks: { columns: { id: true, title: true, status: true }, orderBy: (t, { desc }) => desc(t.createdAt), limit: 50 } } })`.
Ownership anchored at the root (Rule 2), tasks bounded + ordered, columns narrowed, return
type fully inferred (Rule 1), one round trip (Rule 7).

**Input:** "Order list with the line-item count and total per order — not the items
themselves."
**Output:** A join + aggregate, not a `with`:
`db.select({ ...orderCols, itemCount: count(lineItems.id), totalCents: sum(lineItems.priceCents) }).from(orders).leftJoin(lineItems, eq(lineItems.orderId, orders.id)).where(eq(orders.userId, ctx.auth.userId)).groupBy(orders.id)`.
`leftJoin` keeps zero-item orders; totals stay integer minor units (Rule 5); one query.

**Input:** "I need each post with its author and the post's tags (many-to-many)."
**Output:** Nested `with` through the join table:
`db.query.posts.findMany({ with: { author: { columns: { id: true, name: true } }, postsToTags: { with: { tag: true } } } })` — author is many-to-one, tags resolve through the
`posts_to_tags` relation, all in one query.

---

## Edge Cases

- **The relation isn't declared in `relations()`** → stop and add it via `schema-design`;
  do not fall back to a per-row loop because `with` "doesn't work."
- **The child set is genuinely large and unbounded per parent** → don't `with` it on the
  list; show a count (aggregate join) and lazy-load the rows on the detail view.
- **You need an aggregate AND the rows** → two purposeful queries (one aggregate, one
  bounded fetch) is fine; that is O(1), unlike a per-row loop.
- **Cross-table filter the relational API can't express** (e.g. "projects having any
  overdue task") → use an explicit join with the predicate in `where`, or an `exists`
  subquery; not fetch-then-filter-in-JS.

## References

- `references/relational-queries.md` — `relations()` setup and the `db.query.*` API:
  nested `with`, `columns`, per-relation `limit`/`orderBy`/`where`, m2m through join tables.
- `references/joins-and-aggregates.md` — explicit `leftJoin`/`innerJoin`, `groupBy`
  aggregates (count/sum), partial-column projection, and the `inArray` two-query batch
  pattern that replaces an N+1 loop.

## Scripts

`scripts/` is reserved. A signal that would justify one: a static check that flags an
`await db.*` lexically nested inside `.map(`/`for` within a procedure file — but that
detection belongs to `n1-hunter`, so this skill likely stays script-free.
