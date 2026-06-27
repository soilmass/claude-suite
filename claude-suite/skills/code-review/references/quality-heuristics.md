Purpose: stack-specific quality smells (complexity, duplication, naming, dead code) and the concrete fix for each, for the code-review judgment pass.

# Quality heuristics

Smells that compile, pass `rule-audit`, and still make a codebase worse. Each has a tell and a
concrete fix. Cite `../../CLAUDE.md`'s spine where a smell is also a structural-decision drift.

## Layering smells (decided-stack specific)

### Fat tRPC procedure
**Tell:** A procedure body longer than ~10 lines doing arithmetic, branching, or multi-step
orchestration inline. The spine says procedures are thin: validate → authorize → call function →
return.
**Fix:** Extract the logic to a plain function in `src/lib/` or `src/server/services/`; the
procedure calls it. Bonus: the function becomes unit-testable without a tRPC harness, and the
inlined-logic case is exactly where a missing ownership check (Rule 2) hides — extraction makes
the auth step visible. Example:
```ts
// before — fat procedure
create: protectedProcedure.input(invoiceCreate).mutation(async ({ ctx, input }) => {
  let subtotal = 0;
  for (const l of input.lines) subtotal += l.qty * l.unitPriceCents;
  const tax = Math.round(subtotal * 0.0825);
  // ...20 more lines...
});
// after — thin procedure
create: protectedProcedure.input(invoiceCreate).mutation(({ ctx, input }) =>
  createInvoice(ctx.db, ctx.auth.userId, input)   // logic + ownership live in the function
);
```

### Component doing data orchestration
**Tell:** A component with `useEffect` + `fetch`/manual cache juggling, or chaining several
`useQuery` calls with derived state inline.
**Fix:** Move it to a `use*` hook (or a tRPC query with `select`). The component renders the four
states (Rule 4) over the hook's result; it does not own the orchestration.

### Duplicated Zod schema
**Tell:** A `z.object({...})` in the router and a near-identical one in the form/component.
**Fix:** One schema in the shared `zod-schema-library`, imported by both the procedure input and
the RHF resolver. Drift between two copies is a silent validation gap.

## Complexity smells

### Deep nesting
**Tell:** 3+ levels of `if`/`else`/`for`, or an arrow of `if (x) { if (y) { if (z) {`.
**Fix:** Guard clauses / early returns; invert the condition and `return` early.
```ts
// before
function price(o: { lines?: Array<{ length: number }> } | null) { if (o) { if (o.lines) { if (o.lines.length) { /* work */ } } } }
// after
function price(o: { lines?: Array<{ length: number }> } | null) {
  if (!o?.lines?.length) return 0;
  /* work */
}
```

### Boolean-flag parameter
**Tell:** `render(data, true, false)` — the call site can't be read without the signature.
**Fix:** Split into two named functions, or pass an options object with named keys.

### Function doing two jobs (low cohesion)
**Tell:** A name with "and" in it, or a function that fetches AND formats AND persists.
**Fix:** Split along the seams; each function does one thing its name fully describes.

### Over the complexity threshold
**Tell:** Many independent branches / a long `switch` with logic in each arm / cyclomatic
complexity roughly >10. More scrutiny for edge-runtime handlers where branch ordering is subtle.
**Fix:** Extract branch bodies, use a lookup map/object instead of a long `switch`, or a small
strategy table.

## Duplication smells

### Repeated Drizzle filter / ownership scope
**Tell:** `and(eq(table.id, id), eq(table.userId, ctx.auth.userId))` copy-pasted across queries.
**Fix:** A `scopedToUser(table, userId)` helper or a query-builder wrapper. Centralizing the
ownership filter also reduces the surface where Rule 2 can be forgotten.

### Repeated cursor-pagination block
**Tell:** The same `limit + 1`, `nextCursor` slice, `orderBy` block in multiple routers.
**Fix:** A shared paginate helper (see `pagination-cursor` skill); routers pass table + cursor.

### Copy-pasted component sub-tree
**Tell:** The same empty-state or error-fallback markup in two components.
**Fix:** Extract a shared `<EmptyState>` / `<ErrorFallback>` (still token-styled per Rule 3).

## Naming smells

| Tell | Fix |
| --- | --- |
| `data`, `data2`, `res`, `tmp`, `obj`, `arr` | name by content: `invoices`, `nextCursor`, `parsed` |
| `handle`, `doStuff`, `process`, `manage` | name by effect: `submitInvoice`, `recomputeTotals` |
| Misleading name (`getUser` that also writes) | rename to the truth, or split the write out |
| Abbreviations (`usr`, `inv`, `qty` in public API) | spell it out at exported surfaces |
| Negated booleans (`isNotReady`) | use the positive (`isReady`) and invert at use |

## Dead-code smells

- Commented-out old implementations → delete; git history is the archive.
- Unused exports / imports / variables → remove (tsc/eslint may catch some; the diff context
  shows intent the linter misses).
- Unreachable branches (a condition that can't be true given upstream guards) → remove and note.
- `TODO`/`FIXME` left by the diff → either resolve, file an issue, or call it out in the review.

## Comment smells

- A comment that restates the code (`// increment i`) → delete.
- A comment that should be a name (`// the next page cursor` over `tmp`) → rename, drop comment.
- Missing the WHY on a non-obvious choice (e.g. why a query is structured to avoid N+1, why a
  value is rounded a certain way) → add the rationale; that is the comment worth keeping.
