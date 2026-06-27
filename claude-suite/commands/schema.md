---
description: Design a Drizzle schema from entities
argument-hint: "[entities]"
---

Design a normalized Drizzle schema for these entities: $ARGUMENTS

Invoke the `schema-design` skill and follow its procedure — interrogate the relationships and
cardinality before writing, then apply the project conventions in ../../CLAUDE.md (snake_case,
PK + created_at/updated_at timestamptz, explicit FK constraints, indexed foreign keys).
