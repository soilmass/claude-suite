---
name: tailwind-v4-component-style
description: >
  Style a single component with Tailwind v4 utilities that resolve only to @theme tokens —
  colors, spacing, radius, type, and motion — and build responsive and stateful variants
  (hover/focus/disabled/dark, sm:/md:/lg:) without ever hardcoding a hex, an arbitrary px,
  or a magic number. Enforces Rule 3 at the className level and keeps the four-state render
  (Rule 4) visually distinct. Use when: "style this component", "tailwind classes", "apply
  the theme", "responsive variants". Do NOT use for: generating the token system itself (use
  design-tokens), composing interactive primitives (use shadcn-compose).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the "hardcoded style value" failure class: raw hex,
    arbitrary-value brackets, and magic px/spacing that bypass the @theme token layer.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# tailwind-v4-component-style

Turns "style this component" into Tailwind v4 utility classes that map exclusively to the
project's `@theme` tokens, with responsive and state variants expressed through Tailwind's
own modifier syntax rather than ad-hoc values. It is the className-level enforcer of Rule 3:
the moment a hex code, a `[14px]` arbitrary value, or a `mt-[7px]` magic number appears, the
token chain is broken even though the build still passes.

The spine (Tailwind v4, CSS-first tokens) and the nine rules live in `../../CLAUDE.md`; this
skill obeys them and does not restate them. It consumes the token foundation that
`design-tokens` produces and never invents new values to fill a gap.

---

## Non-Negotiable Rules

The failure ships inside the generated className string, so these are hard:

- **Never write a raw color.** No `#1a1a1a`, no `text-[#fff]`, no `rgb(...)`, no `bg-black/50`
  for a brand surface. Use the semantic token utility (`bg-card`, `text-muted-foreground`,
  `border-border`) that resolves to an `@theme` OKLCH variable (Rule 3).
- **Never use the arbitrary-value bracket to dodge a token.** `p-[13px]`, `text-[15px]`,
  `gap-[7px]`, `rounded-[5px]` are all Rule 3 violations. Snap to the 8pt spacing scale,
  the modular type scale, and the radius/motion tokens.
- **Never inline a `style={{}}` numeric for layout or color.** Static styling is utilities;
  only a genuinely dynamic, runtime-computed value (e.g. a CSS variable set from data) may
  use `style`, and it must reference a token var, not a literal.
- **Never collapse the four states into one look** (Rule 4) — loading, empty, error, and
  success must be visually distinguishable with token utilities, not a single spinner.

Refuse these rationalizations: "the designer gave me this exact hex"; "it's one pixel off, a
bracket is faster"; "we don't have a token for this shade yet"; "the arbitrary value is only
temporary". A missing token is a `design-tokens` task, not a bracket.

---

## When to Use

- Applying visual styling to a component or page: layout, color, type, spacing, radius.
- Adding responsive behavior (`sm:`/`md:`/`lg:`) or state variants
  (`hover:`/`focus-visible:`/`disabled:`/`aria-*:`/`dark:`).
- Replacing hardcoded values flagged by `rule-audit` (Rule 3) with token utilities.
- Styling the four states of a data-bound component so each reads distinctly.

## When NOT to Use

- Generating or extending the `@theme` token system (palette, scale, motion) → `design-tokens`.
- Composing interactive behavior (dialogs, menus, comboboxes, focus traps) → `shadcn-compose`.
- Auditing the whole diff against the nine rules → `rule-audit`.
- Verifying contrast/keyboard/screen-reader conformance of the result → `a11y-gate`.

---

## Procedure

1. **Confirm the token layer exists (low-interrogation).** Read the global stylesheet's
   `@theme` block so you style against real token names. If a needed token is missing, stop and
   route to `design-tokens` — do not bridge the gap with a literal. See `references/token-utility-map.md`.
2. **Map each visual intent to a semantic utility, not a value.** Surface → `bg-card`/`bg-background`;
   text → `text-foreground`/`text-muted-foreground`; edges → `border-border`. Color decisions
   resolve through the semantic layer so dark mode and rebrands flow automatically. See
   `references/token-utility-map.md`.
3. **Snap geometry to the scales.** Spacing/padding/gap to the 8pt scale (`p-2`, `gap-4`),
   type to the modular scale (`text-sm`, `text-lg`), radius/shadow/motion to their tokens
   (`rounded-md`, `duration-150`, `ease-out`). No brackets to "get it exact" — exactness is the
   token's job (Rule 3).
4. **Express variants with modifiers, mobile-first.** Layer responsive (`md:grid-cols-2`) and
   state (`hover:`, `focus-visible:`, `disabled:`, `data-[state=open]:`, `dark:`) prefixes
   rather than branching in JS. Keep focus-visible rings on every interactive element for the
   `a11y-gate`. See `references/responsive-and-variants.md`.
