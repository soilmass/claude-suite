# color-system scripts

## cvd-check.mjs — CVD distinguishability + viz-ramp monotonicity gate

```
# categorical/status set — every pair must stay distinguishable under all three dichromacies
node cvd-check.mjs "oklch(0.62 0.19 256)" "#e11d48" "oklch(0.7 0.17 145)"
node cvd-check.mjs --min 0.12 <colors...>

# sequential / diverging viz ramp — lightness must be monotonic
node cvd-check.mjs --ramp "oklch(0.97 0.02 256)" "oklch(0.8 0.09 256)" "oklch(0.5 0.2 256)"
```

Accepts hex or `oklch(L C H)` (L as 0..1 or %).

**What it checks.** Categorical mode simulates protanopia / deuteranopia / tritanopia (Machado
et al. 2009 severity-1.0 matrices, applied in linear sRGB) and reports any color pair whose
perceptual distance (OKLab ΔE) drops below the threshold under any simulation — i.e. two colors
a color-blind viewer cannot tell apart. Ramp mode asserts the lightness sequence is monotonic
so the encoding survives grayscale and CVD.

**Threshold.** Default ΔE `0.10`, well above the ~0.02 just-noticeable-difference — categorical
swatches need to be obviously distinct, not barely. Tune with `--min`.

**Exit code** = number of failures (collapsing pairs, or non-monotonic steps); `0` = clean;
`2` = bad input/usage.

**Why it is not contrast.mjs.** `contrast.mjs` (in `design-tokens`) measures *readability* — a
fg/bg luminance ratio vs WCAG AA. This measures *distinguishability* — whether two meaningful
colors stay separable for a CVD viewer. They are orthogonal: a pair can pass contrast on the
background and still collapse to one color under deuteranopia. Run both. Verified behavior:
a high-contrast red/green pair that each pass AA-large on white fail this check at ΔE ≈ 0.013
under deuteranopia.

**Limit.** Passing means color *helps* distinguish; it never licenses color as the sole
encoding. Pair every category/status with a label, icon, or pattern (WCAG 1.4.1).
