---
name: shadcn-compose
description: >
  Build interactive UI behavior — dialogs, dropdown/context menus, comboboxes, popovers,
  sheets, tooltips — by composing shadcn/ui (Radix) primitives via the CLI, never by
  hand-rolling open state, focus traps, escape handling, or ARIA. Adds the component to
  src/components/ui with the CLI, then wires it with project tokens and all four states.
  Use when: "add a dialog", "use shadcn", "combobox", "dropdown menu", "modal".
  Do NOT use for: accessibility audit of the result (use a11y-gate), token/styling decisions
  for the component (use tailwind-v4-component-style), building the full data+form slice
  around it (use vertical-slice).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the "hand-built interactive widget" failure class: bespoke
    open state, missing focus trap / escape / ARIA, reinvented Radix. Baseline section is the
    encoded failure class; replace with an observed transcript.
---

# shadcn-compose

The decided stack builds every interactive widget by composing shadcn/ui primitives (Radix
underneath), never by hand. This skill turns a request like "add a delete-confirm dialog"
into the right CLI add + a composed component that inherits Radix's focus management,
keyboard handling, and ARIA — wired to project tokens and rendering all four states.

The spine (UI primitives) and the nine rules live in `../../CLAUDE.md`; this skill obeys them
and does not restate them. It exists because a hand-built dialog compiles, renders, and demos
fine while silently failing keyboard and screen-reader users.

---

## Non-Negotiable Rules

The failure here ships in the generated component itself, so these are hard:

- **Never hand-build behavior a primitive owns.** No bespoke `useState` open/close with a
  manual backdrop, no DIY focus trap, no manual `keydown` Escape handler, no hand-written
  `role`/`aria-*` for menus or listboxes. Use the Radix-backed primitive (`Dialog`,
  `DropdownMenu`, `Popover` + `Command` for combobox, `Sheet`, `Tooltip`).
- **Never re-style internals with raw values.** Variants and spacing come from project tokens
  (Rule 3); pass `className` with token utilities, do not patch in hex or arbitrary `px`.
- **Never skip the trigger/portal/content composition Radix expects.** A `DialogContent`
  without `DialogTitle` (even visually hidden) breaks the accessibility contract; a combobox
  needs `Popover` + `Command`, not a styled `<input>` with a `<div>` list.
- **Never ship a data-driven instance without its four states** (Rule 4) — a combobox loading
  its options, an empty result set, a fetch error, and the populated list.

Refuse these rationalizations: "it's just a small modal, a div is faster"; "I'll add the
focus trap later"; "Radix is overkill for a dropdown"; "the title isn't needed, it's obvious".

---

## When to Use

- Adding any overlay or transient surface: modal/dialog, alert-dialog, sheet/drawer, popover,
  tooltip, hover-card.
- Adding any menu or selection widget: dropdown menu, context menu, command palette, combobox,
  select, multi-select.
- Replacing a previously hand-rolled interactive widget with the composed primitive.

## When NOT to Use

- Auditing the accessibility of what you built → `a11y-gate` (this skill composes correctly;
  the gate verifies it against axe + manual WCAG 2.2 AA).
- Deciding the tokens, variants, or visual styling of the component → `tailwind-v4-component-style`.
- Wiring the Drizzle → tRPC → Zod → RHF data/form chain the widget sits in → `vertical-slice`.
- Generating the token foundation the component consumes → `design-tokens`.

---

## Procedure

1. **Pick the primitive, do not invent one (low-interrogation).** Map the request to a real
   shadcn component: confirm → `alert-dialog`; form-in-overlay → `dialog`; mobile/side panel →
   `sheet`; type-to-filter select → `popover` + `command` (combobox); right-click → context
   menu. See `references/primitive-map.md` for the full mapping and anti-patterns.
2. **Add it via the CLI, never paste from memory.** Run `npx shadcn@latest add <name>` so the
   versioned source lands in `src/components/ui/`. If the file already exists, reuse it — do
   not duplicate. Record any registry/style fork in `DECISIONS.md`.
3. **Compose the required parts.** Assemble trigger + portal + content with the parts Radix
   expects (e.g. `DialogTrigger`/`DialogContent`/`DialogTitle`/`DialogDescription`). See
   `references/composition-patterns.md` for copy-correct skeletons of each widget.
4. **Style only through tokens (Rule 3).** Use `cn()` and token utilities for any override;
   never inline hex or arbitrary `px`. Defer real styling decisions to
   `tailwind-v4-component-style`.
5. **Control state at the right layer.** Prefer uncontrolled (`defaultOpen`) unless the parent
   must drive it (e.g. open-on-mutation-success); then lift to `open`/`onOpenChange`. Keep the
   trigger as `asChild` so semantics stay on a real `<button>`. See `references/composition-patterns.md`.
6. **Render all four states for data-driven instances (Rule 4).** A combobox/command palette
   that fetches options must show loading, empty (`CommandEmpty`), error, and results — and a
   pending/disabled state on any action button inside a dialog. Boundary inputs stay Zod-parsed
   (Rule 8); no secrets reach the client component (Rule 9).
