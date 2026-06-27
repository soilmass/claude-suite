# Data-viz palettes and the CVD verification workflow

Chart color has different rules than UI color: many series shown at once, small marks, and a
hard requirement that the encoding survive color-vision deficiency and grayscale print. Three
palette types, each constructed differently.

## Categorical (qualitative) — distinct, unordered series

- Spread hues by **maximum perceptual + CVD distance**, not by even hue spacing. Even spacing
  on the hue wheel collides under dichromacy (red and green sit ~120° apart yet merge for a
  deuteranope).
- Hold **lightness and chroma roughly constant** so no series looks more important than another.
- Cap at **~7 colors.** Past that, distinguishability collapses (especially under CVD); switch
  to grouping, direct labels, or small multiples.
- Verify: `node scripts/cvd-check.mjs <c1> <c2> ...` — every pair must stay ≥ the ΔE threshold
  under normal + protan + deutan + tritan. Fix collisions by spreading **lightness**, which
  survives both CVD and grayscale.

## Sequential — ordered low→high (one hue)

- A single hue with **monotonically changing lightness** end to end; chroma rises gently toward
  the dark end. Lightness does the ordering, so it reads in grayscale and under any CVD.
- Verify: `node scripts/cvd-check.mjs --ramp <light> ... <dark>` — fails on any step that
  reverses or flattens lightness.

## Diverging — two hues around a neutral midpoint

- Two sequential ramps meeting at a light neutral middle (e.g. blue ↔ neutral ↔ red). Each arm
  must be **monotonic in lightness** out from the center, and the two end hues must themselves
  be CVD-distinguishable (blue/red survive; red/green do not).
- Verify each arm with `--ramp`, and the two endpoints with a categorical check.

## The rule that color can't carry alone

Never encode meaning by color only — WCAG 1.4.1 and plain craft. Every series/category also
carries a **direct label, icon, or pattern**; status colors in UI carry an icon + text. Color
is the redundant, fast channel, not the sole one. This is why `cvd-check.mjs` is a floor, not a
guarantee: passing it means "color helps," not "color suffices."

## How cvd-check fits with contrast.mjs

They answer different questions and neither replaces the other:

- `contrast.mjs` (in `design-tokens`): **readability** — luminance ratio of a fg/bg pair vs
  WCAG AA. "Can you read the text."
- `cvd-check.mjs` (here): **distinguishability** — perceptual OKLab distance between two
  *meaningful* colors under each dichromacy, and monotonic lightness for ramps. "Can you tell
  the two apart."

A palette must pass both. The sanity demonstration: two colors can pass contrast on white and
still register ΔE ≈ 0.01 under deuteranopia — readable, indistinguishable. `design-tokens` runs
the readability gate; this skill runs the distinguishability gate; `a11y-gate` owns the WCAG
contrast floor at done-time.
