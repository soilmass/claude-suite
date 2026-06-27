---
name: client-state
description: >
  Place client-only state correctly on the Next.js App Router stack by drawing the
  server-state-vs-client-state line first, then routing each piece: server-sourced data stays
  in the TanStack Query / RSC cache (never copied into a store), shareable view state (filters,
  sort, tab, page, search) lives in the URL as typed search params, ephemeral subtree state is
  useState/Context, and genuinely cross-tree client state goes in a typed Zustand store whose
  value types are inferred from the Drizzle/Zod schema so Rule 1 (unbroken type chain) holds.
  Use when: "manage client state", "where should this state live", "filter and sort UI state",
  "url state / search params", "zustand store", "multi-step wizard state".
  Do NOT use for: server/cached data, fetching, or invalidation (use data-fetching-cache);
  optimistic cache writes on mutations (use optimistic-updates); form field state and
  validation (use rhf-advanced).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the client-state failure class: server data duplicated into a
    Zustand store (two sources of truth that drift), shareable filter/sort state trapped in
    useState instead of the URL, and an untyped/`any` store off the schema-rooted type chain.
    Baseline observed (clean-room capture).
---

# client-state

The placement skill for client-only state: it draws the server-state-vs-client-state line, then
decides where each remaining piece lives — the URL, local state, or a typed store. The failure it
guards against is the schema-rooted type chain quietly severing as state spreads out: hand-typed
unions and store shapes that drift from the schema, server data mirrored into a store, shareable
state trapped in `useState`. The spine and nine rules live in `../../CLAUDE.md`; this skill obeys
them — chiefly Rule 1. Server-cache concerns belong to `data-fetching-cache` / `optimistic-updates`.

---

## Non-Negotiable Rules

- **Never copy server data into a client store.** The server cache (TanStack Query / RSC) is the
  one source of truth for rows; mirroring them into Zustand creates two truths that drift. A store
  holds an *id*, never a *copy* — `data-fetching-cache` owns the data.
- **Never type a store or URL parser with `any` or a hand-written shape.** Store and search-param
  value types trace from Drizzle `$inferSelect` / the shared Zod schema, unbroken (Rule 1); a
  wizard draft is derived from the step schemas, not retyped.
- **Never trap shareable state in `useState`.** Filters, sort, active tab, page/cursor, and the
  search query are linkable view state — they belong in the URL so they survive reload, sharing,
  and Back/Forward. `useState` for these throws all three away.
- **Never globalize state one subtree owns.** Ephemeral, local UI is `useState`/Context; a store is
  for genuinely cross-tree, client-only state. Defaulting everything to global makes every change a
  tree-wide re-render and hides the server/client line.

Refuse these rationalizations: "I'll keep a copy of the list in Zustand so components can read it";
"useState is fine for the filters, the URL is fussy"; "type the store `any`, it's just UI"; "one
global store is simpler than deciding."

---

## When to Use

- Deciding where a new piece of client state should live (running the decision tree).
- Filter / sort / tab / pagination / search state that should be shareable and bookmarkable.
- A multi-step wizard, command palette, theme, sidebar, or other cross-tree client-only state.
- Auditing a component that copies server data into a store, or holds shareable state in `useState`.

## When NOT to Use

- Server/cached data — fetching, caching, revalidation, staleness → `data-fetching-cache`.
- Optimistic cache writes and mutation reconciliation → `optimistic-updates`.
- Form field state, resolvers, field arrays, server-error mapping → `rhf-advanced`.
- The Server-vs-Client Component boundary and routing structure itself → `nextjs-app-router`.
- Verifying the resulting type chain's depth and inference breaks → `type-chain-audit`.

---

## Procedure

1. **Classify the state before choosing a tool (high — this is the whole skill).** Run the
   decision tree: server-sourced → not client state; shareable/linkable → URL; ephemeral and
   subtree-scoped → local; cross-tree client-only → store. The first match wins; do not fall
   through to a global store by default. See `references/decision-tree.md`.
2. **For server-sourced data: stop — do not store it (high — Rule 1 + two-truths).** Read it from
   the server cache (RSC or TanStack Query); the client may hold an *id*, never a *copy*. Caching,
   invalidation, and mutations are owned by `data-fetching-cache` / `optimistic-updates` — hand off.
3. **For shareable UI state: put it in the URL with typed parsers (medium — Rule 8).** Use a typed
   search-params layer (nuqs-class): each param has a parser, an explicit default, and an inferred
   type, with the option set rooted in the schema/enum, not a hand-typed union. The same typed
   params drive the Server Component's query. See `references/url-state.md`.
4. **For ephemeral subtree state: useState/useReducer; lift to Context only when shared (low).**
   Keep it where it is used; promote to Context only when a few nearby components genuinely share
   it. Do not stand up a global store for state one subtree owns.
5. **For cross-tree client state: a typed Zustand store, types from the schema (high — Rule 1).**
   Value types come from Drizzle inference / the shared Zod schema; select narrow slices to avoid
   tree-wide re-renders; `persist` only non-shareable state (never secrets, Rule 9; never server
   data). A wizard draft's shape derives from the step Zod schemas. See `references/zustand-store.md`.
