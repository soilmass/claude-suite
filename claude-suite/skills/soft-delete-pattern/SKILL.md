---
name: soft-delete-pattern
description: >
  Implement soft delete on a chosen entity end to end: a nullable `deleted_at timestamptz`
  column, a partial index, query scoping that excludes deleted rows everywhere they are
  read, ownership-checked delete/restore mutations, and a unique-constraint strategy that
  survives "delete then re-create the same name." The danger is not adding the column — it
  is the read you forget to scope, which silently resurrects deleted rows in one list while
  hiding them in another. This skill makes the scoping systematic.
  Use when: "soft delete", "deleted_at", "archive instead of delete", "restore deleted".
  Do NOT use for: deciding hard vs soft delete for a brand-new table at schema time (use
  schema-design — it owns the per-entity call); scoping rows by tenant/owner rather than by
  deletion state (use multitenancy-scoping).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the soft-delete failure class: adding `deleted_at` but
    leaving reads unscoped, so deleted rows leak back. Baseline section is the encoded
    failure class; replace with an observed transcript.
---

# soft-delete-pattern

The build-loop skill for retiring rows without destroying them. Given "users delete a project
but we need to recover it / keep its history," it adds a nullable `deleted_at timestamptz`,
then does the hard part: scopes every read so deleted rows disappear consistently, and wires
delete/restore as ownership-checked mutations. The column is trivial; the systematic scoping
is the whole job.

The spine and the nine inviolable rules live in `../../CLAUDE.md`; this skill does not restate
them. It leans on Rule 6 (`timestamptz` UTC), Rule 2 (ownership on delete and restore), Rule 7
(scope without N+1), and Rule 1 (the filter is part of the type chain, not a cast).

---

## Non-Negotiable Rules

A soft delete that skips one read compiles and looks done, so these are hard lines:

- **Never read the table without a deletion predicate.** Every `findMany`/`findFirst`/
  `select` on a soft-deleted entity adds `isNull(table.deletedAt)` unless its explicit job is
  to show or restore trashed rows. The forgotten read is the entire failure.
- **Never `db.delete()` a soft-deleted entity on the normal path.** "Delete" is an `update`
  setting `deletedAt = now()`. A real `db.delete()` lives only in a separate, deliberate
  purge/retention job — never the user-facing delete.
- **Never let delete or restore skip the ownership check.** Both mutate a user-owned row and
  re-verify it belongs to `ctx.auth.userId` (Rule 2). Restore is a write — same authorization
  as delete.
- **Never leave a plain unique index on a soft-deleted table.** It blocks re-creating a name
  the user "deleted." Use a partial unique `WHERE deleted_at IS NULL` (or key on
  `deleted_at`). Decide and record it.

Refuse these rationalizations: "the column is there, that's soft delete done"; "this one
list is internal, it can show everything"; "restore just flips a flag, no auth needed";
"I'll add the partial index if someone hits the conflict."

---

## When to Use

- An entity needs recoverable deletion, an audit trail, or "trash / archive then restore."
- A delete must not cascade-destroy referenced history (orders referencing a deleted product).
- You are adding delete/restore (and the read-scoping it implies) to an existing entity.

## When NOT to Use

- The entity is new and soft-vs-hard is undecided → `schema-design` owns the per-entity call.
- You need to filter rows by tenant or owner, not by deletion state → `multitenancy-scoping`.
- The live-table DDL for the column/index → `migration-author` (this skill specifies it).
- You are building the whole feature from scratch → `vertical-slice`; invoke this skill for
  its delete/restore + read-scoping concern only.

---

## Procedure

1. **Confirm the entity was decided "soft" (low-interrogation, but stop if undecided).**
   Soft vs hard is a schema-time call (`../../CLAUDE.md`, Money/time/IDs). If undecided, hand
   to `schema-design`; do not default to soft because it feels safer. If you decide it here,
   record the entity + rationale in `DECISIONS.md`.

2. **Add `deleted_at timestamptz` nullable, defaulting to NULL.** NULL means live; a
   timestamp means deleted-at-that-instant (Rule 6 — UTC, written only on the delete, never a
   column default). On a live table this is an additive, reversible migration →
   `migration-author`. See `references/soft-delete-patterns.md`.

3. **Add the partial unique index and the read index.** Replace any plain unique on a
   user-facing column with a partial unique `WHERE deleted_at IS NULL` so deleted rows do not
   block re-creation; add `(owner_id) WHERE deleted_at IS NULL` for the live-list read. Record
   the index choice in `DECISIONS.md`. See `references/soft-delete-patterns.md`.

4. **Centralize the predicate, then scope every read (high-interrogation — this is the
   failure).** Export one helper (`notDeleted(t) => isNull(t.deletedAt)`) and `and()` it into
   every read's `where` with the ownership predicate (Rule 2, Rule 7 — the filter rides the
   same query). Enumerate every read site: list, detail, counts, aggregates, joins (`leftJoin`
   must filter the joined side too), relational `with`. See `references/query-scoping.md`.

