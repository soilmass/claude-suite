---
description: "Prep a PR: run the gates then draft the description"
argument-hint: "[base branch]"
allowed-tools: Bash, Read, Grep, Glob
---

Prepare a pull request against base branch: $ARGUMENTS

1. Run `/gates` over the diff against the base branch and collect the findings, grouped by
   gate.
2. Spawn the `pr-describer` agent to draft the PR description, passing it the diff and the
   gate results from step 1.

Honor the spine and nine rules in ../../CLAUDE.md — do not restate them.
