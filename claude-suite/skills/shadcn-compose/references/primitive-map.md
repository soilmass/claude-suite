Purpose: map a UI request to the correct shadcn/ui primitive and name the hand-built anti-pattern it replaces.

# Request → primitive map

Add each via the CLI: `npx shadcn@latest add <name>`. The file lands in
`src/components/ui/<name>.tsx`. Reuse if it already exists; never paste from memory.

| Request / phrase | shadcn component(s) | Radix under the hood | Hand-built anti-pattern it replaces |
| --- | --- | --- | --- |
| "modal", "dialog", form-in-overlay | `dialog` | `@radix-ui/react-dialog` | `useState` + fixed `div` backdrop, no focus trap |
| "confirm", "are you sure", destructive action | `alert-dialog` | `@radix-ui/react-alert-dialog` | `window.confirm` or a bespoke modal |
| "dropdown menu", "actions menu", kebab `⋯` | `dropdown-menu` | `@radix-ui/react-dropdown-menu` | `div` list toggled by state, no roving focus |
| "right-click menu" | `context-menu` | `@radix-ui/react-context-menu` | `onContextMenu` + custom positioned `div` |
| "combobox", "type to filter and pick" | `popover` + `command` | Popover + `cmdk` | styled `<input>` over a `<div>` list |
| "command palette", "⌘K" | `command` (+ `dialog` for the modal form) | `cmdk` | hand-rolled fuzzy search + key handling |
| "select", "pick one from a fixed list" | `select` | `@radix-ui/react-select` | native `<select>` restyled, or a fake one |
| "side panel", "drawer", mobile nav | `sheet` | `@radix-ui/react-dialog` (side variant) | off-canvas `div` with manual transform |
| "popover", "click to reveal a panel" | `popover` | `@radix-ui/react-popover` | absolutely-positioned `div`, no dismiss-outside |
| "tooltip", "hover hint" | `tooltip` | `@radix-ui/react-tooltip` | `title` attr or a CSS-only hover `div` |
| "hover card", "preview on hover" | `hover-card` | `@radix-ui/react-hover-card` | tooltip overloaded with rich content |
| "tabs" | `tabs` | `@radix-ui/react-tabs` | buttons toggling `display` with no `role=tab` |
| "accordion", "collapsible FAQ" | `accordion` | `@radix-ui/react-accordion` | `useState` height toggle, no `aria-expanded` |
| "toast", "notification" | `sonner` (suite default) | — | a self-managed array of fixed `div`s |

## Decision notes

- **Dialog vs. alert-dialog:** use `alert-dialog` whenever the user must explicitly confirm or
  cancel (it traps focus and has no outside-click dismiss by default — correct for destructive
  flows). Use `dialog` for general content/forms.
- **Combobox is not one component.** shadcn's combobox is the documented composition of
  `Popover` + `Command`. There is no `combobox` to `add`; add `popover` and `command`.
- **Sheet is the dialog primitive with a side variant** — same accessibility contract; do not
  hand-build a drawer.
- **Tooltip is hover/focus-only.** Never put essential or interactive content in a tooltip;
  promote to a `popover` or visible text. Flag to `a11y-gate`.

## Why composition, not hand-building

Radix gives you, for free and correctly: focus trap + restore, `Escape` to close,
outside-click dismiss, scroll-lock, `aria-modal`/`role`/labelled-by wiring, roving tabindex
and `aria-activedescendant` for menus/listboxes, typeahead, and RTL. Every one of these is a
common, silent hand-built defect (see SKILL.md baseline). Composing is less code and passes
`a11y-gate` by construction.
