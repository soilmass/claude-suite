# Choreography, transitions, and micro-interactions

When more than one thing moves, *order and timing relationships* carry the meaning. This is the
difference between motion that reads as cause-and-effect and motion that reads as chaos.

## Choreography rules

- **Stagger collections.** List, grid, and menu items animate in with a per-item delay of
  ~20–50ms so they cascade rather than flash in as one block. The cascade also guides the eye in
  reading order. Keep the total cascade short — cap the stagger so the last item isn't
  noticeably late (long lists: stagger only the first ~6–8, then show the rest).
- **Parent before child.** A container settles first, then its contents animate within it. The
  reverse (children before their frame) reads as broken.
- **Enter/exit asymmetry.** Entrances can take their time (the user is about to engage with the
  thing); exits should be ~20–30% faster (the user is done — don't make them wait for it to
  leave). Entrances decelerate (`ease-out`), exits accelerate (`ease-in`).
- **Follow-through / overlap.** Related elements don't all stop on the same frame; a slight
  overlap (the label settling just after its card) makes motion feel organic. Use sparingly.
- **Never everything-at-once.** If the whole screen animates on one curve at one time, nothing
  leads and nothing follows — the result is noise. Sequence by importance.

## Transitions between views (spatial continuity)

- **Shared-element / view transitions.** When the same object exists before and after a
  navigation (a thumbnail expanding into a detail header), animate it as *one persistent
  object* moving, not two separate fades. The browser View Transitions API expresses this in
  the App Router; fall back to a plain cross-fade where it isn't available.
- **Route transitions stay short and non-blocking.** Page-level changes live in the
  `320–500ms` band at most, never gate interaction, and must be interruptible. Do **not**
  animate the LCP element or layout-shifting content *in* — animate opacity only or defer the
  transform until after paint, and hand the LCP/INP verdict to `perf-budget-check`.
- **Direction implies hierarchy.** Forward/deeper slides in from one side, back/up reverses it;
  keep the spatial model consistent so users build a mental map.

## Micro-interactions (the trigger → rules → feedback → loops model)

Every small interaction has four parts; design each deliberately:

- **Trigger** — what starts it (hover, press, focus, data arriving).
- **Rules** — what happens and under what conditions.
- **Feedback** — the immediate, perceptible response: a press scale of ~0.97, a token color
  shift on hover, a focus ring appearing. Feedback must be *immediate* (within the instant
  band) even if the result takes longer.
- **Loops/modes** — what repeats or persists (a pulsing skeleton while loading, a spinner's
  cycle).

Concrete patterns:

- **Press feedback** — scale to ~0.96–0.97 on `:active`, return on release; confirms the tap
  registered.
- **Optimistic UI** — animate the expected end-state immediately on action, reconcile when the
  server responds (pairs with the `optimistic-updates` skill).
- **Loading → loaded** — resolve the skeleton into real content rather than swapping abruptly;
  the skeleton's shape should match the final layout so there's no jump (ties to Rule 4 states).
- **Meaning test** — if a micro-interaction doesn't confirm an action, show a state change, or
  express a spatial relationship, it's decoration; remove it.
