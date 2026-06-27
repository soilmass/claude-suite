# Responsive type, variable fonts, and the load strategy

How to scale type across viewports and load web fonts without flashing or shifting. The
strategy lives here; the byte/CWV *verdict* belongs to `perf-budget-check` / `bundle-analysis`.

## Responsive type with `clamp()`

Prefer fluid type with explicit bounds over a pile of breakpoint overrides:

```css
--text-3xl: clamp(1.75rem, 1.2rem + 2.5vw, 2.75rem);
```

`clamp(min, preferred, max)` interpolates with the viewport but never escapes the bounds. Rules:

- **Scale the *ratio*, not just the base.** On small screens compress the hierarchy — a 1.333
  scale on desktop might read as ~1.2 on mobile so the headline doesn't dwarf the body. Set the
  large sizes' `min` lower proportionally, not uniformly.
- **Bound every clamp.** A `min` keeps headings legible on tiny screens; a `max` stops them
  ballooning on wide monitors. Unbounded `vw` type is a defect.
- **Re-check rhythm at the extremes.** A fluid size whose line-height ratio is fixed can drift
  off rhythm at the min or max; verify the leading still works at both ends, or step the
  line-height too.
- **Body text barely needs it.** Keep body near a fixed `1rem`; fluid type pays off on
  headings/display, not paragraphs.

When a clean clamp can't preserve hierarchy and rhythm across the range, fall back to a couple
of stepped breakpoint overrides — correctness beats cleverness.

## Variable fonts

- **Axes:** `wght` (weight), `opsz` (optical size — heavier/lower-contrast at small sizes,
  finer at display), `wdth` (width). Use `font-optical-sizing: auto` so `opsz` tracks the size.
- **One variable file vs many static weights:** a single variable file that covers 300–700 is
  usually fewer bytes than 4–5 static weights *and* gives every weight in between. Prefer it —
  but confirm the byte verdict with `bundle-analysis`, which owns that call.
- Only ship the axes you use; an unused `wdth` axis is dead weight.

## Font loading — kill FOIT and CLS

The failure modes: **FOIT** (invisible text while the font loads) and **CLS** (the swap shifts
layout because the fallback has different metrics). Strategy:

1. **Self-host the critical face** (don't depend on a third-party origin in the critical path)
   and **`<link rel="preload">`** the one weight used above the fold.
2. **`font-display: swap`** so text renders immediately in the fallback (never `block`/`auto`,
   which risk FOIT). Use `optional` for non-critical/decorative faces so a slow network simply
   skips them.
3. **Metric-match the fallback** with `size-adjust`, `ascent-override`, `descent-override` on an
   `@font-face` for the local fallback, so the swap from fallback → web font causes *no* reflow.
   This is the single most effective CLS fix for fonts.
4. **Subset** to the scripts/glyphs actually used (e.g. Latin), and prefer `woff2`.

```css
@font-face {
  font-family: "Inter fallback";
  src: local("Arial");
  size-adjust: 107%;            /* tune so the fallback's metrics match the web font */
  ascent-override: 90%;
}
```

Then hand the result to `perf-budget-check` (does it hit the LCP/CLS budget at p75) and
`bundle-analysis` (font bytes in the route weight). This skill owns *how to load*; those own
*whether the cost is acceptable*.
