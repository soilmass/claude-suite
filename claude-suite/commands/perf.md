---
description: Check the performance budget and bundle
argument-hint: "[route]"
allowed-tools: Bash, Read, Grep, Glob
---

Run the performance gate for the route in $ARGUMENTS (default: the whole app if none given).
This is an orchestration — run both passes in order, and **run both even if the first finds
issues** so the report is complete:

1. Invoke the `perf-budget-check` skill against $ARGUMENTS — verify LCP / INP / CLS at p75
   against the budget in CI config.
2. Invoke the `bundle-analysis` skill against $ARGUMENTS — inspect the bundle for regressions
   and heavy imports.

Collate both into one report: budget pass/fail per metric, then bundle findings. Source of
truth for the budget is `../../CLAUDE.md` (Quality gates).
