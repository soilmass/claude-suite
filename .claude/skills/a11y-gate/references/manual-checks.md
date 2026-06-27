# Manual WCAG 2.2 AA checks (what axe cannot detect)

axe catches ~30-40% of WCAG issues. These need a human with a keyboard and a screen
reader. Run them every time; "axe-clean" is not "accessible" without them.

## Keyboard (no mouse)
- [ ] Every interactive element reachable by Tab, in a logical order.
- [ ] Focus is always visible (a real focus ring, not `outline: none`).
- [ ] No keyboard trap — you can Tab out of every widget.
- [ ] Custom controls (dropdowns, dialogs, menus) operate by keyboard the way the native
      equivalent would (Esc closes, arrows navigate, Enter/Space activate).
- [ ] Dialogs/menus trap focus while open and restore it on close.

## Screen reader (meaning, not just presence)
- [ ] Alt text is *meaningful*, not present-but-empty or "image". Decorative images are
      `alt=""` intentionally.
- [ ] Reading order matches visual order.
- [ ] Form fields have programmatic labels, and errors are tied to their field and
      announced.
- [ ] Headings form a logical outline (no skipped levels used for styling).
- [ ] Dynamic updates (toasts, async results) are announced via live regions.

## WCAG 2.2 additions worth a manual look
- [ ] Focus not obscured by sticky headers/footers (2.4.11).
- [ ] Dragging actions have a non-drag alternative (2.5.7).
- [ ] Target size adequate for touch (2.5.8).

## Content
- [ ] Contrast verified on real rendered pairs (axe catches most, but check overlays,
      gradients, text-on-image which it can miss).
- [ ] Meaning isn't carried by color alone.

If there's no environment to run axe, this list IS the gate — walk it against the markup
and flag that machine coverage didn't run.