7. **Hand off to the gate.** Run `a11y-gate` on the rendered result for keyboard-trap, focus
   return, and labeling verification axe and manual review catch.

---

## Composes With

- **Consumes:** `design-tokens` (the `@theme` tokens the primitive is styled with).
- **Pairs with:** `tailwind-v4-component-style` (styles the composed primitive), `vertical-slice`
  (provides the data/form the widget surfaces).
- **Hands off:** `a11y-gate` (verifies the composed result against WCAG 2.2 AA).
- **Runs against:** `rule-audit` for Rules 3, 4, 8, 9 on the component diff.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent told to implement as
> a typical dev would, with no project conventions). The encoded failure class was confirmed.

**Observed run.** Prompt: "Add an account dropdown menu to the navbar showing the user's name,
avatar, and links to account/billing/sign-out." With no skill the agent produced:

```ts
const [open, setOpen] = useState(false);
useEffect(() => {
  function handler(e: MouseEvent) {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
  }
  document.addEventListener("mousedown", handler);
  return () => document.removeEventListener("mousedown", handler);
}, []);
// ...
<span className="text-sm font-medium" style={{ color: "#111827" }}>{user.name}</span>
{open && (
  <div className="absolute right-0 mt-2 w-48 ..." style={{ padding: "8px" }}>
    <a href="/account" className="block px-3 py-2 ...">Account settings</a>
```

Its own note: *"Hand-rolled dropdown with useState + outside-click useEffect instead of pulling
in a primitives library."* — this is exactly the hand-built interactive widget the UI-primitives
spine forbids: a `div`-based menu with no `role="menu"`/`menuitem`, no focus trap, no
Escape-to-close, and no arrow-key navigation, plus hardcoded `#111827` and arbitrary `8px`
inline styles that violate Rule 3 and a happy-path-only render that assumes `user` is always
present (violates Rule 4).

**Failure class (confirmed).** The quick path for any overlay or menu is to reach for
`useState` + a manual outside-click handler over plain `div`/`a` markup, which demos fine with a
mouse but is invisible and unreachable for keyboard and screen-reader users — and it drags in
sibling defects (inline hex/px instead of tokens, no four-state handling, raw `<a>`/`<img>` over
`next/link`/`next/image`). Composing the Radix-backed shadcn primitive instead makes the widget
accessible by construction and keeps styling on tokens.

---

## Examples

**Input:** "Add a dialog to confirm deleting a project."
**Output:** Maps confirm → `alert-dialog`; runs `npx shadcn@latest add alert-dialog`; composes
`AlertDialog` + `AlertDialogTrigger asChild` + `AlertDialogContent` with `AlertDialogTitle`/
`AlertDialogDescription` and `AlertDialogAction`/`AlertDialogCancel`; controls `open` from the
parent so it closes on mutation success and shows a pending state on the action button while
the tRPC delete runs; styling left to `tailwind-v4-component-style`; hands to `a11y-gate`.

**Input:** "I need a combobox to pick a customer, options come from the API."
**Output:** Maps to `popover` + `command`; adds both via CLI; composes `Popover` →
`PopoverTrigger asChild` (a `role="combobox"` button) → `PopoverContent` containing `Command`
with `CommandInput`, `CommandList`, `CommandEmpty` (empty state), and `CommandItem`s; renders
loading (skeleton items), error, and results from the tRPC query (Rule 4); query input Zod-
parsed (Rule 8). No reinvented keyboard handling.

**Input:** "Just throw a quick modal in with a div, the dialog component is overkill."
**Output:** Refuses: "Interactive overlays are never hand-built in this stack (CLAUDE.md, UI
primitives). A bare div has no focus trap, Escape, focus return, or ARIA. I'll add the shadcn
`dialog` instead — same effort, accessible by construction."

---

## Edge Cases

- **The needed widget isn't in the shadcn registry** → compose the underlying Radix primitive
  directly (still not hand-built) and record the choice in `DECISIONS.md`; do not roll your own
  open/focus logic.
- **Two overlays must stack (dialog opening a popover)** → keep each in its own portal and let
  Radix manage layered focus/escape; do not nest a hand-built layer to "simplify".
- **Tooltip used to convey essential info** → tooltips are hover/focus-only and not reliable
  for critical content; move it to visible text or a popover, then send to `a11y-gate`.
- **Combobox over thousands of rows** → virtualize the `CommandList` and keep server-side
  filtering (Rule 7), still composing `Command`.

---

## References

- `references/primitive-map.md` — request → shadcn primitive mapping, with the hand-built
  anti-pattern each one replaces.
- `references/composition-patterns.md` — copy-correct skeletons for dialog, alert-dialog,
  dropdown menu, combobox, and sheet, with controlled-state and four-state wiring.

## Scripts

- Reserved. Justified once a reliable AST check can flag hand-rolled overlays (a fixed `div`
  backdrop + `useState` open with no `@radix-ui` import in the file); until then `rule-audit` +
  `a11y-gate` cover the diff. `scripts/.gitkeep` holds the slot.
