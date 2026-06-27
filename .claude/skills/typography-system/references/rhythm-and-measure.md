# Vertical rhythm, the leading ladder, and the measure

How to set line-height and line length so text reads well and sits on a consistent rhythm.
These are values typography owns; `design-tokens` emits them and `layout-composition` places
the containers.

## Line-height tightens as size grows

Line-height is a *ratio* of the font size, and the correct ratio falls as the size rises.
Long body lines need open leading to track from line to line; large headings are read as
shapes and need tight leading or they float apart.

| Role            | Size band         | Line-height |
|-----------------|-------------------|-------------|
| Body / prose    | 0.875–1.125rem    | 1.5–1.6     |
| UI / labels     | 0.75–1rem         | 1.35–1.45   |
| Subheading      | 1.25–1.75rem      | 1.25–1.35   |
| Heading         | 2–3rem            | 1.1–1.25    |
| Display         | > 3rem            | 1.0–1.1     |

A single line-height (the infamous `1.5` on everything) leaves big headings loosely spaced and
is the most common rhythm failure. Set line-height *per size band*, not globally.

## The leading ladder and block rhythm

Tie the space *between* blocks to the body line-height so the page breathes on one rhythm.
A practical system: let one rhythm unit = the body line-height (e.g. `1.5rem` for 1rem/1.5).
Then:

- paragraph spacing = 1 unit,
- space above a heading = 1.5–2 units (more space before than after — the heading binds to the
  content it introduces),
- space below a heading = 0.5–1 unit.

This is the pragmatic version of a baseline grid. A strict baseline grid (every line snapping to
a fixed lattice) is rarely worth the CSS in component UIs; the goal is *consistent vertical
spacing derived from the line-height*, which the 8pt spacing system in `design-tokens` already
supports when the body line-height is a multiple of the spacing step.

## The measure (line length)

The single biggest readability lever after size. Aim for **45–75 characters per line, ~66 the
sweet spot.** Too long and the eye loses its place returning to the next line; too short and the
rhythm stutters.

Set it on the text container, not the text:

```css
.prose { max-width: 66ch; }      /* character-based, tracks the font */
.prose { max-width: 38rem; }     /* rem cap, more predictable across fonts */
```

`ch` is literally "width of the `0` glyph," so it tracks the actual font; a `rem` cap is steadier
across font swaps. Either is fine — pick one and bound every long-form text block. UI text in
narrow columns is usually already within measure; it's hero copy and article bodies that run
away. `layout-composition` owns where the bounded container sits in the grid; this skill owns the
45–75ch value.
