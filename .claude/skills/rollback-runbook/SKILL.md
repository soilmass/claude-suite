---
name: rollback-runbook
description: >
  Execute a controlled rollback of a bad edge deploy: stop the bleeding by promoting the
  prior build, then decide whether the schema must be reversed too and prove the reversal is
  safe before running it. The trap is treating rollback as a single "undo" — on the edge stack
  code rolls back instantly (pointer-based promotion) but schema does not, and a deploy that
  already ran its contract step (dropped/renamed/narrowed a column) cannot be undone by
  redeploying old code at all. This runbook orders code-vs-schema rollback, checks the contract
  boundary, and routes the irreversible case to restore-from-backup instead of a destructive down.
  Use when: "rollback", "revert deploy", "undo a deploy", "rollback runbook", "roll back migration".
  Do NOT use for: a forward deploy or promote (use deploy-edge); deciding the expand-contract
  ordering of a migration in the first place (use migration-deploy-coordination).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the rollback failure class: running a migration `down` (or
    promoting old code) without checking whether the contract step already destroyed the data
    or shape the old code depends on, turning a recoverable regression into data loss.
    Baseline observed (clean-room capture).
---

# rollback-runbook

The recovery procedure for when a production edge deploy is bad. It splits the one word
"rollback" into its two halves — **code** (instant, reversible, pointer-based) and **schema**
(slow, sometimes irreversible) — and forces the safety check the panicked path skips: *did this
deploy cross the contract boundary, and if so is reversing it lossless?* The spine and nine
rules live in `../../CLAUDE.md`; the irreversibility boundary this runbook consumes is defined
upstream by `migration-deploy-coordination`. This skill unwinds that ordering safely.

---

## Non-Negotiable Rules

A rollback is run under pressure, which is exactly when a destructive `down` gets fired
blind. These are hard lines:

- **Never run a migration `down` before confirming what it drops and whether that data still
  matters.** A `down` that reverses a contract (re-adds a column) does not restore the rows
  that were in it — the data is gone. Read the `down` SQL first; if it loses data, it is not a
  rollback, it is a second incident.
- **Never roll code back to a version that reads a column/table the current live schema no
  longer has.** If the bad deploy's contract step already applied, promoting the old build
  makes the old code `SELECT` a dropped column and 500 — you must reverse the schema first or
  not at all. Order is dictated by the contract boundary, not by urgency.
- **Never reverse schema when reversing code alone fixes it.** Most bad deploys are code bugs
  over an additive (expand) schema; the column is harmless. Promote the prior build, leave the
  column, done. Touching the schema adds risk for no gain.
- **Never apply reversal DDL at request time on the edge driver.** Reversals run as a gated
  admin/CI step, never from a route handler or middleware.

Refuse these rationalizations: "just run drizzle down, that's what it's for"; "promote the old
build, it worked yesterday" (yesterday's schema is gone); "we can re-add the column and get the
data back"; "it's an emergency, skip the backup check."

## When to Use

- A production deploy regressed and you need to get back to the last good state safely.
- You need to decide whether a rollback is code-only or must also reverse the schema.
- A migration was applied that you now need to undo, and you must know if undoing it is lossless.
- You are unwinding a partially-completed expand-contract sequence after one step went wrong.

## When NOT to Use

- You are shipping forward — opening a preview, promoting a vetted build → `deploy-edge`.
- You are planning the *order* a schema change deploys in (expand → backfill → contract) →
  `migration-deploy-coordination`; this skill consumes the boundary it defines, in reverse.
- You need the `up`/`down` SQL authored or made reversible in the first place →
  `migration-author`.
- The "rollback" is really a forward fix-it deploy (roll-forward) → `deploy-edge` + `vertical-slice`.

---

## Procedure

1. **Triage: classify the regression and stop the bleeding (do first, low cost).** Is it a
   code bug, a schema problem, or both? If code-only, the fastest safe action is promoting the
   prior production build — pointer-based, no rebuild, seconds. Establish severity and whether
   user data is being corrupted right now (corruption may mean cut traffic before rollback).
   See `references/rollback-procedure.md`.

2. **Promote the last-good build back (code rollback, low cost).** `vercel rollback` or promote
   the prior deployment URL. This reuses the existing artifact, so production runs the exact
   bytes that worked before — no drift. This is reversible itself, so it is the safe default
   while you assess schema. See `references/rollback-procedure.md`.

3. **Determine whether the bad deploy touched the schema, and which step (HIGH interrogation —
   this is the skill).** Map the deploy to its migration step: was it an *expand* (additive,
   old code-safe) or a *contract* (drop/rename/narrow, destructive)? An expand left the new
   column harmless — code rollback alone is complete. A contract changed shape the prior build
   depends on — go to step 4. See `references/contract-safety.md`.

4. **Prove the contract step is safe to undo before reversing it (HIGH interrogation).** Read
   the migration's `down` SQL. Reversing a contract re-creates the column/constraint but
   **cannot restore the rows it dropped** — assert whether that data is needed. If the `down`
   is lossless (e.g. reverses a rename where the data still exists under the new name), proceed;
   if it loses data, do NOT run it — go to step 6. See `references/contract-safety.md`.

