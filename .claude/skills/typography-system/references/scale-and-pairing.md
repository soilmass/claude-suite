# Modular scale ratios and font pairing

How to choose the scale and the families with intent, instead of hand-picking px and fonts.
Everything here feeds `rem` values and family roles to `design-tokens`; nothing here emits
tokens.

## The modular scale (one ratio, `1rem` base)

Every size is `1rem × ratio^n`. One ratio gives the whole scale a consistent relationship, so
the hierarchy holds even when the user changes their root font size.

| Ratio | Name            | Feels                | Use for                                  |
|-------|-----------------|----------------------|------------------------------------------|
| 1.125 | Major second    | subtle, compact      | very dense tables, dashboards            |
| 1.2   | Minor third     | tight, calm          | product UI with many coexisting sizes    |
| 1.25  | Major third     | balanced (the default) | general apps, the design-tokens default |
| 1.333 | Perfect fourth  | confident hierarchy  | content sites, docs                      |
| 1.414 | Augmented fourth| dramatic             | editorial                                |
| 1.618 | Golden          | expressive, large jumps | marketing, landing pages              |

**Choosing:** the more sizes that must coexist on one screen, the *tighter* the ratio — wide
ratios create big gaps that collide in dense UI. Dense/data → 1.125–1.2. General product →
1.25. Editorial/marketing → 1.333–1.618.

**Why `rem`, not px.** `rem` is relative to the root, so the scale honors the user's browser
font-size preference (an accessibility floor) and scales as one system. Hardcoded px ignores
that and is a Rule 3 / `design-tokens` violation.

### Mapping to `--text-*` (ratio 1.25 worked example)

```
--text-xs:   0.64rem   /* base / 1.25^2 */
--text-sm:   0.8rem    /* base / 1.25   */
--text-base: 1rem
--text-lg:   1.25rem
--text-xl:   1.5625rem /* base × 1.25^2 */
--text-2xl:  1.953rem
--text-3xl:  2.441rem
```

Hand these to `design-tokens`; it owns the actual `@theme` emission. Generate the full set from
the chosen ratio rather than typing values.

## Font pairing by classification

**Cap at two families** (plus an optional mono for code/figures). One family with optical-size
and weight axes is often *better* than two — prefer it for product UI.

Two approaches when you do pair:

- **Superfamily / single-family:** one type family that ships a display and text optical size
  (or a sans + its serif companion). Guaranteed to harmonize. Safest default.
- **Contrast pairing:** two families from different classifications that share proportions:
  - geometric-sans **display** + humanist-sans **body** (modern, clean),
  - serif **display** + sans **body** (editorial, authoritative),
  - sans **display** + serif **body** (long-form reading with a crisp masthead).

**Make them belong:** match **x-height** (the dominant cue for "do these go together") and
overall proportion/width. A tall-x-height display over a small-x-height body looks mismatched at
shared sizes. Assign each family a **role** — `--font-display`, `--font-body`, `--font-mono` —
never scatter fonts per-section.

**When one family is enough:** product UIs with optical sizing, anything where the brand voice
is "neutral and competent." Reach for a second family only when the register genuinely needs
two voices (a distinct editorial headline).
