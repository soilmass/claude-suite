---
name: motion-system
description: >
  Design the motion layer with intent: choose easing curves by what the element is doing
  (entering/leaving/moving), set durations from the perceptual bands (smaller + shorter =
  faster), choreograph multi-element transitions (stagger, enter/exit asymmetry), make
  micro-interactions that show causality, and design the prefers-reduced-motion variant as a
  first-class deliverable. Outputs easing/duration values + motion specs for design-tokens.
  Use when: "design the motion", "animation system", "easing curves", "transition timing",
  "micro-interactions", "page transitions", "choreography", "reduced motion", "how long should
  this animation be".
  Do NOT use for: emitting the motion @theme tokens (that's design-tokens); checking that a
  prefers-reduced-motion variant is PRESENT as WCAG 2.3.3 conformance (that's a11y-gate);
  building the animated interactive primitive itself (that's shadcn-compose).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. The motion-design engine design-tokens orchestrates: easing
    semantics, duration bands, choreography, and the reduced-motion variant. Baseline observed (clean-room capture).
---

# motion-system

The motion engine behind the token foundation. `design-tokens` emits `--duration-*` and
`--ease-*` variables — this skill is *how* you choose them with intent: which easing a moving
element needs and why, how long a transition should last for its size and distance, how to
choreograph several elements so they read as cause-and-effect instead of chaos, and how to
design the reduced-motion variant that vestibular users depend on. Motion is a language for
**causality, spatial continuity, and state change** — never decoration. It produces easing
curves, durations, and per-interaction specs; `design-tokens` serializes them to `@theme`.

The token format and the WCAG 2.2 AA floor are decided in `../../../CLAUDE.md`.

---

## Non-Negotiable Rules
- **Every animation ships a `prefers-reduced-motion` variant.** Not "motion removed" — a
  designed reduced variant (cross-fade or instant state change) that preserves the essential
  feedback. Large transforms, parallax, and auto-playing motion are the vestibular hazards to
  replace. See `references/reduced-motion.md`.
- **Motion must mean something.** It shows causality (this caused that), spatial relationship
  (where this came from / went), or state change (loading → loaded). If an animation conveys
  none of these, cut it. Decorative motion is latency the user pays for nothing.
- **Durations and easings come from tokens, and respect the perceptual bands.** No raw
  `300ms`/`linear` literals; map to `--duration-*` / `--ease-*`. Nothing in productivity UI
  should feel sluggish (> ~500ms) or imperceptible-but-janky.

Refuse these rationalizations: "linear is fine for everything"; "one duration for all of it is
simpler"; "reduced-motion is an edge case, ship it later"; "it's just a little flourish."

---

## When to Use
- A project is defining its motion language, or a feature needs a transition designed.
- Choosing easing/duration for a specific interaction (hover, press, enter, route change).
- Designing the reduced-motion variant, or auditing motion that feels chaotic or sluggish.

## When NOT to Use
- Writing the `@theme` block or the color/type/spacing tokens → `design-tokens`.
- Confirming a reduced-motion variant is *present* for WCAG conformance → `a11y-gate`.
- Building the animated dialog/menu/combobox primitive → `shadcn-compose`.
- Judging the animation's effect on LCP/INP → `perf-budget-check`.

---

## Procedure

1. **Classify what the element is doing (low — it's a lookup).** Entering, leaving, moving in
   place, or signalling state? The verb picks the easing family before anything else. See
   `references/easing-and-duration.md`.

2. **Pick the easing by family, not by feel.** `ease-out` (decelerate) for elements
   **entering** — fast then settle, the most common and the one that feels responsive;
   `ease-in` (accelerate) for elements **leaving**; `ease-in-out` (standard) for moves between
   two on-screen points; `emphasized` for large/hero moments. Map to the `--ease-*` tokens.
   Why `ease-out` feels right: the element arrives quickly and eases to rest, like real
   deceleration (Material / Apple HIG both anchor entrances here).

3. **Set duration from the perceptual band, scaled to size and distance.** `< 100ms` reads as
   instant; `100–200ms` is snappy (hovers, toggles, small state ~120–160ms); `200–320ms` for
   standard transitions; `320–500ms` for large surfaces or page-level. **Smaller element +
   shorter distance ⇒ shorter duration.** Map to `--duration-*`. See
   `references/easing-and-duration.md`.

4. **Choreograph multi-element motion.** Stagger list/grid items ~20–50ms each so they cascade
   instead of flashing in together; move parent before child; make **exits faster than
   entrances** (people forgive a quick disappearance, resent a slow one). For continuity
   between views, use a shared-element / view transition so the object appears to persist. See
   `references/choreography-and-transitions.md`.

5. **Design micro-interactions as feedback, not flourish.** Hover/press/focus must confirm the
   control is live (a press scale of ~0.97, a token color shift); optimistic UI animates the
   expected end-state immediately; loading → loaded resolves the skeleton into content. Model
   each as trigger → rules → feedback → loop. See `references/choreography-and-transitions.md`.

6. **Design the reduced-motion variant (mandatory, not optional).** For every animation,
   specify the `@media (prefers-reduced-motion: reduce)` form: replace large transforms with a
   cross-fade or an instant change, keep essential feedback (focus, state). `a11y-gate` will
   gate that it *exists*; this step is where it gets *designed*. See
   `references/reduced-motion.md`.

7. **Hand off.** Return easing curves, durations, and per-interaction specs to `design-tokens`
   for `@theme` emission. Flag any motion on LCP content to `perf-budget-check` — never animate
   the largest paint element in.

---

## Composes With
- **Called by / hands off to:** `design-tokens` — it emits the `--duration-*` / `--ease-*`
  tokens this skill specifies.
- **Pairs with:** `shadcn-compose` — the animated primitive (dialog/menu) is built there;
  this skill supplies its timing and the reduced variant.
- **Gated by:** `a11y-gate` (the reduced-motion variant must be *present*, WCAG 2.3.3) and
  `perf-budget-check` (the motion's INP/LCP cost). Reviewed by `design-reviewer`, gated at
  done-time by `design-gate`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions): "set up the motion system — durations, easings, micro-interactions, page
> transitions." The imagined failure (linear easing, one duration, no reduced-motion) did NOT
> occur. A **narrower** failure class was confirmed.

**Observed run.** The agent produced a solid token set: a duration scale reasoned from
perceptual bands (instant/fast/base/slow/slower), easing curves mapped to element verbs
(decelerate-on-enter, accelerate-on-leave), `transition-property` scoped to specific props (not
`all`), transform/opacity for 60fps, and a `template.tsx` route-enter. Two of this skill's
disciplines were thin:

```css
/* reduced-motion: the blunt global kill-switch — removes ALL motion, incl. essential feedback */
@media (prefers-reduced-motion: reduce) {
  *,*::before,*::after { animation-duration:.01ms!important; transition-duration:.01ms!important; }
}
/* choreography: stagger / sequenced multi-element enter — never addressed */
```

It satisfied reduced-motion with the **blanket `*{…0.01ms}` nuke** rather than a *designed*
reduced variant (a cross-fade that preserves the feedback), and it covered single-element
micro-interactions but **no multi-element choreography** (stagger, sequenced list enters).

**Failure class (confirmed, narrowed).** Not "motion feels broken" — "the easy 80% is right, the
considered parts are missing." The base model reaches for the global motion-kill instead of
authoring a reduced variant, and never choreographs sequences. This skill supplies those two: a
designed `prefers-reduced-motion` variant that keeps essential feedback, and the choreography
rules (stagger, enter/exit asymmetry across elements).

---

## Examples
**Input:** "Animate the dropdown menu opening."
**Output:** Classifies it as *entering* → `ease-out`; small surface, short distance →
`--duration-fast` (~140ms); origin at the trigger so it scales/fades from there (spatial
continuity); exit faster (~100ms, `ease-in`); reduced-motion variant = instant show/hide with
a token opacity cross-fade, focus still moves into the menu. Hands timing to `design-tokens`;
notes the menu itself must be the shadcn/Radix primitive.

**Input:** "The dashboard cards should animate in on load."
**Output:** Stagger the cards ~30ms each with `ease-out` at `--duration-base`, parent grid
settles first → warns NOT to animate the LCP card in (defers transform until after paint;
flags to `perf-budget-check`) → reduced-motion variant: all cards appear at once, no transform,
optional 1-frame fade.

---

## Edge Cases
- **Brand wants a big, playful signature animation** → allowed for a hero/empty-state moment at
  `emphasized` easing and a longer duration, but keep it off the critical interaction path and
  give it a calm reduced-motion variant.
- **Spring vs cubic-bezier** → springs feel natural for drag/gesture and direct-manipulation;
  cubic-bezier tokens are right for the deterministic, repeatable UI transitions here. Don't
  mix models within one interaction.
- **The interaction must block until the animation finishes** → it shouldn't; never gate input
  or data on a transition. Make motion non-blocking and interruptible.
- **An element both enters and the page is measured for LCP/CLS** → no entrance transform on
  layout-shifting or largest-paint content; animate opacity only, or after paint.

---

## References
- `references/easing-and-duration.md` — the four easing families mapped to element verbs, and
  the perceptual duration bands with the size/distance scaling rule.
- `references/choreography-and-transitions.md` — stagger, parent/child order, enter/exit
  asymmetry, shared-element/view transitions, and the micro-interaction model.
- `references/reduced-motion.md` — how to design the `prefers-reduced-motion` variant, the
  vestibular grounding, and what counts as essential feedback to preserve.

## Scripts
- `scripts/` — reserved / empty. A `prefers-reduced-motion` presence check is better expressed
  as a lint/hook over the codebase than a skill script; add one only if motion regressions
  recur in review.
