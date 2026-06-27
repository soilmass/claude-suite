---
description: Generate or extend the design tokens
argument-hint: "[brand/mood notes]"
---

Invoke the `design-tokens` skill to generate or extend the token foundation, taking these
brand/mood notes as input: $ARGUMENTS

`design-tokens` is the orchestrating entry point: it owns the type system directly (scale,
measure, rhythm, font loading) and delegates the rest to three craft skills — `color-system`
(harmony, semantic roles, dark-mode derivation, colorblind checks), `layout-composition` (grid,
spacing rationale, breakpoints), and `motion-system` (easing, duration, choreography,
reduced-motion) — then serializes the result as Tailwind v4 `@theme` CSS variables, with WCAG
2.2 AA contrast verified before anything ships, per `../../CLAUDE.md`.
