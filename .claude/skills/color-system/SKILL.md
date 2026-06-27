---
name: color-system
description: >
  Construct a harmonious, role-complete OKLCH color system from a brand seed: derive the
  hue/chroma/lightness relationships, assign semantic roles (primary/accent/success/warning/
  danger/info and their foregrounds), derive dark mode as a real procedure (not a naive
  invert), and verify the result stays distinguishable for color-blind users and viz ramps.
  Outputs OKLCH values + role assignments for design-tokens to emit.
  Use when: "build the color system", "construct the palette", "pick the accent color",
  "what are the semantic colors", "derive dark mode", "is this palette colorblind-safe",
  "data viz palette", "chart colors".
  Do NOT use for: emitting the @theme token block (that's design-tokens); verifying WCAG
  contrast ratios (that's a11y-gate and design-tokens' contrast.mjs); mapping classNames to
  token utilities (that's tailwind-v4-component-style).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. The color-theory engine design-tokens orchestrates. Bundles
    cvd-check.mjs (distinguishability, orthogonal to contrast.mjs). Baseline section is the
    encoded failure class; replace with an observed transcript.
---

# color-system

The color-theory engine behind the token foundation. `design-tokens` asks for a brand hue
and then says "build full ramps with perceptually-even lightness" — this skill is *how* you
do that with intent: which hues to pick and why, how chroma must move as lightness changes,
what the semantic roles are and when to add one, how to derive dark mode by procedure, and
how to prove the result still works for the ~8% of men with a color-vision deficiency. It
produces OKLCH values and role assignments; `design-tokens` serializes them to `@theme` and
`contrast.mjs` gates their readability.

The OKLCH format and the AA-contrast requirement are decided in `../../../CLAUDE.md`.

---

## Non-Negotiable Rules
- **Never carry information by hue alone, and never ship a categorical or data-viz palette
  without running `cvd-check.mjs`.** Contrast passing is not distinguishability passing — two
  colors can read fine on the background and still be one color to a deuteranope. Pair color
  with text/icon/shape, and prove separation under all three dichromacies.
- **Dark mode is derived, not inverted.** Lightness is re-anchored and chroma is *reduced*
  for the dark surface; you do not flip `L → 1−L`. Follow the derivation in
  `references/dark-mode-derivation.md`, then re-run contrast on the dark pairs.
- **Chroma is a function of lightness, not a constant.** Very light and very dark steps must
  shed chroma or they look muddy / neon and drift in hue. See `references/harmony-and-roles.md`.

Refuse: "red/green is fine, nobody will notice"; "just invert the palette for dark mode";
"keep chroma flat across the ramp, it's simpler"; "the chart colors don't need checking."

---

## When to Use
- A project is choosing its palette and needs the hues *constructed*, not guessed.
- Adding a semantic role (success/warning/danger/info), a chart palette, or dark mode.
- Auditing whether an existing palette is colorblind-safe or harmonically coherent.

## When NOT to Use
- Writing the `@theme` block or the type/spacing/motion tokens → `design-tokens`.
- Checking a fg/bg pair meets AA contrast → `a11y-gate` / `design-tokens` `contrast.mjs`.
- Turning a chosen color into a className utility → `tailwind-v4-component-style`.

---

## Procedure

1. **Interrogate the seed and intent (high — these are load-bearing and subjective).** The
   brand hue(s) in OKLCH, the harmony family (monochrome / analogous / complementary /
   triadic / split-complementary), and the mood (calm vs energetic ⇒ low vs high chroma).
   If the user is unsure, propose a family from the brand hue rather than stalling.

2. **Derive the accent and neutrals from the seed by angle, not by eye.** Place accent(s) at
   the harmony family's hue offset from primary (e.g. complementary ≈ +180°, triadic ≈ ±120°,
   analogous ≈ ±30°). Build the neutral ramp at the primary's hue with very low chroma
   (a *tinted* gray), so neutrals belong to the palette instead of being dead `#888`. See
   `references/harmony-and-roles.md`.

3. **Build each role as a full ramp with a chroma curve.** For every role, lay out
   perceptually-even lightness steps, and bend chroma down at both ends of the ramp (peak
   chroma sits in the mid-tones). Keep hue near-constant per ramp, nudging only to counter
   Abney/Bezold-Brücke hue shift at the extremes. `references/harmony-and-roles.md` gives the
   step counts and the chroma-by-lightness table.

4. **Assign the semantic role taxonomy.** Map roles to meaning, not to favourite colors:
   `primary` (brand action), `accent` (secondary emphasis), and the *status* set —
   `success`≈green 145°, `warning`≈amber 80°, `danger`≈red 25°, `info`≈blue 240° — each with
   a paired `-foreground`. Only add a role when a distinct *meaning* needs it; record any
   non-obvious addition in `DECISIONS.md`. See `references/harmony-and-roles.md`.

5. **Derive dark mode by procedure.** Re-anchor surface lightness into the 0.15–0.25 band,
   lift foreground into 0.92–0.97, and *reduce* chroma on saturated roles (bright chroma on a
   dark bg vibrates). Don't invert. Then re-run `contrast.mjs` on every dark pair — dark mode
   has its own failures. Full steps in `references/dark-mode-derivation.md`.

6. **Prove distinguishability (mechanical gate).** Run `scripts/cvd-check.mjs` on the
   categorical/status set and on any data-viz ramp (`--ramp`). Fix any collapsing pair by
   spreading lightness or hue, not chroma. This is the check `contrast.mjs` cannot do. Data-viz
   palette construction (categorical / sequential / diverging) is in `references/data-viz-and-cvd.md`.

7. **Hand off.** Return the OKLCH values + role names to `design-tokens` for `@theme` emission;
   it runs `contrast.mjs` as the readability gate before anything ships.

---

## Composes With
- **Called by:** `design-tokens` — it orchestrates this skill, then serializes the result.
- **Hands off to:** `design-tokens` (emission + `contrast.mjs` readability gate).
- **Verified by:** `cvd-check.mjs` (distinguishability) here; `contrast.mjs` (readability) in
  `design-tokens`; `a11y-gate` owns the WCAG contrast floor at done-time.
- **Reviewed by:** `design-reviewer` (harmony coherence) and gated by `design-gate`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions): "brand blue #2563eb, set up the full color system + status colors + dark mode
> as Tailwind v4 @theme." The imagined catastrophe (hex, flat chroma, naive invert) did NOT
> occur — a capable base model is better than that. A **narrower** failure class was confirmed.

