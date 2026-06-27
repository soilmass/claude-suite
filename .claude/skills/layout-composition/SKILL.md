---
name: layout-composition
description: >
  Design the page layout as a system: the grid (8pt rhythm, columns, gutters, margins), the
  spacing scale and its rationale, visual hierarchy (size/weight/contrast/space/position), the
  density mode (comfortable vs compact vs dense), and a content-driven breakpoint strategy.
  Produces the spatial decisions design-tokens emits as spacing/breakpoint tokens and that
  vertical-slice composes markup against.
  Use when: "design the layout", "set up the grid", "spacing system rationale", "visual
  hierarchy", "choose breakpoints", "responsive strategy", "page composition", "density".
  Do NOT use for: emitting the spacing/breakpoint @theme vars (that's design-tokens); whether a
  value is hardcoded vs a token (that's rule-audit Rule 3); building the responsive markup
  (that's vertical-slice / tailwind-v4-component-style); the WCAG 2.5.8 touch-target minimum as
  a conformance check (that's a11y-gate — this owns comfortable sizing/density above that floor).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. The spatial-design engine design-tokens orchestrates: grid, spacing
    rationale, hierarchy, density, breakpoint strategy. Baseline section is the encoded failure
    class; replace with an observed transcript.
---

# layout-composition

The spatial-design engine behind the token foundation. `design-tokens` asserts "8pt spacing
system" and emits the variables — this skill is *why* 8pt, *how* the grid and columns are
built, how to compose a hierarchy a user can scan in a glance, when to be airy vs dense, and
where to actually put the breakpoints (where the content breaks, not where a phone happens to
be). It produces the spatial decisions; `design-tokens` serializes them and `vertical-slice`
composes markup against them.

The 8pt spacing system and the token format are decided in `../../../CLAUDE.md`.

---

## Non-Negotiable Rules
- **Every spacing and sizing value resolves to the scale — never an arbitrary px.** Design *to*
  the 8pt scale (8/16/24/32/48/64…); a one-off `13px` margin is the tell that the layout was
  guessed, not composed. Enforcement of hardcoded values is `rule-audit` Rule 3; the discipline
  of designing on-scale is owned here.
- **Breakpoints are chosen by content, not by device.** Break where the measure, the grid, or
  the reading order stops working — not at a list of phone/tablet/desktop widths. See
  `references/breakpoint-strategy.md`.
- **Whitespace is designed, not leftover.** Space is the primary tool of grouping and hierarchy;
  proximity says "these belong together" louder than a border. Unbounded full-bleed content with
  no measure is a defect, not a clean look. See `references/hierarchy-and-density.md`.

Refuse these rationalizations: "just nudge it a few px to line up"; "use the standard device
breakpoints, they're fine"; "more whitespace later, ship it dense for now"; "max-width is
optional, let it fill the screen."

---

## When to Use
- A project or page needs its grid, spacing system, and composition decided.
- Building a hierarchy: which element leads, how the eye moves, what groups with what.
- Choosing a density mode (marketing page vs data dashboard) or a breakpoint set.

## When NOT to Use
- Emitting the spacing/breakpoint `@theme` variables → `design-tokens`.
- Catching a hardcoded px value in a diff → `rule-audit` Rule 3.
- Writing the responsive JSX/utilities → `vertical-slice` / `tailwind-v4-component-style`.
- Verifying the 24px target-size *minimum* for conformance → `a11y-gate`.

---

## Procedure

1. **Interrogate the page's job and density (medium — content type drives everything).** What
   is this surface (marketing, app shell, data table, form), how dense should it read, and what
   is the single primary action. A dashboard and a landing page do not share a density. If
   unsure, default to *comfortable* and say so.

2. **Lay the grid on the 8pt rhythm.** Choose columns by need (12 for flexible app layouts,
   4–6 for simpler content), set gutters and outer margins as scale steps, and pin a content
   `max-width` tied to the measure (≈60–75ch for text). 8pt because it divides cleanly, scales
   to crisp pixels at 1×/2×/3×, and aligns to common viewport sizes. See
   `references/grid-and-spacing.md`.

3. **Pick the layout mechanism per axis.** CSS Grid for two-dimensional page structure
   (app shell, card galleries); Flexbox for one-dimensional component rows (toolbars, button
   groups). Think in *containers, not the viewport* — reach for container queries when a
   component must respond to its slot, not the screen. See `references/grid-and-spacing.md`.

4. **Compose the visual hierarchy.** Establish the lead element and the eye path using the five
   tools — size, weight, color/contrast, space, position — leaning on **space and contrast**
   before size. Group by proximity (Gestalt), keep one primary action per view, and lay scannable
   content along an F/Z path. Apply the squint test: blur your eyes; the hierarchy should survive.
   See `references/hierarchy-and-density.md`.

5. **Set the density mode coherently.** Comfortable / compact / dense change spacing, line-height,
   and target size *together*, not in isolation. Honor the comfortable touch-target default
   (≈44–48px on mobile) above the conformance floor `a11y-gate` enforces. See
   `references/hierarchy-and-density.md`.

6. **Choose breakpoints from the content.** Mobile-first. Add a breakpoint only where the layout
   actually breaks — the measure grows too long, the grid can hold another column, a side rail
   now fits. Tailwind's defaults are a starting point, not a spec; too many breakpoints is its own
   smell. See `references/breakpoint-strategy.md`.

7. **Hand off.** Return the grid, spacing steps, density, and breakpoints to `design-tokens`
   for `@theme` emission; `vertical-slice` composes the markup against them.

---

## Composes With
- **Called by / hands off to:** `design-tokens` — it emits the spacing and breakpoint tokens
  these decisions define.
- **Pairs with:** `design-tokens` — the measure (line-length) is a shared constraint that
  binds the content max-width here to the type system there.
- **Enforced by:** `rule-audit` Rule 3 (no hardcoded spacing); the touch-target conformance floor
  is `a11y-gate` (WCAG 2.5.8).
- **Reviewed by:** `design-reviewer` (hierarchy, rhythm, spacing-scale adherence) and gated by
  `design-gate`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions): "set up the layout system — spacing scale, grid, breakpoints, hierarchy." The
> imagined failure (arbitrary px, no hierarchy, unbounded measure) did NOT occur. A **narrower**
> failure class was confirmed.

**Observed run.** The agent produced a strong layout system: a rem-based spacing scale on a 4px
unit with geometric growth at the top, named content widths (including a 65ch prose measure), a
12-column grid with `Container`/`Section` primitives, mobile-first guidance, and a real
hierarchy section (proximity grouping, one focal point, density registers). Two of this skill's
disciplines were inverted or absent:

```css
--breakpoint-sm: 40rem; --breakpoint-md: 48rem; --breakpoint-lg: 64rem; /* device clusters */
/* "device-cluster-aligned ... picking the well-worn set rather than inventing my own" */
/* touch-target / comfortable tap sizing on mobile: never mentioned */
```

It explicitly **chose device-width breakpoints and defended device-cluster thinking** — the
opposite of breaking where the *content* breaks — and never addressed **touch-target sizing**
or input-density on mobile.

**Failure class (confirmed, narrowed).** Not "can't lay out a page" — "defaults to device-driven
breakpoints and forgets the hand." The base model reaches for the well-worn 640/768/1024 set as
a reflex and omits comfortable tap sizing. This skill supplies the two it misses: a content-driven
breakpoint strategy (break where the measure or grid actually fails) and density/touch-target
discipline above the `a11y-gate` floor.

---

## Examples
**Input:** "Lay out the analytics dashboard — lots of tables and charts, info-dense."
**Output:** Chooses a 12-column grid with tight 16px gutters, *dense* mode (compact row height,
tighter line-height, but tap targets held at the comfortable floor), a fixed side-nav via CSS
Grid, container queries on the chart cards so they reflow by slot not viewport → hierarchy leads
with the KPI row, secondary metrics grouped by proximity → breakpoints set where the table can
shed/add columns, not at stock device widths → hands grid + spacing + breakpoints to `design-tokens`.

**Input:** "Compose the marketing landing hero."
**Output:** *Comfortable/airy* density, single primary CTA, generous 64–96px section rhythm on
the 8pt scale, content capped at ~70ch measure centered with wide margins, Z-pattern scan
(logo → nav → headline → CTA) → one breakpoint where the two-column hero stacks because the
measure gets too long, not because "tablet."

---

## Edge Cases
- **Designer hands over pixel values off the scale** (`13px`, `15px`) → snap to the nearest scale
  step and confirm; a literal translation imports their guesswork. Flag if a value is load-bearing.
- **Content genuinely needs a non-grid layout** (a bespoke editorial spread) → allowed; still pin
  spacing to the scale and a measure to the text, and record the deviation in `DECISIONS.md`.
- **Asked to "just match this screenshot"** → reconstruct the underlying grid and scale first;
  copying offsets pixel-for-pixel reproduces misalignment and won't survive responsive sizes.
- **Tons of breakpoints requested** → push back; consolidate to the few where content actually
  breaks and prefer container queries for component-level responsiveness.

---

## References
- `references/grid-and-spacing.md` — the 8pt grid rationale, columns/gutters/margins as tokens,
  content max-width and measure, and the CSS Grid vs Flexbox / container-query decision.
- `references/hierarchy-and-density.md` — the five hierarchy tools, Gestalt grouping, the squint
  test, scannability, and the comfortable/compact/dense modes with target sizing.
- `references/breakpoint-strategy.md` — content-driven breakpoints, mobile-first, why device
  widths mislead, and when to reach for container queries.

## Scripts
- `scripts/` — reserved/empty. A spacing-step adherence linter would belong to `rule-audit`
  Rule 3 / `design-gate`, not here; this skill is spatial-design judgment, not a mechanical check.
