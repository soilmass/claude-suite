---
name: migration-author
description: >
  Author a safe Drizzle schema migration enforcing expand-contract, reversibility, and
  deploy coordination, so a schema change never breaks running code mid-deploy and can
  always roll back. Interrogates whether the change is destructive and whether production
  data exists before writing anything.
  Use when: "migrate the schema", "change the database structure", "add/rename/drop a
  column", "alter the table", "evolve the data model", "drizzle-kit generate".
  Do NOT use for: designing the initial schema (use schema-design), or non-schema code
  changes (use refactor).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Retargeted to drizzle-kit per DECISIONS.md. Fragile operation →
    exact-command discipline (building-skills density rule). Baseline section is the
    encoded failure class; replace with an observed transcript.
---

# migration-author

A fragile, high-stakes operation: a bad migration costs a weekend or loses data. Per the
skill-authoring density rule, fragile operations get **exact-command discipline**, not
directional guidance. Confirm-before-destructive: it never runs a destructive step
without explicit confirmation and shows the up *and* down migration before applying.

Migration policy (expand-contract, reversibility, deploy coordination) is stated in
`../../CLAUDE.md`; this skill executes it with exact steps.

---

## Non-Negotiable Rules
- **Never run a destructive migration without explicit confirmation.** Drop, rename, and
  type-narrowing are destructive. Show the plan and the exact commands; wait for a yes.
- **Every migration is reversible.** A migration without a working `down` is not
  shippable. If a change is genuinely irreversible (data loss is intended), say so
  loudly and get explicit sign-off, recorded in `DECISIONS.md`.
- **Destructive changes use expand-contract across separate deploys**, never a
  single-step rename/drop that breaks code still expecting the old shape mid-deploy.

Refuse: "just rename the column in one migration"; "skip the down, we won't roll back";
"drop it now, the old code's probably not running."

---

## When to Use
- An existing schema (with or heading toward live data) must change shape.

## When NOT to Use
- First-time schema design → `schema-design`.
- Code-only sweeps → `refactor` (which hands the schema part here).

---

## Procedure

1. **Interrogate the data situation first (confirm-before-destructive), one batch:**
   - **Is this change destructive?** (rename, drop, narrow a type, add NOT NULL to a
     populated column — all destructive.)
   - **Is there production data?** (determines whether expand-contract is mandatory vs
     a convenience.)
   - **Rollback expectation?** (confirms the `down` must work.)
   The answers decide the entire shape of the migration; do not write before you have them.

2. **If destructive, stage as expand-contract** across separate deploys:
   - **Expand:** add the new column/table (nullable/defaulted), deploy. Old code still works.
   - **Migrate:** backfill data from old to new.
   - **Switch:** deploy code that reads/writes the new shape (this is `refactor`'s job,
     coordinated here).
   - **Contract:** once no code references the old shape, drop it — a later, separate
     deploy.
   See `references/expand-contract.md` for the exact `drizzle-kit` commands per stage.

3. **Generate with drizzle-kit, review before apply.** `drizzle-kit generate` produces
   the SQL; **read it** — generated migrations can include unintended drops. Author/verify
   the `down`. Never auto-apply a destructive migration in CI without a gate.

4. **Show up AND down before applying (completeness check).** Present both directions and
   the deploy sequence. Confirm: reversible, destructive step sequenced *after* the code
   needing the old shape is gone, backfill present if data moves. Get the go-ahead.

5. **Suggest the staging when the user framed a one-step destructive change.** If they
   say "just rename the column," surface the expand-contract sequence as the safe path and
   explain the mid-deploy breakage the single step would cause. Record an accepted risk in
   `DECISIONS.md` if they choose speed over safety knowingly.

---

## Composes With
- **Runs on:** `schema-design`'s output as it evolves.
- **Receives handoffs from:** `refactor` (the schema portion of a sweep).
- **Coordinates with:** the deploy discipline in `CLAUDE.md`.

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)
> Encoded failure class; replace with a real transcript.

**Failure class encoded:** Asked to "rename/drop a column," the agent writes a single
destructive migration with no `down`, applied in one deploy — breaking code still
expecting the old column during the rollout window and leaving no way back. A
weekend-costing class of error.

---

## Examples
**Input:** "Rename `users.full_name` to `users.display_name`, we have prod users."
**Output:** Confirms destructive + prod data + rollback wanted → plans expand-contract:
(1) add `display_name` nullable + deploy, (2) backfill from `full_name`, (3) switch code
[hand to refactor], (4) drop `full_name` in a later deploy → shows each migration's up and
down and the `drizzle-kit` commands → waits for go-ahead on stage 1.

---

## Edge Cases
- **No production data yet** → expand-contract optional; a direct change is acceptable,
  but the `down` is still required. Say which mode you're using and why.
- **Genuinely irreversible change** (intentional data loss) → flag loudly, get explicit
  sign-off, record in DECISIONS.md.
- **`drizzle-kit generate` emits an unexpected drop** → stop, surface it; generated SQL is
  reviewed, never trusted blindly.

---

## References
- `references/expand-contract.md` — the exact per-stage `drizzle-kit` commands and SQL
  patterns for add / backfill / switch / drop, with the `down` for each.

## Scripts
`scripts/` reserved for a backfill-template generator if real runs show a repeated
pattern. Empty for now.
