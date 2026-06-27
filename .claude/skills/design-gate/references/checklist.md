# Done-time design adherence + craft checklist

Run top to bottom against the rendered output + the `@theme` block. Each item names the gate
that owns the adjacent concern so this gate never double-owns it.

## Spacing & layout (cite layout-composition)
- [ ] Every gap/padding/margin is a `--spacing-*` step — no off-scale `[14px]`, `[30px]`.
      (`rule-audit` Rule 3 owns hardcoded-vs-token; *this* owns off-the-scale-but-tokenish and
      inline arbitrary values that slipped Rule 3.)
- [ ] The grid/columns are consistent across the view; container max-width respects the measure.
- [ ] Density suits the content (airy marketing vs dense data) and is internally consistent.
- [ ] Touch targets are comfortable. The 24px WCAG 2.5.8 *minimum* is `a11y-gate`'s; this owns
      the comfortable default (≈44–48px on mobile).

## Type (cite typography-system)
- [ ] Sizes resolve to the `--text-*` scale; no off-scale font sizes.
- [ ] Body measure ≈ 45–75ch; long-form text is bounded, not full-bleed.
- [ ] Line-height tightens as size grows (headings tighter than body).
- [ ] ≤ 2 families; weights are from the chosen set.

## Color role & harmony (cite color-system; mechanical where possible)
- [ ] Colors are used by *semantic role*, not arbitrary token swaps (no `info` token on a
      success surface).
- [ ] `cvd-check.mjs` is clean on the status/categorical/chart sets — a collapse is a **blocker**
      unless a redundant label/icon already carries the meaning (then a note).
- [ ] Contrast: do NOT verdict here — hand to `a11y-gate`. Use `contrast.mjs` only to inform a
      harmony suggestion.

## Hierarchy & state craft (suggestion-first; defer depth to design-reviewer)
- [ ] One clear primary action per view; the scan path reads (squint test).
- [ ] The four states (Rule 4 owns *presence*) are *crafted*: empty guides (illustration + CTA),
      skeleton matches the success layout, error is actionable, not a bare string.
- [ ] Motion uses token durations/easings and is meaningful; a `prefers-reduced-motion` variant
      exists (its *presence* is `a11y-gate`'s; its *design quality* is in scope here).

## Verdict
- State which findings a script proved (`cvd-check`) vs judged.
- State explicitly: **"accessibility conformance not assessed — run `a11y-gate`."**
- A change is done only when all four done-time gates are clean.

## Defer map (so this gate stays in its lane)
| Concern                        | Owner            |
|--------------------------------|------------------|
| Contrast ratio / WCAG          | `a11y-gate`      |
| Hardcoded value (is it a token)| `rule-audit` R3  |
| State *presence*               | `rule-audit` R4  |
| Open-ended craft critique      | `design-reviewer`|
| On-the-scale / role / harmony / CVD / craft quality | **this gate** |