5. **Make "delete" an ownership-checked update.** The delete mutation guards the row by
   `ctx.auth.userId`, then `update(...).set({ deletedAt: new Date() })`. Idempotent:
   re-deleting an already-deleted row is a no-op. Never `db.delete()` here. See
   `references/soft-delete-patterns.md`.

6. **Build restore as a first-class, authorized mutation.** Restore sets `deletedAt = null`,
   re-checks ownership (Rule 2), and re-validates uniqueness — a name freed while the row was
   trashed may now collide; handle the conflict explicitly rather than letting the DB throw.
   See `references/soft-delete-patterns.md`.

7. **Decide cascade and purge behavior explicitly.** Children of a soft-deleted parent:
   cascade-soft-delete, hide-via-parent, or leave independent — choose per relation and
   record it. Define the hard-purge/retention job separately (the only place `db.delete()`
   lives), with its own gate. See `references/query-scoping.md`. Then run `n1-hunter` and
   `rule-audit`.

---

## Composes With

- **Consumes:** `schema-design` — it owns the per-entity soft-vs-hard decision and the table
  this skill amends.
- **Pairs with:** `multitenancy-scoping` — both AND predicates into the same `where`;
  ownership/tenant scope and deletion scope must be applied together at every read.
- **Hands off:** the `deleted_at` DDL and partial-index change on a live table →
  `migration-author` (expand-contract, reversible).
- **Runs against:** `n1-hunter` and `rule-audit` — verify the added predicates introduced no
  per-row query and that ownership rides delete + restore.

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> This is the encoded failure class, not a captured transcript. Replace it after running the
> task without the skill and recording what the agent actually does.

**Failure class encoded:** Asked to "let users delete a project but keep it recoverable,"
the agent adds `deletedAt`, converts the one delete mutation to an `update`, then stops. The
defects that ship: the main list (`findMany({ where: eq(...) })`) is left unscoped, so
deleted projects reappear there while the trash view hides them. The dashboard `count(*)`
still tallies deleted rows. A `leftJoin` to tasks filters the parent but not the joined side,
resurfacing tasks of deleted projects. The `restore` endpoint flips `deletedAt = null` with
no ownership re-check (Rule 2) and no uniqueness re-validation — any user can restore any row
and a name collision throws a raw DB error. The old plain `unique(name)` index remains, so
re-creating a "deleted" name fails with a constraint violation the user cannot understand.

---

## Examples

**Input:** "Add delete + restore to projects; deleted ones go to a Trash tab."
**Output:** `deleted_at timestamptz` (nullable) + partial unique `(owner_id, name) WHERE
deleted_at IS NULL`. A shared `notDeleted` helper; the live list is
`db.query.projects.findMany({ where: and(eq(projects.ownerId, ctx.auth.userId), isNull(projects.deletedAt)) })`,
the Trash list flips to `isNotNull`. `delete` → ownership guard then
`update(projects).set({ deletedAt: new Date() })` (Rule 6); `restore` → ownership guard,
uniqueness re-check, `set({ deletedAt: null })`.

**Input:** "Dashboard count of active projects is counting deleted ones."
**Output:** The aggregate carries the predicate too:
`db.select({ n: count() }).from(projects).where(and(eq(projects.ownerId, ctx.auth.userId), isNull(projects.deletedAt)))`
— aggregates and joins are read sites; scoping is not optional on them (step 4).

**Input:** "Deleting a project should hide its tasks too."
**Output:** A recorded cascade decision: soft-cascade sets `deletedAt` on child tasks in one
bulk `update ... where projectId = ...` (Rule 7 — not per task), and task reads gain
`isNull(tasks.deletedAt)`. Recorded in `DECISIONS.md` as the per-relation cascade choice.

---

## Edge Cases

- **A unique column the user can re-use after deleting** → partial unique
  `WHERE deleted_at IS NULL` (or add `deleted_at` to the key); never a plain unique.
- **An admin/audit view must show deleted rows** → that read intentionally omits the
  predicate (or flips to `isNotNull`); make the intent explicit in the query, not an
  accidental missing filter.
- **A foreign key points at a soft-deleted parent** → the FK still resolves (the row exists);
  decide per relation whether children cascade-soft-delete or stay, and scope child reads
  accordingly — the FK hides nothing.
- **Restore re-introduces a now-taken unique value** → catch the conflict in the restore
  mutation and surface a typed error (rename-on-restore or refuse), not a raw DB throw.

## References

- `references/soft-delete-patterns.md` — the Drizzle column + partial-index DDL, the
  delete/restore mutations with ownership and idempotency, and the unique-after-delete
  strategy, with code.
- `references/query-scoping.md` — the centralized `notDeleted` predicate and a read-site
  checklist (list, detail, count, aggregate, join, relational `with`), plus cascade and
  hard-purge/retention guidance.

## Scripts

`scripts/` is reserved. A signal that would justify one: a static check that flags reads of a
known soft-deleted table whose `where` lacks an `isNull(deletedAt)` term — but that overlaps
`rule-audit`'s scanning surface, so this skill likely stays script-free.
