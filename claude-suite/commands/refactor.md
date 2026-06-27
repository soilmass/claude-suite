---
description: Sweep a change across the type chain
argument-hint: "[change]"
---

Invoke the `refactor` skill to sweep this change across the type chain: $ARGUMENTS

Let the skill state full scope and get confirmation before touching anything, then apply the
change consistently across Drizzle schema, tRPC, Zod, and UI using the compiler as ground
truth, per `../../CLAUDE.md`. If the change implies a schema migration, let the skill hand off
to `migration-author`.
