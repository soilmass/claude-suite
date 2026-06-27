---
name: n1-hunter
description: >
  Hunt down N+1 data access (Rule 7) across tRPC routers, business-logic functions, server
  components, and loaders — the query fired once per parent row inside a `.map()`, `for`,
  or `Promise.all`. Locates each occurrence, ranks it by edge-cost blast radius, and
  prescribes the exact relational-query / join / `inArray` fix. This is the detective twin
  of `drizzle-relational-queries` (which writes the correct shape) — n1-hunter finds the
  loops already in the code and tells you what to replace them with.
  Use when: "find n+1", "n plus one", "slow because of loop queries", "query in a loop".
  Do NOT use for: writing the corrected relational query (use drizzle-relational-queries),
  or a full nine-rule sweep of a diff (use rule-audit).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the Rule 7 detection failure class: per-row database
    access (a query lexically nested in a loop over rows) that compiles, passes on a
    3-row seed, and melts the edge function on real data. Baseline section is the encoded
    failure class; replace with an observed transcript.
---

# n1-hunter

The detection-and-prescription skill for Rule 7 (no N+1). Given a router file, a directory,
or "why is this endpoint slow," it scans for database access nested inside a loop over rows,
reports each hit with location and severity, and names the single-round-trip rewrite. It
finds the defect; `drizzle-relational-queries` writes the cure.

The spine and the nine inviolable rules live in `../../CLAUDE.md`. This skill does not
restate them; it enforces Rule 7 and verifies the fix preserves Rule 2 (ownership at the
root) and Rule 1 (the result type stays inferred, not cast).

---

## When to Use

- A read endpoint is slow, timing out, or burning edge invocations and you suspect loop
  queries.
- Reviewing a diff or a router for per-row data access before it ships.
- After `vertical-slice` or a hand-written procedure, to confirm reads are O(1) not O(rows).
- Auditing an inherited codebase for the N+1 class specifically.

## When NOT to Use

- You need to author the corrected single query → `drizzle-relational-queries` (it owns the
  `with` / join / `inArray` constructions; n1-hunter points you to it).
- You want a full sweep across all nine rules of a diff → `rule-audit` (n1-hunter is the
  deep, single-rule specialist for Rule 7).
- The relation you need to traverse doesn't exist in `relations()` yet → `schema-design`.
- The fix is a sweeping cross-file restructure → `refactor` (n1-hunter hands it the list).

---

## Procedure

1. **Scope the hunt (low-interrogation).** Confirm what to scan: a file, `src/server/`,
   the whole repo. The hot zones are tRPC procedures, the plain functions they call, server
   components, route handlers, and any `loader`/`getData` helper. Cheap to widen; do it now.

2. **Grep for the structural tell, then read each hit.** The signature is a Drizzle call
   (`db.query.`, `db.select`, `await db.`) lexically inside `.map(`, `.forEach(`, `for (`,
   `for…of`, `while`, or `Promise.all(rows.map(...))`. Grep narrows the search; you must
   read each candidate — a call in a loop over a *fixed small constant* is not N+1. See
   `references/detection-patterns.md`.

3. **Classify each hit by shape.** Three families: (a) explicit per-row query in a loop;
   (b) `Promise.all(rows.map(async r => db…))` — concurrent but still N queries; (c) a lazy
   relation/accessor or a helper called per row that itself queries (the hidden N+1). Name
   which family each is — the fix differs. See `references/detection-patterns.md`.

4. **Rank by blast radius (high-interrogation on the worst).** Severity = (rows the loop
   iterates at production scale) × (queries per iteration), weighted by whether it sits on a
   list/feed endpoint vs. a one-off. A loop over an unbounded user-owned collection on a
   hot path is critical; a loop over a 3-element enum is noise. At the edge each query is a
   billed round trip, so O(rows) is both a latency and a cost defect. See
   `references/fix-prescriptions.md`.

5. **Prescribe the exact fix per hit.** Map shape → cure: parent+children → relational
   `with` (bounded by `limit`/`orderBy`); aggregate-only → `leftJoin` + `groupBy`; the
   inexpressible case → the `inArray` two-query batch. Each prescription names
   `drizzle-relational-queries` as the skill that writes it. See
   `references/fix-prescriptions.md`.

6. **Check the fix doesn't regress Rule 2 or Rule 1.** The most common bad "fix" is
   fetching all children across every user and filtering in memory — that removes the loop
   but leaks rows (Rule 2). Anchor ownership at the root `where` with `ctx.auth.userId`.
   The second is casting the assembled shape `as T[]` (Rule 1). Flag both in your report.

7. **Report, and hand off.** Output a ranked list: file:line, shape family, severity, the
   prescribed query, and the sibling that applies it. If the fix spans many call sites,
   hand the list to `refactor`. Record any non-obvious fetch-shape decision in `DECISIONS.md`.

---

## Composes With

- **Feeds:** `refactor` — when the N+1 fix touches many call sites or changes a function's
  shape, hand the ranked list over for the coordinated change.
