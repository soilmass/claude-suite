# Harmony families, the chroma curve, and the semantic role taxonomy

How to construct hues with intent in OKLCH, instead of picking them by eye. Everything here
feeds OKLCH values to `design-tokens`; nothing here emits tokens or checks contrast.

## Harmony families as hue offsets (OKLCH H, degrees)

Pick the family from the brand's character, then place every other hue by *angle* from the
primary hue `Hp`, not by eye:

| Family               | Where the others sit            | Feels                         |
|----------------------|---------------------------------|-------------------------------|
| Monochrome           | only `Hp`, vary L and C         | calm, minimal, safe           |
| Analogous            | `Hp ± 30°` (max ±40°)           | harmonious, low-tension       |
| Complementary        | `Hp + 180°`                     | high contrast, energetic      |
| Split-complementary  | `Hp + 150°`, `Hp + 210°`        | contrast with less tension    |
| Triadic              | `Hp ± 120°`                     | vibrant, balanced, playful    |

OKLCH hue is perceptual, so these offsets behave consistently across lightness — unlike HSL,
where "+180°" can change perceived hue. The accent role is normally the first non-primary
angle in the chosen family.

## Chroma is a function of lightness (the curve)

A role is one hue across a lightness ramp. Chroma must **peak in the mid-tones and fall off at
both ends** — flat chroma makes light tints look muddy and dark shades vibrate/clip out of
gamut. Approximate target chroma as a fraction of the role's peak chroma `Cmax`:

| Lightness L | Chroma (× Cmax) | Note                                            |
|-------------|-----------------|-------------------------------------------------|
| 0.97        | 0.10            | near-white tint; almost neutral                 |
| 0.90        | 0.25            |                                                 |
| 0.80        | 0.45            |                                                 |
| 0.65        | 0.80            |                                                 |
| 0.55        | 1.00 (peak)     | the "true" role color; actions live here        |
| 0.45        | 0.95            |                                                 |
| 0.30        | 0.60            | shed chroma or it clips / looks neon on dark     |
| 0.18        | 0.35            |                                                 |

Keep hue near-constant down the ramp, nudging a few degrees only to counter perceived hue
shift at the extremes (blues skew purple when very dark; yellows skew green when very light).

## Neutrals are tinted, not gray

Build the neutral/surface ramp at (or very near) the primary hue with very low chroma
(`C ≈ 0.005–0.02`). A neutral that carries a trace of the brand hue reads as part of the
system; a pure `oklch(L 0 0)` gray reads as a default. Backgrounds, surfaces, borders, and
muted text all come from this tinted-neutral ramp.

## Ramp step counts

- **Roles used as fills + text (primary, accent, status):** 9–11 steps (e.g. 50–950) so there
  is always a step for a fill, a hover, a border, and an on-color foreground.
- **Neutrals:** 11–12 steps — you need fine control near both ends (page bg vs card vs border).
- Each consecutive pair that can co-occur as fg/bg is a `contrast.mjs` candidate in
  `design-tokens`.

## The semantic role taxonomy (when a role earns its place)

Roles are assigned by **meaning**, not by how many colors you like. Required spine:

- `background` / `surface` / `border` — tinted-neutral ramp.
- `foreground` / `muted-foreground` — text on those surfaces.
- `primary` + `primary-foreground` — the main brand action.
- `accent` + `accent-foreground` — secondary emphasis (the harmony's second hue).

The **status set**, each with a paired `-foreground`, at canonical hues so they read as
universal:

| Role     | Hue (approx) | Meaning                          |
|----------|--------------|----------------------------------|
| success  | 145° green   | completed, valid, safe           |
| warning  | 80° amber    | caution, needs attention         |
| danger   | 25° red      | destructive, error, blocked      |
| info     | 240° blue    | neutral notice (distinct from primary if primary is blue) |

Add a role only when a distinct meaning is unserved (e.g. a separate `discovery`/`new` accent).
Don't mint `tertiary`, `quaternary` with no meaning attached — that is how palettes rot.
Record any non-obvious role decision in `DECISIONS.md`.

A status color must never be the *only* signal — pair with an icon/label (see
`data-viz-and-cvd.md` and Rule 4 component states). `cvd-check.mjs` proves the status set stays
separable under the three dichromacies.