5. **Style the four states distinctly (Rule 4).** Give loading (skeleton with `animate-pulse`
   + `bg-muted`), empty (muted illustration/text + a token-styled CTA), error (`text-destructive`
   / `border-destructive`), and success their own token-based treatment. See
   `references/responsive-and-variants.md`.
6. **Consolidate conditional classes with `cn()`.** Use the project `cn()` (clsx + tailwind-merge)
   for conditional and merge-safe class composition; never string-concatenate classes such that a
   later literal slips in. For multi-variant components prefer `cva` with token utilities only.
7. **Hand to the audit.** Run `rule-audit` over the diff to confirm zero raw hex / arbitrary
   values (Rule 3) and four present states (Rule 4), then `a11y-gate` for contrast and focus.

---

## Composes With

- **Consumes:** `design-tokens` (the `@theme` OKLCH palette, type/spacing/motion tokens this
  skill styles against).
- **Pairs with:** `vertical-slice` (styles the component the slice builds), `shadcn-compose`
  (styles the composed primitive's `className` overrides).
- **Runs against:** `rule-audit` (Rule 3 hardcoded values, Rule 4 states on the diff).
- **Hands off:** `a11y-gate` (contrast ratios, focus-visible, reduced-motion verification).

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> Encoded failure class per the suite's design; replace with a real run-without-the-skill
> transcript before treating this as evaluated.

**Failure class encoded:** Asked to "style this card to match the mockup," the agent emits
`className="bg-[#0f172a] text-[#e2e8f0] p-[18px] rounded-[10px]"` and a `style={{ marginTop:
"7px" }}` — every value a Rule 3 violation that compiles and looks right in light mode but
ignores the token system, so dark mode and a future rebrand silently break. It hardcodes a
`hover:bg-[#1e293b]` instead of a semantic hover token, drops `focus-visible` rings entirely
(failing `a11y-gate`), uses a one-off `text-[15px]` outside the modular scale, and renders only
the populated state — no loading skeleton, empty, or error treatment (violates Rule 4). The
output demos cleanly and passes type-check while quietly severing the component from the theme.

---

## Examples

**Input:** "Style this stat card — dark surface, muted label, big number."
**Output:** `bg-card text-card-foreground rounded-lg p-6 shadow-sm` on the wrapper,
`text-sm text-muted-foreground` on the label, `text-3xl font-semibold tabular-nums` on the
value — all token utilities, no brackets. Adds `hover:bg-accent/50 transition-colors
duration-150` for interactivity and a `focus-visible:ring-2 focus-visible:ring-ring` if it
links somewhere. Loading variant swaps in `h-9 w-24 animate-pulse rounded-md bg-muted`.

**Input:** "Make this list two columns on tablet, three on desktop, with hover and dark mode."
**Output:** `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3` on the container; each card
`bg-card hover:bg-accent dark:bg-card border border-border transition-colors`. No JS breakpoint
branching, no arbitrary widths — mobile-first modifiers only.

**Input:** "The designer gave me exactly #FF5A1F for this button background."
**Output:** Refuses the literal: "Raw hex breaks Rule 3 and the dark-mode/rebrand chain. That
color belongs in the `@theme` palette as a token (e.g. `--color-brand`). I'll route it to
`design-tokens` to add it with a verified-contrast pair, then style with `bg-brand
text-brand-foreground`."

---

## Edge Cases

- **A truly dynamic value (chart bar height, progress width from data)** → set a CSS custom
  property inline (`style={{ "--w": pct }}`) and consume it via a utility/arbitrary-property
  that references the var, not a literal color/size; document why in a comment.
- **The mockup color has no matching token** → stop and hand to `design-tokens` to add it with
  a contrast-verified foreground pair; do not approximate with `bg-[#...]`.
- **One-off spacing genuinely between scale steps** → re-check the design against the 8pt grid;
  if a new step is truly warranted, add it to the spacing tokens, do not bracket it inline.
- **Styling a shadcn primitive's internals** → pass token utilities through `className` with
  `cn()`; if the override fights the primitive, that is `shadcn-compose`'s composition concern.

---

## References

- `references/token-utility-map.md` — semantic utility → `@theme` token mapping (color, type,
  spacing, radius, motion) and the hardcoded anti-pattern each replaces.
- `references/responsive-and-variants.md` — mobile-first responsive recipes, state-variant
  modifiers, `cn()`/`cva` composition, and token-based four-state styling.

## Scripts

- Reserved. A script would be justified if a regex/AST check could reliably flag raw hex and
  arbitrary-value brackets in `className` strings independent of `rule-audit`'s Rule 3 pass;
  until then `rule-audit` covers the diff. `scripts/.gitkeep` holds the slot.
