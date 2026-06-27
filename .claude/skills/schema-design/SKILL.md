---
name: schema-design
description: >
  Turn plain-language domain entities into a normalized Drizzle (TypeScript) schema with
  the project conventions: snake_case, primary keys, created_at/updated_at timestamptz,
  explicit relations with correct cardinality and foreign-key constraints, and indexes on
  foreign keys and frequent filters. Interrogates relationships before writing, because
  wrong cardinality is the costliest error in the stack.
  Use when: "design the schema", "model the data", "set up the database", "define the
  entities", "what tables do I need".
  Do NOT use for: authoring a migration that evolves an existing schema (use
  migration-author), or building the API/UI over the schema (use vertical-slice).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Retargeted from Prisma to Drizzle per DECISIONS.md: schema is
    authored as TypeScript in src/db/schema/, types root at $inferSelect/$inferInsert.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# schema-design

Highest-interrogation skill in the suite, because the schema is the origin of the type
chain and a wrong relationship is the most expensive error to unwind once data exists.
It interrogates relationships and cardinality *before* writing anything.

Conventions (snake_case, keys, timestamps, IDs, soft-delete, indexing) are defined in
`../../CLAUDE.md`. This skill applies them; it does not restate them.

---

## Non-Negotiable Rules

- **Interrogate cardinality before writing a single table.** The most expensive error in
  the stack is a wrong relationship direction or multiplicity. Never infer "has many" vs
  "belongs to many" from prose alone — ask. ("Does a user have many projects, or can a
  project belong to many users?")
- **Every table gets a primary key and `created_at`/`updated_at` timestamptz.** No
  exceptions; a table without these is incomplete.
- **Every relation is explicit with a foreign-key constraint.** Implicit relations and
  orphan-able rows are defects.

Refuse: "the relationships are obvious from the names"; "we can add timestamps later";
"skip the FK constraint, the app enforces it." Each is the shape of the encoded failure.

---

## When to Use
- New domain entities need to become tables.
- An existing rough schema needs normalizing or convention-aligning.

## When NOT to Use
- Evolving an existing schema's shape with live data → `migration-author`.
- Building over the schema → `vertical-slice`.

---

## Procedure

1. **Extract entities, then interrogate relationships (highest-interrogation).** Pull the
   candidate entities from the conversation and *confirm* them rather than re-asking. Then
   ask, as one batch, the load-bearing questions only the user can answer:
   - **Cardinality** for each relationship ("a user has many projects, or projects belong
     to many users?"). This is the non-negotiable one.
   - **Soft vs hard delete** per entity (drives a nullable `deleted_at`).
   - **Public-facing?** per entity (drives UUIDv7 vs internal BIGSERIAL per CLAUDE.md IDs).
   - **Uniqueness constraints** (which fields are unique, alone or in combination).

2. **Normalize.** Default to normalized tables. Reach for a `jsonb` column only for
   genuinely schemaless, non-queried data — and record that choice in `DECISIONS.md`.

3. **Write the Drizzle schema (TypeScript).** In `src/db/schema/`, one file per
   aggregate. Apply conventions: snake_case columns, PK, `created_at`/`updated_at`
   timestamptz, explicit `references()` FKs with the right cardinality, and the
   `$inferSelect`/`$inferInsert` type exports that root the type chain. See
   `references/drizzle-conventions.md`.

4. **Completeness check.** Before declaring done: every table has a key and both
   timestamps; every relation is explicit with an FK; integrity/uniqueness constraints are
   in the schema; IDs and delete-strategy match the answers from step 1. State any place
   you made a call the user should confirm.

5. **Suggest actively (this skill suggests a lot — modeling foresight is cheap now,
   expensive later).** Flag: indexes on every foreign key and on columns you can see will
   be filtered/sorted; where a composite unique constraint is implied; where a `jsonb`
   column genuinely fits; where an enum/lookup table beats a free-text column. Offer;
   don't silently add. Record any modeling fork resolved in `DECISIONS.md`.

---

## Composes With
- **Feeds:** `vertical-slice` (builds atop the schema) and `migration-author` (evolves
  it).
- **Called by:** `t3-genesis` as a sub-step during initial scaffolding.
- **Hands off:** any change to a schema that already has data → `migration-author`, never
  a direct edit.

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> Encoded failure class per the capability map; replace with a real transcript.

**Failure class encoded:** From a prose domain description, the agent emits layout-shaped
fields (columns that mirror a UI form rather than the domain), gets relation cardinality
wrong (a one-to-many modeled as many-to-many or reversed), under- or over-normalizes,
and omits timestamps, keys, or FK constraints — seeding errors into the type chain's root
that every downstream layer inherits.

---

## Examples

**Input:** "We have users, projects, and tasks. Model it."
**Output:** Interrogates: "User→projects one-to-many, and project→tasks one-to-many — or
can a task belong to several projects? Soft-delete projects? Are project IDs exposed in
URLs?" → on answers, writes `users`, `projects`, `tasks` Drizzle tables with snake_case,
PKs, timestamptz timestamps, FK `owner_id`/`project_id` with indexes, UUIDv7 for
public-facing → suggests an index on `tasks.project_id` and a composite unique on
`(project_id, slug)` → records the soft-delete choice in DECISIONS.md.

---

## Edge Cases
- **User won't commit on a cardinality** → do not write the table; the ambiguity is the
  whole risk. Offer the two models and their consequences and wait.
- **Entity looks like a UI form** → push back: model the domain, not the screen.
- **Schema already exists with data** → this is migration territory; hand to
  `migration-author`.

---

## References
- `references/drizzle-conventions.md` — the exact Drizzle table patterns: keys,
  timestamps, relations, indexes, enums, and the type exports that root the chain.

## Scripts
`scripts/` reserved for a future schema-lint (checks keys/timestamps/FK presence) if
repeated baselines show the same omissions. Empty for now.
