Purpose: mobile-first responsive recipes, state-variant modifiers, `cn()`/`cva` composition, and token-based styling for all four component states (Rule 4) — all without hardcoded values.

# Mobile-first responsive

Tailwind breakpoints are min-width and additive. Write the base (smallest) styles unprefixed,
then layer `sm:`/`md:`/`lg:`/`xl:` upward. Never branch layout in JS by reading window width.

```tsx
<ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
```

```tsx
// stack on mobile, row from md up
<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
```

Breakpoints themselves are tokens (`--breakpoint-md` in `@theme`); use the named prefixes, do
not write `max-[767px]:` arbitrary queries unless a documented exception requires it.

# State variants

Express interaction state with modifiers, not state in JS, so styling stays declarative and the
token mapping holds:

```tsx
<button
  className={cn(
    "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
    "transition-colors duration-150 ease-out",
    "hover:bg-primary/90",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
  )}
>
```

- `focus-visible:ring-*` on every interactive element — required for `a11y-gate`.
- `data-[state=open]:` / `aria-[expanded=true]:` for Radix/shadcn primitive states.
- `motion-reduce:transition-none` to honor `prefers-reduced-motion`.
- Opacity-modified tokens (`bg-primary/90`) are allowed — they derive from the token, not a hex.

# cn() and cva

Use the project `cn()` (clsx + tailwind-merge) for conditional/merge-safe classes — never raw
template strings that could let a literal slip in:

```tsx
import { cn } from "@/lib/utils";

<div className={cn("rounded-lg border border-border p-4", isActive && "bg-accent")} />
```

For multi-variant components, `cva` — with token utilities only, no brackets:

```tsx
import { cva, type VariantProps } from "class-variance-authority";

const badge = cva("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", {
  variants: {
    tone: {
      neutral: "bg-muted text-muted-foreground",
      success: "bg-primary/10 text-primary",
      danger: "bg-destructive/10 text-destructive",
    },
  },
  defaultVariants: { tone: "neutral" },
});
```

# The four states, styled distinctly (Rule 4)

A data-bound component must render loading, empty, error, and success — each visually distinct
via tokens, never a lone spinner standing in for all of them.

```tsx
function ProjectList() {
  const q = api.project.list.useQuery();

  // loading — skeleton from muted token, animate-pulse motion token
  if (q.isPending) {
    return (
      <ul className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="h-12 animate-pulse rounded-md bg-muted" />
        ))}
      </ul>
    );
  }

  // error — destructive token, not a generic gray box
  if (q.isError) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Couldn’t load projects. <button className="font-medium underline" onClick={() => q.refetch()}>Retry</button>
      </div>
    );
  }

  // empty — muted, with a token-styled CTA
  if (q.data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No projects yet.
      </div>
    );
  }

  // success
  return (
    <ul className="space-y-2">
      {q.data.map((p) => (
        <li key={p.id} className="rounded-md border border-border bg-card p-4">{p.name}</li>
      ))}
    </ul>
  );
}
```

Each branch uses a different token treatment so the state is legible at a glance:
`bg-muted`+`animate-pulse` (loading), `border-destructive`/`text-destructive` (error),
`border-dashed`+`text-muted-foreground` (empty), `bg-card` (success). `rule-audit` checks all
four are present; `a11y-gate` checks each meets contrast.
