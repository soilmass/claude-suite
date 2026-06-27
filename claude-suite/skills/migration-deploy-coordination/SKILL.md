---
name: migration-deploy-coordination
description: >
  Sequence an expand-contract schema change across separate deploys so running code never
  breaks mid-rollout. The migration SQL can be perfect and still take production down if it
  ships in the wrong order relative to the code that uses it: during a rolling edge deploy
  the OLD and NEW code versions run simultaneously against ONE schema, so every intermediate
  state must satisfy both. This skill builds the per-step compatibility matrix, gates when
  each migration applies relative to each deploy, and defines the rollback boundary.
  Use when: "deploy a migration", "expand contract deploy", "migration ordering", "zero
  downtime migration", "what order do the deploys go in".
  Do NOT use for: authoring the migration SQL / the up+down (use migration-author); writing
  the backfill that copies data between columns (use data-backfill).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the coordination failure class: a correct migration shipped
    in one deploy with the code that uses it, breaking the old code version still serving
    during the rolling edge rollout. Baseline section is the encoded failure class; replace
    with an observed transcript.
---

# migration-deploy-coordination

The release-ordering skill for schema changes. `migration-author` produces a safe, reversible
expand-contract migration; this skill decides *when* each piece ships — which migration applies
before which deploy, where the backfill slots in, when the contract is safe. The governing fact:
an edge rollout is never instantaneous, so across regions and during propagation the old code
version keeps serving while the new one comes up, and the schema must be compatible with **both
at once** at every step. The spine and nine rules live in `../../CLAUDE.md` (expand-contract
mandate in its Migrations section); this skill operationalizes the ordering rather than restating
them, leaning on Rule 1 (a half-applied schema must not break the running code's type chain).

---

## Non-Negotiable Rules

A wrong deploy order ships as a green CI run and a clean migration, then breaks production the
moment the old version serves one request — so these are hard lines:

- **Never apply a non-additive migration in the same deploy as the code that needs it.** Expand
  (additive DDL) and the code using the new shape are *separate* releases; contract (drop/rename
  old) is a *later* release, after the old code has fully drained.
- **Never deploy code that reads or writes a column/table the live schema lacks.** The additive
  migration applies and is confirmed *before* its consumer deploys.
- **Never run the contract (drop/rename/narrow) until every old-code instance is gone.** Both
  versions run during rollout; if old code still writes the dropped column it 500s.
- **Never cross the irreversibility boundary without a recorded rollback plan.** A contract that
  drops data is the point past which code rollback no longer recovers you.

Refuse these rationalizations: "migration and code are one change, ship them together"; "the
deploy is atomic so old code is gone instantly"; "it's a tiny table, I'll rename in place";
"we can always roll back" (you cannot, past a contract).

---

## When to Use

- A breaking schema change (rename, drop, type change, new NOT NULL, new unique on existing
  data) must reach production without downtime.
- You have the migration in hand and need the release plan: which deploy carries which step.
- You are coordinating a multi-region / rolling edge deploy where old and new code overlap.

## When NOT to Use

- You need the migration SQL itself, the `up`/`down`, or the expand-contract DDL → that is
  `migration-author`; this skill orders what it produces.
- You need the data movement between old and new columns → `data-backfill` owns the backfill
  job; this skill places it in the sequence.
- The change is purely additive *and* nothing reads it yet (a brand-new table for a new feature)
  → ship it with `vertical-slice`; no old code to break, so no coordination.
- The deploy already failed and you need to recover → `rollback-runbook`.

---

## Procedure

1. **Classify the change as additive or breaking (low interrogation, but decisive).** Additive
   = old code is oblivious (add nullable column/table/index/nullable FK): ship any order before
   its consumer. Breaking = old code's reads/writes assume the old shape (drop, rename, type
   change, NOT NULL, unique-on-existing): needs the full multi-deploy dance. Get this wrong and
   the whole plan is wrong. See the safety table in `references/deploy-sequencing.md`.

2. **Build the per-step compatibility matrix (HIGH interrogation — this is the skill).** For
   every planned release, write the schema state and the two code versions live against it (old
   draining, new coming up), then assert: does anything either does break against this schema? A
   breaking change becomes a chain precisely so every row is "both OK." See
   `references/deploy-sequencing.md`.

3. **Order expand → backfill → switch → contract across separate deploys.** Deploy 1: expand
   (additive migration only). Backfill as its own gated job (`data-backfill`), not inside the
   migration, for any lockable table. Deploy 2: new code that dual-writes and reads the new
   shape. Deploy 3+: contract migration, then drop dual-write. Record deviations in
   `DECISIONS.md`. See `references/deploy-sequencing.md`.

4. **Gate each migration's apply time relative to its deploy.** Migrations run as a dedicated CI
   step (`drizzle-kit migrate`), never at request time on the edge driver. *Expand* applies
   *before* its consuming deploy; *contract* applies *after* the prior deploy is fully live.
   Encode the gate so a deploy cannot race its migration. See `references/deploy-sequencing.md`.