**Observed run.** The agent produced a competent OKLCH palette: full per-role ramps with
perceptually-stepped lightness, tinted-cool neutrals, a shadcn-style two-token semantic layer,
and status colors with `-bg` pairs. But three of this skill's load-bearing disciplines were
missing:

```css
/* dark mode — "the ramps stay constant, the meanings flip" + lighten primary one step */
.dark { --color-primary: var(--color-primary-500); /* same ramp chroma, not reduced */ }
/* "Hues chosen for AA contrast and color-blind separation" — asserted, never verified */
/* "Before shipping, spot-check ... with a contrast checker" — defers the gate to the user */
```

The accent it called "complementary" sat only ~60° from the brand hue (actually analogous);
dark mode **re-used the light ramp's chroma** rather than reducing it (the saturated-on-dark
vibration this skill guards against); and it **asserted** "AA contrast" and "colorblind
separation" with **zero verification**, deferring the contrast check to the user and never
testing CVD at all.

**Failure class (confirmed, narrowed).** Not "produces garbage" — "produces a plausible palette
and then asserts the parts that need proof." The base model claims AA and CVD-safety without
running either check, remaps dark mode instead of deriving it (no chroma reduction), and labels
harmony loosely. This skill adds the missing rigor: harmony by actual hue-angle, a chroma-by-
lightness curve, a *derived* dark mode, and `cvd-check.mjs` so distinguishability is proven, not
asserted (with `contrast.mjs` in `design-tokens` proving readability).

---

## Examples
**Input:** "Brand is blue `oklch(0.62 0.19 256)`, trustworthy, want a complementary accent and
the full status set, light + dark."
**Output:** Places accent at ≈76° (complementary, amber-gold), builds tinted-neutral and role
ramps with a chroma-by-lightness curve, assigns success/warning/danger/info at canonical
hues with foregrounds → derives dark mode (surface `L≈0.20`, chroma reduced ~20%) →
`cvd-check.mjs` flags warning(amber) vs success(green) collapsing under deuteranopia at the
chosen lightnesses, so it spreads their lightness apart → hands OKLCH + roles to `design-tokens`.

**Input:** "Need a 6-color categorical palette for the dashboard charts."
**Output:** Generates 6 hues spread by max perceptual+CVD distance (not even hue spacing) →
`cvd-check.mjs` clean under all three dichromacies → notes each series must also carry a
direct label or pattern, never rely on the color alone.

---

## Edge Cases
- **Brand color can't anchor a readable role** (e.g. a pale yellow brand as `primary`) → use it
  for large/brand surfaces only, derive a darker passing variant for actions; say so.
- **User wants 8+ categorical chart colors** → warn that distinguishability (esp. under CVD)
  degrades past ~7; recommend grouping, direct labels, or small multiples instead.
- **Existing palette, can't re-pick hues** → run `cvd-check.mjs`, then fix collisions by
  spreading *lightness* (survives CVD and grayscale) rather than chasing new hues.
- **Pure-gray neutrals requested** → allowed, but offer the tinted-neutral alternative and note
  it reads as more intentional; record the choice.

---

## References
- `references/harmony-and-roles.md` — harmony families as hue offsets, the chroma-by-lightness
  curve, ramp step counts, and the semantic role taxonomy (when a role earns its place).
- `references/dark-mode-derivation.md` — the step-by-step dark-mode procedure (lightness
  re-anchoring, chroma reduction, re-contrast), and why invert fails.
- `references/data-viz-and-cvd.md` — categorical/sequential/diverging palette construction and
  the CVD verification workflow with `cvd-check.mjs`.

## Scripts
- `scripts/cvd-check.mjs` — CVD distinguishability + viz-ramp monotonicity checker. Run on
  every categorical/status set and viz ramp. Orthogonal to `contrast.mjs` (readability ≠
  distinguishability). Exit code = number of failures.
- `scripts/README.md` — usage, the dichromacy model, and the threshold rationale.
