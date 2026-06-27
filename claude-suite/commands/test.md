---
description: Decide and author tests for a target
argument-hint: "[target]"
---

Invoke the `test-strategy` skill to decide and author tests for: $ARGUMENTS

Let the skill choose the right level(s) and hand off to the executor skill that owns each —
`vitest-unit`, `trpc-integration-test`, `playwright-e2e`, or `component-state-test` — per
`../../CLAUDE.md`.
