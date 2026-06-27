Purpose: the four-way classification that decides where a piece of client state lives, with the questions to ask and worked examples. This is the load-bearing decision the skill exists to get right.

# The decision tree

Ask these in order. The first that matches wins; do not fall through to a global store by default.

```
Is the value sourced from / persisted to the server (a row, a list, a derived server value)?
  └─ YES → it is SERVER STATE, not client state.
            Read it from the server cache (RSC fetch or TanStack Query).
            Owned by data-fetching-cache (cache/invalidate) and optimistic-updates (mutations).
            The client may hold an *id/reference* to it — never a *copy* of it.
  └─ NO  → it is genuinely client state. Continue.

Should the value be shareable, bookmarkable, or survive a reload / back-forward?
  (filters, sort, active tab, page number, search query, opened detail id)
  └─ YES → URL SEARCH PARAMS. Typed parsers (nuqs-class). See url-state.md.

Is the value used by only one component or a small local subtree, and ephemeral?
  (an input's draft text, a hover/focus flag, a single dropdown's open state)
  └─ YES → useState / useReducer. Lift to Context only when a few nearby
            components genuinely share it. Do not globalize.

Otherwise: is it client-only state read/written across unrelated parts of the tree?
  (theme, sidebar collapsed, command-palette open, a multi-step wizard's draft,
   a cart's UI selection before checkout)
  └─ YES → a typed ZUSTAND store. Types inferred from schema/Zod (Rule 1). See zustand-store.md.
```

# Why the order matters

The default failure is reaching for a global store first and pouring everything into it —
including server data. That creates **two sources of truth** for the same rows: the server
cache and the store, which drift the moment one updates without the other. The tree forces
the server-state question first precisely to stop that.

The second-most-common miss is using `useState` for state that should be in the URL. A filter
in `useState` evaporates on reload, can't be shared as a link, and breaks the browser Back
button. If a colleague should be able to paste the URL and see the same view, it is URL state.

# Worked examples

| Piece of state | Classification | Where |
| --- | --- | --- |
| The products list itself | Server state | TanStack Query / RSC — `data-fetching-cache` |
| Filter = "category: tools", sort = "price desc" | Shareable UI | URL search params (typed) |
| Active tab on a settings page | Shareable UI | URL search param (`?tab=billing`) |
| Pagination page / cursor | Shareable UI | URL search param |
| "Is this row's actions menu open?" | Ephemeral local | `useState` in the row |
| Draft text in a not-yet-submitted comment box | Ephemeral local | `useState` (persist only if it must survive route changes) |
| Theme (light/dark), sidebar collapsed | Cross-tree client | Zustand (often `persist`ed) |
| 3-step "create product" wizard draft | Cross-tree client | Zustand, shape from the step Zod schemas |
| The selected product's **id** in a master/detail | Shareable UI (the id) | URL param; the product *data* stays in Query |

# The line, restated

- **Server cache** holds server data. One source of truth. `data-fetching-cache` owns it.
- **URL** holds shareable view state. The router owns it; it is free persistence + sharing.
- **Local state** holds ephemeral, subtree-scoped UI.
- **Zustand** holds the rest: cross-tree, client-only, non-shareable state — typed from the schema.

Money in any client state is still integer minor units (Rule 5); timestamps are still UTC
(Rule 6). Moving a value into a store or the URL does not exempt it from the nine rules.
