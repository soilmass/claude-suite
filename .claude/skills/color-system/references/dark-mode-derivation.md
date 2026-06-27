# Dark-mode derivation (a procedure, not an invert)

The decided format keeps dark mode as a re-chosen `@theme` block (CLAUDE.md / design-tokens).
This is *how* to choose those values. The failure to avoid: `L → 1 − L` inversion, which
produces a glaring, over-saturated dark theme with broken contrast and hue shifts.

## Why invert fails

- A light theme's near-white background (`L≈0.99`) inverts to near-black (`L≈0.01`) — pure
  black is harsh and makes shadows impossible. Dark UIs want an elevated-off-black surface.
- Chroma that looks calm on a light surface **vibrates** on a dark one (simultaneous-contrast
  and the Helmholtz–Kohlrausch effect): the same saturated blue glows and strains on black.
- Inversion flips foreground/background luminance but not the *perceptual* relationships, so
  contrast ratios land arbitrarily — some too low, some uncomfortably high.

## The derivation

1. **Re-anchor the surface ladder into the dark band.** Backgrounds and surfaces move to
   `L ≈ 0.15–0.25`, ascending slightly with elevation (page `≈0.15`, card `≈0.19`, popover
   `≈0.23`). Keep the same low tinted-neutral chroma as light mode so neutrals stay tinted.
2. **Lift foregrounds, don't slam to white.** Primary text `L ≈ 0.92–0.96` (not `1.0` — pure
   white on dark over-glows); muted text `L ≈ 0.68–0.74`. Re-check each against its surface.
3. **Reduce chroma on saturated roles ~15–30%.** Primary/accent/status keep their hue but
   shed chroma so they sit calmly on the dark surface. Often also nudge lightness *up* a little
   so the role still reads as itself against the lighter-foreground context.
4. **Re-pick foregrounds on colored fills.** A role that took white text in light mode may need
   a dark `-foreground` in dark mode, or vice-versa — decide per role, don't assume.
5. **Borders shift from "darker than surface" to "lighter than surface."** In light mode a
   border is a step down in L; in dark mode it is a step *up* (`L ≈ 0.30–0.36`), because
   separation on dark comes from a lighter line.
6. **Re-run `contrast.mjs` on every dark pair.** Dark mode is a second palette with its own
   failures: fg-on-bg, primary-fg-on-primary, muted-on-bg, border visibility. A pair that
   passed in light mode tells you nothing about its dark twin.
7. **Re-run `cvd-check.mjs` on the dark status/categorical set.** Reducing chroma can pull two
   status colors closer together; confirm they stay separable.

## Quick reference target bands (OKLCH L)

| Token            | Light L | Dark L  |
|------------------|---------|---------|
| background       | 0.99    | 0.15    |
| surface/card     | 0.98    | 0.19    |
| popover/elevated | 0.97    | 0.23    |
| border           | 0.90    | 0.32    |
| muted-foreground | 0.55    | 0.70    |
| foreground       | 0.20    | 0.95    |

Saturated roles (primary/accent/status): keep hue, cut chroma ~15–30%, nudge L up as needed,
then re-contrast and re-CVD. These are starting points to verify, not values to ship unchecked.
