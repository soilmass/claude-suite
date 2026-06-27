---
description: Run the rule-audit nine-rule scan + judgment pass
argument-hint: "[path or diff]"
allowed-tools: Bash(node:*), Read, Grep, Glob
---

Run the `rule-audit` skill against: $ARGUMENTS

1. Run the skill's `scan.mjs` over $ARGUMENTS (default to the working diff if no target given)
   to mechanically flag candidates for the nine rules.
2. Then do the skill's judgment pass — scan.mjs exit code is the finding count, not a verdict;
   rules 2, 4, and 7 need human reading. Report each violation with location, rule number,
   severity, and a concrete fix, per ../../CLAUDE.md.
