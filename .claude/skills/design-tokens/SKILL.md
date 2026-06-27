---
name: design-tokens
description: >
  Generate the design-token foundation as Tailwind v4 @theme CSS variables: an OKLCH
  palette, a modular type scale, an 8pt spacing system, and motion tokens — with WCAG 2.2
  AA contrast verified before anything ships. Tokens are CSS-first, never a JS object or
  tailwind.config source.
  Use when: "set up the design tokens", "generate the palette", "theme the app", "emit the
  @theme tokens", "spacing tokens".
  Do NOT use for: designing individual components (that's CLAUDE.md + vertical-slice),
  or writing component-level styles for one feature (vertical-slice consumes these tokens).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Tailwind v4 @theme CSS-first per CLAUDE.md. Bundles a contrast
    checker script so no palette ships unverified. Baseline observed (clean-room capture).
---

# design-tokens

The **orchestrating entry point** for the design foundation, and the **serializer** that
emits it. The harder design decisions live in three focused craft skills — `color-system`
(the color theory), `layout-composition` (grid and spacing), and `motion-system` (the motion
language); **the type system this skill decides itself** (scale, measure, rhythm, font loading).
It interrogates the load-bearing inputs, delegates the three dimensions above, writes the result
as Tailwind v4 `@theme` CSS variables, and **will not ship a palette it hasn't contrast-checked.**

High-interrogation, because the inputs are subjective and load-bearing: brand hue, mood,
existing brand colors, light/dark intent. Guessing these produces a confident wrong palette.

The token format and the AA-contrast requirement are defined in `../../../CLAUDE.md`; the
nine rules' Rule 3 (no hardcoded style values) is what these tokens exist to satisfy.

---

## Non-Negotiable Rules
- **Never ship a palette without verifying contrast to WCAG 2.2 AA.** Run the contrast
  check (script below) on every foreground/background pair before output. A palette that
  hasn't been checked is not done.
- **Tokens are CSS-first `@theme`, never JS.** No token objects in `tailwind.config`, no
  TS color maps — the model later misreads JS-config tokens and emits hardcoded values.
- **OKLCH, not hex/HSL,** for the palette source values, so lightness is perceptually
  even across the ramp.

Refuse: "ship the palette, we'll check contrast later"; "put the tokens in a TS file for
type-safety"; "hex is fine."

---

## When to Use
- A project needs its color/type/spacing/motion foundation.
- An existing theme needs systematizing or a contrast fix.

## When NOT to Use
- Styling one component → that's `vertical-slice` consuming these tokens.
- Component design decisions → `CLAUDE.md` + `vertical-slice`.

---

## Procedure

1. **Interrogate the subjective load-bearing inputs (high-interrogation), as one batch:**
   - **Brand hue(s)** — the anchor color, or existing brand colors to honor.
   - **Mood / harmony** — calm/energetic, the harmony family (analogous, complementary,
     triadic). If the user is unsure, propose one rather than stalling.
   - **Light / dark intent** — light-first, dark-first, or both.
   - **Product character** — dense/data vs editorial/marketing (drives the type ratio and
     layout density that the craft skills below decide).
   These can't be guessed; everything downstream the craft skills derive.

2. **Delegate the color system to `color-system`.** It constructs the OKLCH ramps with a
   harmony-derived accent, a chroma-by-lightness curve, the semantic role taxonomy
   (primary/accent/success/warning/danger/info + foregrounds), a *derived* dark mode, and
   runs `cvd-check.mjs` for colorblind/viz distinguishability. It returns OKLCH values + role
   names. (Distinguishability is `color-system`'s job; **readability** is the contrast gate in
   step 6, which this skill owns.)

3. **Decide the type system (this skill owns it).** Pick a modular scale ratio (≈1.2 for dense
   UI, ≈1.25–1.333 for editorial) off a `1rem` base for the `--text-*` steps, with line-heights
   that tighten as size grows. Apply the **reading-craft defaults unconditionally** — even when
   the prompt doesn't signal long-form: **bound the measure** (≈45–75ch) so body text never runs
   full-bleed, prefer **`clamp()` fluid type** over breakpoint jumps, and load fonts with
   `next/font` (self-host, `display: swap`, metric-matched fallback, ≤ 2 families) so a swap
   never shifts layout. (A capable base model does this when asked for a "reading site" but skips
   it on a generic UI — applying it always is the residual value folded in here.)

4. **Delegate spacing + grid to `layout-composition`.** It returns the spacing scale (8pt
   system) with its rationale, the grid/container model, and breakpoints — the values for the
   `--spacing-*` and `--breakpoint-*` vars.

5. **Delegate motion to `motion-system`.** It returns the duration scale and easing curves
   (with their semantics) and the reduced-motion stance — the values for `--duration-*` and
   `--ease-*`.

6. **Verify contrast BEFORE output (this skill's gate).** Run `scripts/contrast.mjs` on every
   foreground/background pairing that will co-occur (text-on-surface, text-on-primary,
   muted-on-background, focus ring visibility), in **both** light and dark. Adjust any pair
   under AA (4.5:1 body, 3:1 large/UI). Never emit an unverified palette.

7. **Emit as Tailwind v4 `@theme`.** Write the palette, type scale, spacing system, and motion
   tokens as CSS variables in the global stylesheet. See `references/theme-tokens.md`.

8. **Completeness + self-report.** Confirm: every scale is a full ramp; contrast passed (light
   and dark) and you can state the ratios; `cvd-check` ran on the status/viz set; tokens are
   `@theme` CSS not JS; spacing is 8pt-based; type is ratio-based; motion tokens present. Report
   any pair you had to nudge.

---

## Composes With
- **Delegates to:** `color-system` (color theory + CVD), `layout-composition` (grid + spacing),
  `motion-system` (motion language) — they make those design decisions; this skill orchestrates
  and serializes them, and owns the type system directly.
- **Consumed by:** every UI-producing skill (`vertical-slice`); these tokens are the
  vocabulary.
- **Checked by:** `rule-audit` rule 3 — hardcoded-style violations are defined as "not
  one of these tokens." **Gated by** `design-gate` (system adherence) and `a11y-gate` (the
  WCAG contrast floor) at done-time.
- **Called by:** `t3-genesis` (initial token foundation).

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project conventions). The encoded failure class was confirmed.

