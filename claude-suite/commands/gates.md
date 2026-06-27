---
description: Run the done-time gate trio
argument-hint: "[path or diff]"
allowed-tools: Bash(node:*), Read, Grep, Glob
---

Run the done-time quality gates against: $ARGUMENTS

Run all three in sequence, even if one finds issues — do not stop at the first failure:

1. `rule-audit` — the nine inviolable rules in ../../CLAUDE.md.
2. `a11y-gate` — axe + manual WCAG 2.2 AA items.
3. `security-pass` — threat-model questions, headers, dependency scan.

Group the findings by gate. A change is done only when all three are clean.
