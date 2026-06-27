# The grid, the spacing scale, and the layout mechanism

How to build spatial structure as a system, instead of nudging pixels. Everything here feeds
spacing and breakpoint values to `design-tokens`; nothing here emits tokens or writes markup.

## Why 8pt

The base step is 8px (`0.5rem`) because:

- **It divides cleanly.** 8 = 2³, so halves (4) and doubles (16, 24, 32…) stay whole — no
  fractional pixels, no blurry edges.
- **It scales to crisp pixels at 1×/2×/3×.** 8 → 16 → 24 device pixels land on the grid at every
  common density, so layouts stay sharp on retina and Android dpi tiers.
- **It aligns to real viewports.** Common widths (320, 768, 1024, 1440) are 8-divisible, so a
  margin/gutter built on 8 lines up with breakpoints instead of fighting them.
- **It collapses decisions.** "Some space here" becomes a choice among a handful of steps, not an
  infinite slider — which is exactly what makes a layout feel composed rather than guessed.

Use a **4pt sub-step** only for fine control inside small components (icon gaps, inline badges).
Below 4px, you are decorating, not spacing.

## The spacing scale

A geometric-ish scale, not a linear one — perceived spacing needs bigger jumps as it grows:

```
4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128
```

- **Inner padding vs outer margin discipline.** A component owns its *padding*; the layout owns
  the *margin/gap* between components. Don't bake outer spacing into a component — it makes the
  component non-reusable and double-spaces when laid out.
- **Spacing relates to the type scale.** Vertical rhythm (the gaps between text blocks) should be
  multiples of the line-height/base step so text and space share a rhythm — coordinate with
  `design-tokens`.
- **Spacing is a system, not a guess.** Every gap is a scale step. The moment you reach for `13px`
  to "make it line up," the real fix is on the scale (snap to 12 or 16).

## Columns, gutters, margins

- **Columns by need, not ceremony.** 12 columns for flexible app layouts (divides into 2/3/4/6);
  4–6 for simpler content sites. More columns ≠ better; they buy flexibility you may not use.
- **Gutters and outer margins are scale steps** (e.g. 16/24 gutters, 24–64 margins), tightening
  with density and loosening on marketing surfaces.
- **Content max-width tied to the measure.** Cap text containers at ≈60–75ch so lines stay
  readable; the *page* can be wider than the *text*. This binds to `design-tokens`'s measure.

## Grid vs Flexbox vs container queries

- **CSS Grid** for two-dimensional page structure: app shells (sidebar + header + content),
  card galleries, dashboard regions. You're placing things on rows *and* columns.
- **Flexbox** for one-dimensional component rows: toolbars, button groups, a label-and-control
  pair. You're flowing things along one axis.
- **Container, not viewport.** A component dropped into a narrow slot should respond to *its
  slot*, not the screen — reach for container queries so a card reflows the same whether it's in
  a wide hero or a narrow rail. This is what keeps components truly reusable across layouts.
