---
name: design-tokens
description: >
  Generate the design-token foundation as Tailwind v4 @theme CSS variables: an OKLCH
  palette, a modular type scale, an 8pt spacing system, and motion tokens — with WCAG 2.2
  AA contrast verified before anything ships. Tokens are CSS-first, never a JS object or
  tailwind.config source.
  Use when: "set up the design tokens", "generate the palette", "theme the app", "color
  system", "set up the type scale", "spacing system".
  Do NOT use for: designing individual components (that's CLAUDE.md + vertical-slice),
  or writing component-level styles for one feature (vertical-slice consumes these tokens).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Tailwind v4 @theme CSS-first per CLAUDE.md. Bundles a contrast
    checker script so no palette ships unverified. Baseline section is the encoded failure
    class; replace with an observed transcript.
---

# design-tokens

High-interrogation, because the inputs are subjective and load-bearing: brand hue, mood,
existing brand colors, light/dark intent. Guessing these produces a confident wrong
palette. This skill asks them up front, then generates an OKLCH/`@theme` token set and
**will not ship a palette it hasn't contrast-checked.**

The token format and the AA-contrast requirement are defined in `../../CLAUDE.md`.

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
   These can't be guessed; everything else (the ramp math, spacing, scale ratio) you
   derive.

2. **Generate OKLCH ramps.** Build full ramps (not a few spot colors) for each role
   (background, surface, foreground, primary, accent, destructive, muted, border) with
   perceptually-even lightness steps. Light and dark sets if requested.

3. **Verify contrast BEFORE output.** Run `scripts/contrast.mjs` on every
   foreground/background pairing that will co-occur (text-on-surface, text-on-primary,
   muted-on-background, focus ring visibility). Adjust any pair under AA (4.5:1 body,
   3:1 large/UI). Never emit an unverified palette.

4. **Emit as Tailwind v4 `@theme`.** Write the palette, the modular type scale (a named
   ratio — e.g. 1.25), the 8pt spacing system, and motion tokens (durations, easings) as
   CSS variables in the global stylesheet. See `references/theme-tokens.md`.

5. **Completeness + self-report.** Confirm: every scale is a full ramp; contrast passed
   and you can state the ratios; tokens are `@theme` CSS not JS; spacing is 8pt-based;
   motion tokens present. Report any pair you had to nudge to pass contrast.

6. **Suggest moderately.** Propose a harmony if the user was unsure; warn when a chosen
   accent will struggle to hit AA on white and offer the adjusted value; note where a
   dark-mode token will need a different value than a naive invert.

---

## Composes With
- **Consumed by:** every UI-producing skill (`vertical-slice`); these tokens are the
  vocabulary.
- **Checked by:** `rule-audit` rule 3 — hardcoded-style violations are defined as "not
  one of these tokens."
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