5. **Reverse the schema in the correct order relative to code (medium cost).** When a contract
   must be undone: the schema reversal (apply the authored `down`) comes *before* promoting code
   that needs the old shape — the mirror of forward ordering. drizzle-kit has no native `down`
   runner; apply the authored down SQL as a gated step and remove its journal entry so the
   schema and migrations table stay consistent. See `references/rollback-procedure.md`.

6. **If reversal is lossy, switch to restore-from-backup, not a destructive down (HIGH cost).**
   Past the irreversibility boundary, "rollback" means point-in-time restore of the database,
   coordinated with the code rollback — not a `down` that fabricates an empty column. This is the
   incident path; record it. See `references/contract-safety.md`.

7. **Verify recovery and record the incident.** Confirm error rate and the affected flow are
   healthy on the restored state, and that the migrations journal matches the live schema.
   Record what was rolled back, whether the contract boundary was crossed, and any data loss in
   `DECISIONS.md` / the incident log so the re-attempt avoids it.

---

## Composes With

- **Consumes:** `migration-deploy-coordination` — receives the irreversibility boundary and the
  per-step rollback plan it defines during the forward sequence; this skill unwinds that plan.
- **Consumes:** `migration-author` — the reversible `down` SQL it authored is what step 4/5
  reads and (if lossless) applies.
- **Pairs with:** `deploy-edge` — provides the pointer-based promote/`vercel rollback` mechanics
  this runbook drives for the code half.
- **Hands off:** to `deploy-edge` + `vertical-slice` when the right move is roll-forward (a new
  fix deploy) rather than backward.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked to write a production rollback runbook, the naive output produced a clean
Vercel-promote + `git revert` flow but its migration-reversal section was fabricated: it invented
Drizzle down-SQL files and a `drizzle-kit drop` "down runner" that do not exist, and it reversed
the schema with a TCP `psql` connection the edge/serverless HTTP stack never has.

```bash
# generate-down was created with the migration; apply the down
drizzle-kit drop            # drops last migration entry
# then run the down SQL for that migration against prod
psql $DATABASE_URL -f drizzle/<timestamp>_down.sql
```

`drizzle-kit drop` only removes a journal entry — it runs no down SQL, and no `_down.sql` file is
generated to point `psql` at. Expand-contract appears only as a passing prevention note, and the
irreversible (contract) case is demoted to a vague "restore from backup" afterthought with no
PITR target or pre-deploy-snapshot check.

**Failure class (confirmed).** Treating "rollback" as a single undo collapses the code half
(instant, pointer-based) and the schema half (slow, sometimes irreversible) into one step, then
papers over the schema half with non-existent tooling and wrong-stack commands. This skill forces
the code-vs-schema split, checks the contract boundary before any `down`, and routes the lossy
case to point-in-time restore instead of a fabricated empty-column reversal.

---

## Examples

**Input:** "Last deploy broke the dashboard, roll it back."
**Output:** Triage finds a render bug in the new code; the deploy's only schema change was an
additive `archived_at` column (expand). Action: `vercel rollback` to the prior build — seconds,
no rebuild. The `archived_at` column stays (old code ignores it; Rule 6 timestamptz, harmless).
No schema reversal. Verify dashboard healthy; record nothing (no boundary crossed).

**Input:** "Revert the deploy that renamed `projects.name` to `projects.title`."
**Output:** This was a contract step (the rename's drop-of-`name`). Promoting old code that reads
`name` would 500. Read the `down`: if it was the final contract that dropped `name`, re-adding
`name` does not restore its values — lossy. Switch to restore-from-backup coordinated with the
code rollback (step 6). If instead the deploy was only the *dual-write* code step (column still
present), code rollback alone suffices. The classification decides everything.

**Input:** "We added a NOT NULL constraint and it's rejecting writes, undo it."
**Output:** Lossless reversal — the `down` drops the constraint; no data is lost. Apply the
authored `down` as a gated admin step, remove its journal entry, then the code that was failing
writes works again. No backup needed. Record why the constraint was premature so the re-attempt
backfills first.

## Edge Cases

- **The bad deploy is mid-rollout (not 100%)** → halt the rollout first, then promote prior
  build; both versions are live, so re-confirm the live schema state before any reversal.
- **drizzle has no `down` for this migration** → you cannot reverse cleanly; treat as the
  irreversible path (step 6) and file a defect against `migration-author` for the missing `down`.
- **Code and schema both need reverting and the reversal is lossless** → reverse schema first,
  then promote old code — the mirror of forward expand-then-deploy order; never promote old code
  against not-yet-reversed new schema.
- **The fastest safe fix is forward, not backward** (the prior build has its own bug) → do not
  force a backward rollback; hand to `deploy-edge` + `vertical-slice` for a roll-forward hotfix.

## References

- `references/rollback-procedure.md` — the ordered runbook: triage and severity, pointer-based
  code rollback (`vercel rollback` / promote prior), the code-vs-schema decision, applying an
  authored `down` as a gated step, keeping the drizzle journal consistent, and the edge-driver
  "no reversal at request time" rule.
- `references/contract-safety.md` — classifying the reversed step as expand vs contract, reading
  the `down` for data loss, the lossless-vs-lossy decision table, the irreversibility boundary,
  and the restore-from-backup path.

## Scripts

`scripts/` is reserved. A signal that would justify one: a check that reads the migrations
folder and flags any migration whose `down` performs a data-losing operation (re-adds a dropped
column, recreates a dropped table) — a mechanical version of step 4 that warns before reversal.
Deferred until the migration metadata format is stable.
