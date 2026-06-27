Purpose: map every styling intent to a Tailwind v4 utility that resolves to an `@theme` token, and name the hardcoded anti-pattern it replaces (Rule 3).

# How Tailwind v4 tokens flow

In Tailwind v4 the token system IS the CSS. Tokens are declared in the global stylesheet with
`@theme`, and Tailwind generates the matching utilities at build time. There is no
`tailwind.config.js` token source and no JS token object (per `../../CLAUDE.md`).

```css
/* src/styles/globals.css */
@import "tailwindcss";

@theme {
  /* palette — OKLCH, contrast-verified by design-tokens */
  --color-background: oklch(1 0 0);
  --color-foreground: oklch(0.15 0 0);
  --color-card: oklch(0.99 0 0);
  --color-card-foreground: oklch(0.15 0 0);
  --color-muted: oklch(0.96 0 0);
  --color-muted-foreground: oklch(0.45 0 0);
  --color-primary: oklch(0.55 0.2 264);
  --color-primary-foreground: oklch(0.98 0 0);
  --color-accent: oklch(0.96 0.02 264);
  --color-destructive: oklch(0.58 0.22 27);
  --color-border: oklch(0.9 0 0);
  --color-ring: oklch(0.55 0.2 264);

  /* modular type scale */
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-3xl: 1.875rem;

  /* 8pt spacing — Tailwind's --spacing base; p-2 = 0.5rem = 8px */
  --spacing: 0.25rem;

  /* radius + motion */
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
}
```

Declaring `--color-card` automatically yields `bg-card`, `text-card`, `border-card`, etc.
Declaring `--text-lg` yields `text-lg`. You never write the value again — you write the utility.

# Intent → utility map

| Intent | Use (token utility) | Never (Rule 3 violation) |
| --- | --- | --- |
| Page surface | `bg-background text-foreground` | `bg-[#fff]`, `bg-white` for brand surfaces |
| Card / panel | `bg-card text-card-foreground` | `bg-[#0f172a]` |
| Secondary text | `text-muted-foreground` | `text-[#64748b]`, `text-gray-500` |
| Primary action | `bg-primary text-primary-foreground` | `bg-[#3b82f6]` |
| Hover surface | `hover:bg-accent` | `hover:bg-[#1e293b]` |
| Error text/border | `text-destructive`, `border-destructive` | `text-[#ef4444]` |
| Hairline / divider | `border border-border` | `border-[#e5e7eb]` |
| Focus ring | `focus-visible:ring-2 focus-visible:ring-ring` | no ring, or `ring-[#...]` |
| Body / label / heading | `text-base` / `text-sm` / `text-3xl` | `text-[15px]`, `text-[1.1rem]` |
| Padding / gap / margin | `p-4`, `gap-2`, `mt-6` (8pt steps) | `p-[18px]`, `gap-[7px]`, `mt-[7px]` |
| Corner radius | `rounded-md`, `rounded-lg` | `rounded-[10px]` |
| Transition | `transition-colors duration-150 ease-out` | `duration-[133ms]` |

# Semantic over literal

Prefer the *semantic* token (`bg-card`, `text-muted-foreground`) over a raw palette step
(`bg-neutral-50`). Semantic tokens carry the light/dark and rebrand mapping; a raw step is a
constant that breaks under theming. Brand colors with foreground pairs are added by
`design-tokens`, never inlined here.

# Dark mode

With CSS-first tokens, dark mode is a second variable block, not per-utility overrides:

```css
.dark {
  --color-background: oklch(0.15 0 0);
  --color-foreground: oklch(0.98 0 0);
  --color-card: oklch(0.2 0 0);
  /* ... */
}
```

Because components reference `bg-card` (the variable), they flip automatically. Only add
explicit `dark:` modifiers for genuine per-component divergence from the token mapping.

# The "no token for this" decision

If a required color/size has no token, that is a gap in the token system, not a license to
bracket. Stop, route to `design-tokens` (it adds the token with WCAG 2.2 AA contrast verified),
record any non-obvious palette choice in `DECISIONS.md`, then return and style with the new
utility. A bracket here is a Rule 3 violation that `rule-audit` will flag.
