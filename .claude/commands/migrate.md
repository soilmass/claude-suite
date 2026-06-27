---
description: Author a safe expand-contract migration
argument-hint: "[change]"
---

Invoke the `migration-author` skill to author a Drizzle migration for: $ARGUMENTS

Let the skill interrogate whether the change is destructive and whether production data
exists, and let it enforce expand-contract, reversibility, and deploy coordination per
`../../CLAUDE.md`. Do not hand-write SQL outside the skill's procedure.
