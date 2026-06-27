Purpose: how to build a typed client-only store (Zustand) for cross-tree state — value types inferred from the schema/Zod (Rule 1), selectors to avoid over-render, persist where appropriate, and the multi-step wizard pattern — without duplicating server data.

# What a store is for

A Zustand store holds **client-only state read or written across unrelated parts of the tree**:
theme, sidebar-collapsed, a command palette, a multi-step wizard's draft, a pre-checkout cart
selection. It is the last branch of the decision tree — reached only after server state, URL
state, and local state have been ruled out (`decision-tree.md`).

It is **not** a place to cache server data. The server cache (TanStack Query / RSC) is the one
source of truth for rows and lists; a copy in the store is a second truth that drifts.

# Typed store, rooted in the schema (Rule 1)

The store's value types come from Drizzle inference or the shared Zod schema — never a
hand-written shape and never `any`.

```ts
import { create } from "zustand";
import type { Product } from "~/db/schema/products"; // = typeof products.$inferSelect

interface ProductUiState {
  // Hold an *id*, not a copy of the row. The row lives in the Query cache.
  selectedProductId: Product["id"] | null;
  sidebarOpen: boolean;
  select: (id: Product["id"] | null) => void;
  toggleSidebar: () => void;
}

export const useProductUi = create<ProductUiState>((set) => ({
  selectedProductId: null,
  sidebarOpen: true,
  select: (id) => set({ selectedProductId: id }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
```

# Select narrowly to avoid over-render

Subscribe to the slice you use, not the whole store, or every consumer re-renders on every
change.

```ts
const sidebarOpen = useProductUi((s) => s.sidebarOpen);     // re-renders only on sidebar change
const select = useProductUi((s) => s.select);               // actions are stable
```

# The multi-step wizard pattern (shape from the step Zod schemas)

A wizard's draft is the canonical cross-tree client state: several step components write into
one shape that must survive navigation between steps until the final submit. Derive the draft
type from the **same Zod schemas** that validate each step and the final tRPC input — one
schema, no drift (per the source-of-truth `CLAUDE.md`).

```ts
import { z } from "zod";
import { createProductSchema } from "~/server/api/schemas/product"; // shared with the tRPC input

// Each step validates a slice of the final schema — no second copy of the shape.
export const step1Schema = createProductSchema.pick({ name: true, category: true });
export const step2Schema = createProductSchema.pick({ priceMinor: true, currency: true });

type WizardDraft = Partial<z.infer<typeof createProductSchema>>;

interface WizardState {
  step: 1 | 2 | 3;
  draft: WizardDraft;        // money stays integer minor units (Rule 5)
  setStep: (s: 1 | 2 | 3) => void;
  patch: (values: Partial<WizardDraft>) => void;
  reset: () => void;
}

export const useCreateProductWizard = create<WizardState>((set) => ({
  step: 1,
  draft: {},
  setStep: (step) => set({ step }),
  patch: (values) => set((s) => ({ draft: { ...s.draft, ...values } })),
  reset: () => set({ step: 1, draft: {} }),
}));
```

At submit, parse the assembled draft with `createProductSchema` (Rule 8) and pass it to the
tRPC mutation; the procedure still enforces auth AND ownership (Rule 2). Each step's form is a
React Hook Form bound to that step's schema — `rhf-advanced` owns the form mechanics; this
store only holds the draft *between* steps.

# Persisting a store

Use the `persist` middleware only for state that should survive a reload but is **not
shareable** (theme, sidebar, an in-progress draft) — shareable state belongs in the URL
(`url-state.md`).

```ts
import { persist } from "zustand/middleware";
export const useTheme = create<ThemeState>()(
  persist((set) => ({ theme: "system", setTheme: (t) => set({ theme: t }) }),
          { name: "theme" }),
);
```

Never persist a secret or token to `localStorage` (Rule 9) — it is readable client-side. Never
persist server data "to save a fetch"; that re-creates the drift problem across reloads.

# Context vs Zustand

A React Context is fine for a small, stable, subtree-scoped value (a theme provider, a
form-section config). Reach for Zustand when the state is **frequently updated** (Context
re-renders all consumers on every change) or **read across unrelated branches** of the tree.
Don't stand up a global store for state one subtree owns — that's the local-state branch.
