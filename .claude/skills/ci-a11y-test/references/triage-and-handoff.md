Purpose: how to read axe output, where automated coverage ends and `a11y-gate` begins, the rules for a justified suppression, and the contrast→tokens fix path.

# What "0 violations" actually means

Automated axe detects roughly 30–50% of WCAG success criteria — the machine-checkable ones. A
green run means **"no detectable violations,"** not conformance. Saying the app is "WCAG AA
accessible" on the strength of this gate is the central failure this skill prevents. The gate's
honest claim is: *the machine-checkable WCAG 2.2 AA criteria pass on these routes and states.*
The rest is `a11y-gate`.

# Reading a violation

Each `results.violations[]` entry carries what you need to fix it. The inline reporter renders
them so a CI failure is actionable:

```ts
// e2e/a11y/withAA.ts
import type { Result } from "axe-core";

export const formatViolations = (vs: Result[]): string =>
  vs.map((v) =>
    [
      `✗ ${v.id} (${v.impact}) — ${v.help}`,
      `  ${v.helpUrl}`,
      ...v.nodes.map((n) => `  → ${n.target.join(" ")}\n    ${n.failureSummary}`),
    ].join("\n"),
  ).join("\n\n");
```

- `id` — the rule (e.g. `color-contrast`, `label`, `aria-required-attr`, `target-size`).
- `impact` — `critical | serious | moderate | minor`. The AA gate fails on **all** of them; do
  not filter to `critical` only.
- `helpUrl` — Deque's fix doc for that rule.
- `nodes[].target` — the CSS selector path to the offending node; `failureSummary` says why.

# The automated / manual split (handoff to a11y-gate)

| Catches here (axe in CI)                          | Belongs to `a11y-gate` (manual)                 |
| ------------------------------------------------- | ----------------------------------------------- |
| Color contrast (with computed styles)             | Meaningful alt text (axe sees presence, not sense) |
| Missing form labels / accessible names            | Logical reading & DOM order                     |
| Invalid / conflicting ARIA, required ARIA attrs   | Keyboard operability, focus order, no traps     |
| Document landmarks, heading-order presence        | Visible focus indicator quality                 |
| `target-size`, `focus-not-obscured` (WCAG 2.2)    | Error messages that are actually understandable |

When this gate is green, hand the right column to `a11y-gate`. Do not let the green run close the
accessibility task.

# Justified suppressions only

Going green by silencing a rule is the failure mode. The only acceptable narrowing:

- **Node exclusion for a genuine false positive** (e.g. a known Radix/shadcn pattern axe
  misflags): `axeAA(page).exclude("[data-radix-known-fp]")` — with a code comment and a
  `DECISIONS.md` entry naming the rule, the node, and the upstream issue.
- **Never** a global `.disableRules([...])` or dropping a WCAG tag to clear the board. Disabling
  `color-contrast` because "design will fix it later" is exactly the rationalization the skill
  refuses.

Each suppression is a tracked debt, not a deletion.

# Contrast violations are a token problem, not a markup problem

A `color-contrast` failure almost always traces to the palette, not the component. Do not patch
it with an inline color (that violates Rule 3 — no hardcoded style values). Fix it at the source:
regenerate the OKLCH ramp with `design-tokens` so the foreground/background pair meets AA, and
the fix applies everywhere the token is used. axe re-verifies on the next CI run. This closes the
loop `design-tokens` opens ("contrast pre-verified to AA before any palette ships") — CI is the
enforcement that the verification stayed true after components consumed the tokens.

# Four states, not one DOM

axe analyzes whatever DOM is mounted. The success render passing tells you nothing about the
empty and error states (Rule 4), which frequently introduce their own a11y bugs — an error toast
with no `role="alert"`, an empty-state SVG with no accessible name, a contrast-failing "retry"
link. Drive those states with `page.route` (see `axe-ci-setup.md`) and analyze each. A route is
only a11y-gated when all its states with distinct DOM are scanned.