5. **Specify the dual-write / dual-read window for renames and type changes.** Between expand and
   contract, new code writes *both* old and new columns and reads the new (fallback while the
   backfill runs). This keeps the matrix green; define when each half turns off. See
   `references/deploy-sequencing.md`.

6. **Confirm rollout completion before contracting (HIGH interrogation).** The contract is safe
   only once zero pre-switch instances remain — across all edge regions, not just the primary.
   Treat "deploy finished" as "100% rollout confirmed," not "the command returned." See
   `references/rollback-windows.md`.

7. **Mark the irreversibility boundary and hand off rollback.** Up to the contract you can roll
   back code freely (old column still exists); the contract is the boundary past which rollback
   means restore-from-backup. Record it and hand the cutover to `rollback-runbook`. See
   `references/rollback-windows.md`.

---

## Composes With

- **Consumes:** `migration-author` — produces the reversible expand and contract migrations
  (`up`/`down`); this skill sequences when each ships and applies.
- **Pairs with:** `data-backfill` — its chunked, resumable copy job slots between expand and
  contract; this skill places and gates it.
- **Pairs with:** `deploy-edge` — the edge release mechanics and rollout confirmation this
  skill's gates depend on (regional propagation, 100%-rollout signal).
- **Pairs with:** `rollback-runbook` — receives the irreversibility boundary and per-step
  rollback plan this skill defines.

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> This is the encoded failure class, not a captured transcript. Replace it after running the
> task without the skill and recording what the agent actually does.

**Failure class encoded:** Asked to "rename `projects.name` to `projects.title` and deploy it,"
the agent generates a correct migration (`ALTER TABLE ... RENAME COLUMN`), updates schema, tRPC
procedures, Zod schema, and form to `title`, and ships everything in one release. CI is green.
The defects: rename and code go out together, so during the rolling edge rollout the previous
code version — still serving in other regions — does `SELECT name` against a table that no
longer has it and 500s every request until rollout completes. The rename is non-additive but
treated as atomic: no expand step, no dual-write window, no backfill placement (data "moved" via
a single locking DDL). And the old column is gone the instant the migration applies, so code
rollback is impossible — recovery is restore-from-backup, with no one having marked that cliff.

---

## Examples

**Input:** "Rename `projects.name` to `projects.title`, zero downtime."
**Output:** A four-release plan. R1: expand — additive migration adds nullable `title`; no
code change reads it yet (old code untouched, still on `name`). Backfill job copies
`name → title` in chunks (`data-backfill`). R2: code dual-writes `name` and `title`, reads
`title` with a `?? name` fallback. R3: code stops writing `name`, reads `title` only —
confirm 100% rollout. R4: contract — migration drops `name` (the irreversibility boundary;
recorded, handed to `rollback-runbook`). Compatibility matrix is green at every row.

**Input:** "Make `orders.customer_id` NOT NULL."
**Output:** Three steps, never one. R1: backfill existing NULLs to a valid value
(`data-backfill`). R2: code stops writing NULLs and is fully live. R3: migration adds the
`NOT NULL` constraint (validate-then-enforce). Adding it while NULL rows or NULL-inserting old
code exist fails the constraint mid-rollout — the matrix catches it.

**Input:** "Add a `tags` table and `project_tags` join for a new tagging feature."
**Output:** Out of scope — purely additive, nothing reads it yet, so no old code breaks. Ship
it with `vertical-slice` in one release.

---

## Edge Cases

- **`CREATE INDEX CONCURRENTLY` on a populated table** → it cannot run inside a transaction, but
  drizzle-kit wraps migrations in one. Split it into its own non-transactional migration so the
  build neither locks the table nor fails. See `references/deploy-sequencing.md`.
- **A `NOT NULL` or `CHECK` constraint on an existing table** → never add in one shot; backfill
  to satisfy it, stop old code violating it, then add and validate as the final step (a contract).
- **An enum: adding a value vs removing one** → adding is additive (old code ignores it);
  removing/renaming is breaking and needs the full sequence, since old code may still emit it.
- **A hotfix mid-sequence** → branch it off the *current live* schema, not the target; never let
  an urgent deploy skip a matrix row. If it must, re-derive the matrix first.

## References

- `references/deploy-sequencing.md` — additive-vs-breaking DDL safety table, the canonical
  rename/type-change/NOT-NULL sequences, the compatibility-matrix template, migration-apply
  gating, the dual-write pattern, and the `CREATE INDEX CONCURRENTLY` caveat.
- `references/rollback-windows.md` — reversibility per step, the irreversibility boundary, the
  100%-rollout confirmation before contracting, and the hand-off to `rollback-runbook`.

## Scripts

`scripts/` is reserved. A signal that would justify one: a check that flags any contract DDL
(DROP/RENAME) shipping in the same release as its consuming code change — a mechanical matrix.
Deferred until the deploy manifest format is stable.