6. **Self-check and record forks (medium — Rule 1).** Any server field copied into the store? any
   shareable state stuck in `useState`? any `any` or hand-typed shape? (Money in the store stays
   minor units, timestamps UTC — no rules pass.) Hand the result to `type-chain-audit`; record
   non-obvious choices (a `persist`ed draft, a grouped URL param) in `DECISIONS.md`.

---

## Composes With

- **Defers to:** `data-fetching-cache` — server/cached data is NOT client state; this skill draws
  the line and hands the reads/invalidation across. `optimistic-updates` owns mutation writes.
- **Pairs with:** `nextjs-app-router` — the Server/Client boundary and the route whose
  `searchParams` hold URL state; `rhf-advanced` — the per-step forms whose draft the store carries.
- **Consumes:** `zod-schema-library` / the Drizzle schema — store and URL-parser value types root
  here, unbroken (Rule 1).
- **Hands off:** typed-store / parser verification → `type-chain-audit`; finished slice → `rule-audit`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a fresh general-purpose agent, no project
> conventions): "manage filter/sort UI state and a 3-step create-product wizard's state in our
> Next.js app." The imagined catastrophe — list copied into Zustand, filters in `useState`, one
> global dump — did **not** occur; a capable base model routes state well. A **narrower** failure class was confirmed.

**Observed run.** Placement was mostly right: filter+sort went into the URL via `nuqs` (shareable,
reload-safe), the list stayed in TanStack Query and was filtered server-side (no copy into a store),
Zustand held only the wizard draft, all four states rendered. But the load-bearing discipline —
**Rule 1, types rooted in the schema** — was punted, explicitly:

```ts
// types.ts — hand-authored unions ("would mostly be inferred from the Drizzle schema / tRPC
// router output ... but exporting the literal unions keeps the filter and query in sync" — agent):
export const CATEGORIES = ["electronics", "apparel", "home", "toys", "books"] as const;
// wizard-store.ts — draft shape hand-written, not derived from the Zod schema:
export interface WizardData { name: string; category: Category | null; priceInput: string; }
return Math.round(parseFloat(trimmed) * 100); // dollars→cents via parseFloat + float multiply
```

The category/sort unions and the `WizardData` draft are maintained **by hand** rather than inferred
from the Drizzle column/pgEnum and the shared `createProductSchema` — Rule 1 severed at the root,
and the agent *named* the right thing and skipped it. The draft becomes a third parallel definition
(`WizardData` vs `createProductSchema` vs `stepTwoSchema`) free to drift from the tRPC input; money
converts via a float (`parseFloat(...) * 100`), not string math (Rule 5).

**Failure class (confirmed, narrowed).** Not "pours everything into a global store" — "places state
correctly, then severs the schema-rooted type chain and maintains the shapes by hand." This skill
adds the missing rigor: URL-parser option sets and store value types inferred from the schema, one
schema for the wizard draft, and the nine rules holding *inside* client state — handed to
`type-chain-audit`.

---

## Examples

**Input:** "Add category filter + name/price/date sort to the products list."
**Output:** Filter and sort go in the URL as typed search params (nuqs-class parsers, explicit
defaults, sort keys rooted in the schema). The Server Component reads those same typed params into
the tRPC/Drizzle query (`data-fetching-cache` owns the fetch). Shareable and reload-safe.

**Input:** "Build a 3-step create-product wizard that keeps data across steps."
**Output:** A typed Zustand store holds the draft as `Partial<z.infer<typeof createProductSchema>>`
— the same schema as the tRPC input — so step slices (`.pick(...)`) can't drift. Each step is an RHF
form (`rhf-advanced`) writing into the store; submit parses the assembled draft (Rule 8) and calls
the mutation, which checks ownership (Rule 2).

**Input:** "Let me keep the loaded products in Zustand so any component can read them."
**Output:** Refuse — that duplicates server state. Keep the list in TanStack Query (one source of
truth) and store only the *selected product id* (or the URL if it should be linkable); other
components read the list from the Query cache, not a mirror.

---

## Edge Cases

- **State must survive reload but isn't shareable** (a long draft, theme) → a `persist`ed Zustand
  store (localStorage), not the URL; never persist a secret (Rule 9).
- **A Client Component needs server data *and* client UI state** → read the server data via Query
  or props and keep only the UI state in the store; never merge the row in to "have it all in one place."
- **The URL accumulates a dozen params** → keep only the genuinely shareable ones in the URL and
  push ephemeral bits to local state; group params into one only when they always change together.
- **The wizard collects money or dates** → minor units (Rule 5) / UTC (Rule 6) apply in the store as
  in the DB, converted only at the display edge; the store is no rules-free zone.

---

## References

- `references/decision-tree.md` — the four-way classification (server / URL / local / store), the
  questions in order, and a worked table of common state pieces.
- `references/url-state.md` — typed search-param state (nuqs-class parsers, defaults, schema-rooted
  option sets), reading the same params server-side, and shareability/Rule 8.
- `references/zustand-store.md` — a typed store rooted in `$inferSelect`/Zod, narrow selectors,
  `persist`, the wizard draft from step schemas, and Context-vs-Zustand.

## Scripts

`scripts/` is reserved (`.gitkeep`). A check would earn its place if it could flag a store whose
state type holds a full server-row shape by *value copy* (not an id), or a `useState` holding a
filter/sort/page-named param — both heuristic, not yet reliable. Until then `type-chain-audit` covers
Rule 1 and `rule-audit` the rest.
