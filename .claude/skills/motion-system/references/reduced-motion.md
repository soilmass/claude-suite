# Designing the prefers-reduced-motion variant

A reduced-motion variant is a **designed deliverable**, not a switch that deletes animation.
`a11y-gate` checks that one is *present* (WCAG 2.3.3 Animation from Interactions); this skill is
where it gets *designed* so it still feels intentional.

## Why it matters

For people with vestibular disorders, large or unexpected motion — parallax, big slides,
zoom/scale across the viewport, auto-playing movement — can trigger genuine nausea, dizziness,
and migraine. `@media (prefers-reduced-motion: reduce)` is the OS-level signal that a user has
asked software to calm down. Honoring it is an accessibility requirement, not a preference.

## What to replace, what to keep

The goal is **same information, less vestibular load** — preserve the feedback, drop the
travel.

| Full motion                          | Reduced variant                                  |
|--------------------------------------|--------------------------------------------------|
| Large transform (slide/zoom across)  | Cross-fade in place, or instant                  |
| Staggered list cascade               | All items appear at once (optional 1-frame fade) |
| Parallax / scroll-linked motion      | Static; no scroll coupling                       |
| Shared-element travel                 | Simple cross-fade between the two views          |
| Auto-playing / looping motion        | Pause; show the end state                        |
| Press/focus feedback, state change   | **Keep** — these are essential, and small        |

Essential feedback is never removed: focus indicators, the fact that a menu opened, a loading
state resolving. A reduced variant that strips these has broken the UI, not calmed it. Opacity
cross-fades and color/state changes are low-vestibular-risk and generally safe to keep.

## How to express it

Author motion so the reduced path is the safe default or an explicit override:

```css
.panel { transition: transform var(--duration-base) var(--ease-out), opacity var(--duration-base); }

@media (prefers-reduced-motion: reduce) {
  .panel { transition: opacity var(--duration-fast) linear; transform: none; }
  /* state still changes; the travel is gone */
}
```

Two disciplines:

- **Design both at once.** When you spec an animation, spec its reduced form in the same breath
  — don't leave it as a TODO. The baseline failure is shipping the full motion with no variant
  at all.
- **Test the signal.** Verify with the OS "reduce motion" setting on (or emulated in devtools)
  that essential feedback survives and no large transform plays. `a11y-gate` confirms presence;
  you confirm it still *works*.