**Observed run.** The agent produced a clean-looking Tailwind v4 `@theme` block — but every color was hardcoded sRGB hex, no foreground/background pair was contrast-checked, and the type and spacing scales were flat px lists rather than a ratio-based scale on an 8pt grid. No dark-mode layer and no motion tokens were emitted at all.

```css
@theme {
  --color-primary-600: #2563eb;   /* hex, not OKLCH */
  --color-muted: #6b7280;         /* never contrast-checked against background */
  --spacing-xs: 4px;              /* raw px, breaks the 8pt rem grid */
  --text-2xl: 24px;              /* flat px list, no modular ratio */
}
```

**Failure class (confirmed).** The agent ships a palette that looks done but violates the foundation: hex instead of OKLCH, zero WCAG 2.2 AA contrast verification (CLAUDE.md rule 3 / design-tokens spec), and px-based flat scales instead of an 8pt, ratio-driven, rem system — with no dark-mode or motion tokens. This skill forces OKLCH ramps, a pre-output contrast gate, and the full `@theme` token set so the palette is verified before it ships.

---

## Examples
**Input:** "Theme the app — our brand blue is #2563eb, clean and trustworthy, light and
dark."
**Output:** Confirms hue/mood/both-modes → converts the brand blue to OKLCH, builds full
ramps for both modes → runs contrast.mjs, finds primary-foreground on primary at 3.9:1,
nudges lightness to reach 4.6:1 → emits `@theme` tokens → reports the one adjusted pair
and suggests the dark-mode surface value isn't a naive invert.

---

## Edge Cases
- **User gives no brand color** → propose 2–3 starting hues with moods; don't invent
  silently.
- **A required brand color simply can't meet AA as body text** → say so; suggest using it
  for large text/UI only and pairing a passing variant for body.
- **User wants tokens "in TypeScript for autocomplete"** → explain why CSS-first `@theme`
  is the decided call (the model misreads JS tokens and emits hardcoded values); offer a
  generated TS type *derived from* the CSS vars if they want editor hints, not as the
  source.

---

## References
- `references/theme-tokens.md` — the exact `@theme` block shape: OKLCH palette vars, type
  scale, 8pt spacing, motion tokens, and the light/dark pattern.

## Scripts
- `scripts/contrast.mjs` — WCAG 2.2 contrast-ratio checker for OKLCH/hex pairs; gates
  output. Run on every co-occurring fg/bg pair before shipping a palette.
- `scripts/README.md` — usage.
