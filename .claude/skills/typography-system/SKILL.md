---
name: typography-system
description: >
  Design the type system on top of the token foundation: choose a modular scale ratio,
  pair at most two families with intent, set the vertical-rhythm and leading ladder, bound
  the measure (line length), make type responsive without breaking rhythm, and define a
  font-loading strategy that never blocks render or shifts layout. Outputs the type-scale,
  line-height, and measure values for design-tokens to emit.
  Use when: "set up the type scale", "pair these fonts", "what type scale", "choose a font",
  "font loading strategy", "vertical rhythm", "line height", "line length", "responsive
  type", "variable font".
  Do NOT use for: emitting the type-scale @theme vars (that's design-tokens); the byte/CWV
  cost verdict of a chosen font (that's perf-budget-check / bundle-analysis); mapping a size
  to a className utility (that's tailwind-v4-component-style).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. The typographic-craft engine design-tokens orchestrates. Owns scale
    ratio, pairing, rhythm, measure, responsive type, and load strategy; cost verdict stays
    with perf-budget-check. Baseline section is the encoded failure class; replace with an
    observed transcript.
---

# typography-system

The typographic-craft engine behind the token foundation. `design-tokens` says "a modular
type scale, ratio 1.25" — this skill is *how* you choose that ratio and everything around it:
which scale fits dense data UI vs editorial, how to pair two families so they belong together,
why line-height must tighten as size grows, where to bound the measure so text stays readable,
how to scale type responsively without shattering the rhythm, and how to load a web font so it
never blocks the first paint or shifts the layout. It produces `rem`-based scale values,
line-heights, and a measure; `design-tokens` serializes them to `@theme`.

The CSS-first `@theme` format is decided in `../../../CLAUDE.md`.

---

## Non-Negotiable Rules
- **Never set body text outside the 45–75 character measure.** Full-width prose on a wide
  viewport is unreadable; bound it with a `max-width` in `ch`/`rem`. See
  `references/rhythm-and-measure.md`.
- **Never block the first paint on a web font, and never let one shift the layout.** Always a
  metric-matched fallback (`size-adjust`/`ascent-override`) with `font-display: swap` (or
  `optional`), the critical face self-hosted and preloaded. See
  `references/loading-and-responsive.md`.
- **Never exceed two families, and never build a flat scale.** Two families + their weights is
  the ceiling; sizes come from one ratio off a `1rem` base, not hand-picked px. See
  `references/scale-and-pairing.md`.

Refuse: "just use 16/20/24/32px, close enough"; "load the font normally, the flash is fine";
"one line-height of 1.5 on everything"; "let the heading run the full container width";
"add a third display font for this one section."

---

## When to Use
- A project needs its type scale, families, rhythm, and load strategy chosen with intent.
- Adding responsive type, a heading ladder, or a measure constraint to an existing theme.
- Auditing typography for rhythm, pairing coherence, or a render-blocking/CLS-causing font.

## When NOT to Use
- Writing the `@theme` block (the `--text-*`, line-height vars) → `design-tokens`.
- Deciding whether a font's bytes fit the budget / hurt LCP → `perf-budget-check`,
  `bundle-analysis`.
- Turning a size into a `text-lg` className on a component → `tailwind-v4-component-style`.

---

## Procedure

1. **Interrogate the register and density (high — load-bearing and subjective).** Editorial /
   marketing (wide ratio, expressive pairing) vs product / data-dense (tight ratio, one
   neutral family, optical sizes). The answer sets the scale ratio and the family count.

2. **Choose the modular scale ratio off a `1rem` base.** Tighter ratios (1.125 minor second,
   1.2 minor third) for dense UI where many sizes must coexist; wider (1.25 major third, 1.333
   perfect fourth, 1.618 golden) for editorial hierarchy. Generate `--text-*` as `rem`
   multiples of the ratio, not px — `rem` respects the user's root size. See
   `references/scale-and-pairing.md`.

3. **Pair at most two families, by classification.** A display/heading face + a body face that
   share proportions and x-height (geometric-sans display + humanist-sans body; serif display +
   sans body). Often one family with optical-size axes is enough — prefer it. Map families to
   roles (display, body, mono), not to whim. See `references/scale-and-pairing.md`.

4. **Set the vertical rhythm and leading ladder.** Line-height is a ratio that *tightens* as
   size grows: ~1.5–1.6 for body, ~1.1–1.25 for headings. Tie block spacing to the body
   line-height so paragraphs sit on a consistent rhythm. See `references/rhythm-and-measure.md`.

5. **Bound the measure.** Set body containers to a `max-width` yielding 45–75 characters
   (~66 is the sweet spot) via `ch` or a `rem` cap. This is a layout constraint typography
   owns the *value* of; `layout-composition` places the container. See
   `references/rhythm-and-measure.md`.

6. **Make type responsive without breaking rhythm.** Prefer `clamp()` fluid type with explicit
   min/max bounds, scaling the *ratio* (compress hierarchy on small screens), not just the
   base; re-check that line-heights still land on rhythm at the extremes. See
   `references/loading-and-responsive.md`.

7. **Define the load strategy, then hand off the cost.** Self-host + `preload` the critical
   face, subset it, prefer one variable file over many static weights, and metric-match the
   fallback so swapping causes no CLS. Then hand the byte/CWV *verdict* to `perf-budget-check` /
   `bundle-analysis`. See `references/loading-and-responsive.md`.

---

## Composes With
- **Called by / hands off to:** `design-tokens` — it orchestrates this skill, then emits the
  `--text-*`, line-height, and measure tokens.
- **Pairs with:** `layout-composition` — the measure is a shared constraint (this owns the
  value, that places the container).
- **Cost owned by:** `perf-budget-check` / `bundle-analysis` — font bytes, LCP, CLS verdicts.
- **Reviewed by:** `design-reviewer` (rhythm + pairing coherence) and gated by `design-gate`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions): "set up typography — scale, fonts, line-heights, web-font loading." This is the
> **weakest-justified** of the design skills: the imagined failure mostly did NOT reproduce, and
> the residual gap is mild. Recorded honestly rather than inflated.

**Observed run.** The agent produced strong typography: a 1.25 Major-Third scale with paired
line-heights that *tighten as size grows*, `next/font` self-hosted with `display: swap` and
metric-matched fallback (no CLS), variable fonts, a two-family pairing with classification
rationale, a 65ch measure cap, and `text-wrap: balance/pretty`. None of the imagined defects
(flat px scale, 1.5 on everything, FOIT/CLS, unbounded measure) occurred.

```css
--text-base: 1rem; --text-base--line-height: 1.5rem;   /* paired, ratio-based */
.prose { max-width: 65ch; }                            /* measure bound — but opt-in only */
```

**Residual gap (mild).** The measure was bounded only on an opt-in `.prose` class — default body
text stays unbounded unless the dev remembers to apply it — and the scale is **static across
breakpoints** (no `clamp()`/fluid type, no ratio compression on small screens). The strong base
result means this skill earns its place mainly as the **responsive-type + systemic-measure +
verification** discipline, not as a rescue from incompetence. **Candidate for narrowing or
folding into `design-tokens`** if a second capture confirms the base model stays this strong;
see the note to maintainers in `DECISIONS.md` if that call is taken.

Original imagined failure class (largely NOT reproduced — kept for reference):
- Emits a flat px size list (16/20/24/32) with no ratio, so the hierarchy has no consistent
  relationship and breaks when the root size changes.
- Picks one font for everything, or four unrelated fonts, with no classification pairing and no
  x-height match — the page reads as default or as chaos.
- Applies a single line-height (1.5) to body and headings alike, so large headings are loosely
  spaced and the vertical rhythm is uneven.
- Lets body text run the full container width — 120+ character lines no one can comfortably read.
- Loads a web font in a way that flashes invisible text (FOIT) or swaps to a mis-metric'd face,
  shifting the layout and tanking CLS.

---

## Examples
**Input:** "Set up type for a data-dense analytics dashboard, one neutral sans, light + dark."
**Output:** Chooses a tight 1.2 (minor third) ratio off `1rem` so the many sizes nest cleanly →
one variable humanist-sans family with optical sizing, plus a mono for figures → body
line-height 1.5, headings 1.2, table rows 1.35 → measure capped at 70ch for any prose blocks →
`clamp()` only on the page title → hands `--text-*` + line-heights to `design-tokens`, font
bytes to `perf-budget-check`.

**Input:** "We have a marketing landing page, want an expressive headline."
**Output:** Wide 1.333 (perfect fourth) ratio for dramatic hierarchy → serif display + humanist
sans body matched on x-height → headline line-height 1.1, body 1.6, measure 60ch → preload the
display weight actually used above the fold, subset to Latin, `size-adjust` the fallback → byte
verdict to `bundle-analysis`.

---

## Edge Cases
- **Brand mandates a specific display font that's heavy** → load it `optional` and only for the
  hero; serve everything else from the metric-matched system stack; flag the cost to
  `perf-budget-check`.
- **Designer hands over px sizes from Figma** → convert to `rem` and fit them to the nearest
  ratio; if they don't fit any scale, say so and propose the closest modular set.
- **Long-form CJK or Arabic content** → the 45–75ch measure and Latin line-heights don't
  transfer; raise line-height and re-derive the measure per script, note it explicitly.
- **Fluid `clamp()` makes a heading collide with body at one width** → bound the min/max so
  hierarchy never inverts; prefer stepped breakpoints if a clean clamp can't hold rhythm.

---

## References
- `references/scale-and-pairing.md` — modular-scale ratios and how to choose one, the `rem`
  rationale and `--text-*` mapping, and font pairing by classification.
- `references/rhythm-and-measure.md` — the line-height/leading ladder, block-spacing rhythm,
  and how to set the 45–75ch measure.
- `references/loading-and-responsive.md` — `clamp()` responsive type, variable-font axes, and
  the FOUT/FOIT load strategy (preload, subset, `size-adjust`) with the perf-budget hand-off.

## Scripts
- `scripts/` — reserved. The mechanical checks here (does a font fit the byte budget, does it
  hurt LCP/CLS) are already owned by `perf-budget-check` / `bundle-analysis`; add a script only
  if a typography-specific check emerges that those don't cover.
