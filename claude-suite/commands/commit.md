---
description: Draft a Conventional Commit from the staged diff
argument-hint: ""
allowed-tools: Bash(git diff:*), Bash(git status:*)
---

Staged status: !`git status --short`

Staged diff: !`git diff --staged`

Invoke the `draft-conventional-commit` skill and compose a Conventional Commit message from
the staged diff shown above. Follow the skill's procedure; do not restate the rules in
../../CLAUDE.md.
