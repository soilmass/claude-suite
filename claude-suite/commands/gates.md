---
description: Run the four done-time gates
argument-hint: "[path or diff]"
allowed-tools: Bash(node:*), Read, Grep, Glob
---

Run the done-time quality gates against: $ARGUMENTS

Run all four in sequence, even if one finds issues — do not stop at the first failure:

1. `rule-audit` — the nine inviolable rules in ../../CLAUDE.md.
2. `a11y-gate` — axe + manual WCAG 2.2 AA items.
3. `security-pass` — threat-model questions, headers, dependency scan.
4. `design-gate` — design-system adherence + craft (spacing/type scale, color role & CVD, hierarchy, state craft).

Group the findings by gate. A change is done only when all four are clean.
