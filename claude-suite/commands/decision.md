---
description: Log a resolved decision to DECISIONS.md
argument-hint: "[decision]"
---

Invoke the `decision-log` skill to record the resolved decision: $ARGUMENTS

Let the skill append the entry to `DECISIONS.md` with the date and one-line rationale per the
decision-record convention in `../../CLAUDE.md`. `DECISIONS.md` wins over `CLAUDE.md` when
they disagree — record the fork as it happened, do not silently choose.
