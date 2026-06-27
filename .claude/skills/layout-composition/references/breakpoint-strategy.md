# Breakpoint strategy — break on content, not on devices

How to decide *where* responsive layouts change. Judgment that produces breakpoint values for
`design-tokens` to emit. The failure to avoid: copying a list of device widths and hoping.

## The core principle

**Add a breakpoint where the content breaks, not where a device happens to be.** Resize the
layout slowly and watch: the breakpoint is the width where the design *visibly stops working* —

- the text measure grows past ~75ch and lines become hard to track,
- a column has room to split into two (or a third card fits),
- a side rail finally has space to sit beside the content instead of above it,
- a horizontal nav runs out of room and needs to collapse.

Those are content events. "768px because tablet" is not — the same content might break at 640 or
920 depending on the type size and column count. Device-width breakpoints produce awkward
mid-range states precisely because they ignore what the content is doing.

## Mobile-first

Design the single-column small view first, then add breakpoints *upward* as space appears. This
is both a Tailwind idiom (unprefixed = base, `md:` etc. layer up) and a discipline: the hardest,
most constrained layout is solved first, and wider screens are progressive enhancement, not an
afterthought squeezed down.

## Tailwind defaults are a starting point

Tailwind ships `sm/md/lg/xl/2xl` (640/768/1024/1280/1536). They're a reasonable *default*, not a
spec. Override them in the `@theme` breakpoint variables when the content says so — and resist
adding many custom breakpoints. Each one is a state you must design, test, and maintain. Two or
three well-chosen breakpoints beat six arbitrary ones.

## Container queries for component-level responsiveness

A breakpoint responds to the *viewport*; a container query responds to the *component's own
width*. When a card, table, or widget must look right whether it's in a wide main column or a
narrow sidebar, the right tool is a container query, not a viewport breakpoint — the component
adapts to its slot regardless of screen size. Use viewport breakpoints for *page* structure and
container queries for *component* structure; mixing them up is why a component "works on the page
but breaks in the rail."

## A quick checklist

- Did each breakpoint come from a content event you can name? If not, delete it.
- Is the smallest view designed first and complete on its own?
- Is the text measure capped so wide screens don't stretch lines past readability?
- Could a container query replace a viewport breakpoint here and make the component reusable?