- **Pairs with:** `drizzle-relational-queries` — the constructive twin; every prescription
  n1-hunter writes is built by that skill. **Pairs with:** `rule-audit` — n1-hunter is the
  Rule 7 deep dive that audit's single-pass scan defers to.
- **Hands off:** missing `relations()` / undecided cardinality → `schema-design`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project conventions). The encoded failure class was confirmed.

**Observed run.** A naive reviewer (no skill) was shown a planted-flaw orders-list artifact whose hot path fanned out per-row queries:

```ts
const orders = await db.select().from(ordersTable);
return Promise.all(orders.map(async (o) => {
  const customer = await db.query.customers.findFirst({ where: eq(customers.id, o.customerId) });
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, o.id));
  return { ...o, customer, lines };
}));
```

The reviewer caught a lot: it named the N+1 (a customer query plus a lines select per order), flagged the unbounded fetch, the missing owner scope (Rule 2), the `Promise.all` fan-out exhausting the pool, the redundant re-fetch of shared customers, and the unhandled `undefined` customer. Its verdict was "Needs changes." What it did NOT do was diagnose with prescriptive precision: it folded the N+1 into a flat six-item list of co-equal concerns with no edge blast-radius ranking, never quantified the defect as O(2N) round trips from *two distinct per-row families* in one loop, and offered only a hand-wavy "collapse into a single relational query or a join" without the shape→fix mapping (relational `with` for parent+children, the `inArray` batch for the inexpressible case) or the note that `Promise.all` makes the queries concurrent, not singular.

**Failure class (confirmed).** A capable generalist can *spot* an N+1 but stops at naming it, burying it in an unranked pile and prescribing a vague "use one query." This skill converts detection into a ranked, edge-cost-weighted report that separates each N+1 family, quantifies the round-trip blast radius, and routes each hit to the exact single-round-trip rewrite while preserving Rules 1 and 2.

---

## Examples

**Input:** "Why is `listProjectsWithTasks` slow?" pointing at a procedure that does
`const projects = await db.query.projects.findMany({...}); return Promise.all(projects.map(async p => ({ ...p, tasks: await db.query.tasks.findMany({ where: eq(tasks.projectId, p.id) }) })))`.
**Output:** One critical finding — `listProjectsWithTasks` line N, shape family (b)
Promise.all-per-row, severity critical (unbounded user collection on a list endpoint, 1+N
queries). Prescription: collapse to a single relational query
`db.query.projects.findMany({ where: eq(projects.ownerId, ctx.auth.userId), with: { tasks: { limit: 50, orderBy: … } } })`; built via `drizzle-relational-queries`. Note: keep ownership
at the root `where` (Rule 2).

**Input:** Scan `src/server/` for N+1.
**Output:** Ranked report. Critical: `invoice.list` calls `formatCustomer(inv.customerId)`
inside `.map()`, and that helper runs `db.query.customers.findFirst` (shape family c,
hidden). Fix: join customers in the list query or batch with `inArray(customers.id, ids)`.
Low: `dashboard.summary` loops over a fixed 4-element status array issuing a count each —
flagged informational, not N+1 in the row sense (bounded constant), optionally one
`groupBy` query.

**Input:** "Is this `for…of` over `members` a problem?" where the body does
`await db.insert(audit).values(...)`.
**Output:** Finding: write-side N+1 — N inserts in a loop. Prescription: a single batch
`db.insert(audit).values(members.map(m => ({...})))`. Same Rule 7 class on the write path.

---

## Edge Cases

- **The loop iterates a fixed small constant** (an enum, a 4-tab dashboard) → not a row
  N+1; report informational at most, do not raise critical.
- **The per-row query is a write** (`insert`/`update` in a loop) → still Rule 7; prescribe a
  single batched `insert().values([...])` or a `CASE`/`inArray` bulk update.
- **The "fix" already in the diff fetches-all-then-filters-in-JS** → flag it as a Rule 2
  ownership leak masquerading as an N+1 fix; require root-scoped `where`.
- **The relation needed for the fix isn't in `relations()`** → don't prescribe `with`; hand
  off to `schema-design` to declare the relation first, then `drizzle-relational-queries`.

## References

- `references/detection-patterns.md` — the grep signatures, the three N+1 shape families
  (explicit loop, `Promise.all`, hidden helper/accessor), read- vs write-side tells, and
  the false-positive list (fixed-constant loops, in-memory `.map()` over already-fetched
  data).
- `references/fix-prescriptions.md` — shape→fix mapping table, the severity rubric (rows ×
  queries × hotness), the edge-cost rationale, and how each prescription routes to
  `drizzle-relational-queries` while preserving Rules 1 and 2.

## Scripts

`scripts/` is reserved. The signal that would justify one: a static check that flags an
`await db.*` / `db.query.*` lexically nested inside `.map(`/`for`/`Promise.all` within
`src/server/**`, emitting file:line and exiting with the finding count. Detection is this
skill's job, so a heuristic linter here (run by `rule-audit`'s Rule 7 pass) is the likely
first script; the hidden-helper family (shape c) needs human reading and stays manual.
