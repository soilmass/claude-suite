# Easing families and the duration bands

How to choose motion's two core variables — the curve and the time — by what the element is
doing, not by feel. Everything here feeds easing/duration values to `design-tokens`; nothing
here emits tokens.

## Why not `linear`

A `linear` curve moves at constant velocity, which nothing in the physical world does — it
reads as mechanical and cheap. Real objects accelerate and decelerate, so eased motion reads
as natural. The curve carries as much meaning as the duration: it tells the eye whether
something is arriving, leaving, or passing through.

## The four easing families (map to the `--ease-*` tokens)

Pick the family from the element's **verb**:

| Verb / situation              | Family                | Curve feel                         | Token (example)     |
|-------------------------------|-----------------------|------------------------------------|---------------------|
| Entering / appearing          | decelerate (`ease-out`) | fast in, eases to rest             | `--ease-out`        |
| Leaving / dismissing          | accelerate (`ease-in`)  | starts slow, speeds away           | `--ease-in`         |
| Moving between two on-screen points | standard (`ease-in-out`) | eases at both ends           | `--ease-standard`   |
| Large / hero / expressive     | emphasized            | strong, slightly overshooting feel  | `--ease-emphasized` |

**Entrances use `ease-out`** — this is the most common case and the one that makes a UI feel
responsive: the element shows up immediately and settles, so the user perceives speed. Material
and Apple's HIG both anchor entrances on a decelerate curve for this reason. **Exits use
`ease-in`** and are shorter — the element is on its way out, so it accelerates away and gets out
of the user's sight quickly.

## Spring vs cubic-bezier

- **cubic-bezier tokens** — deterministic, repeatable, the right default for UI transitions
  (open/close, hover, route change). Easy to standardize as `@theme` variables.
- **springs** — physical, momentum-based; excellent for **drag/gesture and direct
  manipulation** where the user's velocity should carry through. Reach for them there, not for
  ordinary state transitions. Never mix a spring and a bezier inside one interaction.

## The duration bands (map to the `--duration-*` tokens)

| Band        | Reads as          | Use for                                              |
|-------------|-------------------|-----------------------------------------------------|
| `< 100ms`   | instant           | tiny state (checkbox tick), micro-feedback          |
| `100–200ms` | snappy            | hovers, small toggles, button press (~120–160ms)    |
| `200–320ms` | smooth/standard   | dropdowns, accordions, most component transitions   |
| `320–500ms` | deliberate        | large surfaces, sheets, dialogs, page-level changes |
| `> 500ms`   | sluggish (avoid)  | only a hero/empty-state signature, off the hot path |

**The scaling rule: smaller element + shorter distance ⇒ shorter duration.** A toggle flipping
in place is ~120ms; a full-screen sheet sliding up is ~360ms. The same easing at the wrong
duration breaks the illusion — a tiny element at 400ms feels broken; a big surface at 120ms
feels abrupt. Exits run ~20–30% shorter than the matching entrance.

These bands are the rationale behind the `--duration-fast` / `--duration-base` /
`--duration-slow` tokens `design-tokens` emits; choose the token whose band matches the
element, don't invent a raw millisecond value.
