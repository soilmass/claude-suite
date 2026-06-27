# Visual hierarchy and density

How to compose a layout a user can read in a glance, and how to tune its density to its job.
Judgment, not a mechanical check. Pairs with `design-tokens` (type carries much of the
hierarchy) and feeds spacing decisions to `design-tokens`.

## The five tools of hierarchy

A hierarchy tells the eye what matters and where to go next. You have five levers:

1. **Space** — proximity and isolation. The strongest and most underused. Surrounding one element
   with space promotes it more reliably than enlarging it.
2. **Contrast** — light/dark, color, filled vs outline. A single high-contrast element wins the
   page; spend that budget once.
3. **Size** — bigger reads as more important, but it is the *blunt* tool. Reach for space and
   contrast first; oversize headings are the amateur tell.
4. **Weight** — bold vs regular separates a label from its value without changing size.
5. **Position** — top and left lead (in LTR reading); the optical center sits slightly above true
   center. What's first in the DOM should usually be first in importance.

Lean on **space and contrast before size**. A flat layout where everything competes is usually
oversize-everything; the fix is more space and one clear contrast, not bigger type.

## Grouping (Gestalt)

- **Proximity:** elements near each other read as a group; the gap *between* groups must clearly
  exceed the gap *within* a group, or the grouping is ambiguous.
- **Similarity:** shared shape/color/size implies "same kind." Use it for lists and categories.
- **Common region:** a card/background unifies its contents — but a shared region you didn't
  intend (an accidental box) groups things you meant to separate.

## Tests that catch a broken hierarchy

- **The squint test.** Blur your eyes (or the screenshot). The lead element and the grouping
  should still be obvious as light/dark masses. If everything turns to uniform gray, there is no
  hierarchy.
- **One primary action per view.** Exactly one element should be the loudest call to action.
  Two primary buttons is zero primary buttons.
- **Scan path.** Text-heavy pages scan in an **F**; landing/marketing in a **Z**. Place the lead,
  the value prop, and the CTA on that path, not wherever they happened to land.

## Density modes

Density is not one slider — it moves spacing, line-height, and target size *together*:

| Mode        | Use for                          | Spacing | Line-height | Row/target          |
|-------------|----------------------------------|---------|-------------|---------------------|
| Comfortable | marketing, content, onboarding   | airy    | 1.5–1.7     | large, generous     |
| Compact     | app shells, settings, forms      | medium  | 1.4–1.5     | standard            |
| Dense       | data tables, dashboards, IDE-like| tight   | 1.3–1.4     | small rows          |

Rules that hold across modes:

- **Comfortable touch targets.** On touch, interactive targets default to ~44–48px even in dense
  mode — shrink the row, not the tap area. The WCAG 2.5.8 24px *minimum* is a conformance floor
  `a11y-gate` enforces; this skill owns the *comfortable* default above it.
- **Density is a property of the surface, not the element.** Pick the mode for the page's job;
  don't mix a dense table with marketing-airy controls in the same view without intent.
- **Whitespace is active.** Empty space is the tool doing the grouping and the breathing; it is
  never "wasted" or "to be filled later."
