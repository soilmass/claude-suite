---
name: decision-log
description: >
  Append one structured, dated entry to `DECISIONS.md` for a fork the project just resolved —
  a deviation from an abstract default in `../../CLAUDE.md`, or a choice the spine deliberately
  left open (an ID strategy, a money representation, a soft-delete call, a driver tier). Captures
  the fork, the decision, a one-line rationale, the scope it binds, and the rule or spine section
  it touches, so the next agent reads a settled call instead of re-litigating it. Appends to the
  chronological log; supersedes prior entries by reference, never by silent rewrite.
  Use when: "log a decision", "record this decision", "add to decisions", "we decided X".
  Do NOT use for: a large architectural decision needing Context/Options/Consequences depth (use
  draft-adr), or summarizing a working session (use summarize-thread).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the decision-record failure class: a resolved fork left
    unlogged (re-litigated next sprint), or logged as undated prose with no scope and no link to
    the rule it touches, or a silent rewrite of a prior decision that erases the audit trail.
    Baseline observed (clean-room capture).
---

# decision-log

The lightweight record skill. It appends **one** structured entry to `DECISIONS.md` the moment a
fork is resolved, so the project-specific override of an abstract default in `../../CLAUDE.md` is
captured where the rules say it must be — `DECISIONS.md` wins over `CLAUDE.md` precisely because
it records the concrete resolution of an abstract fork. It does not write Architecture Decision
Records; a decision deep enough to need options-and-consequences prose hands off to `draft-adr`.

A "fork" is a place the spine states a default *in the abstract* (IDs are UUIDv7 *for public
rows*, money is *integer minor units or* a decimal, soft-delete is *an explicit per-entity call*)
and this project made it concrete — or chose between options the spine left open. Applying a rule
that has no fork is not a decision and gets no entry.

---

## When to Use

- A generating skill (`schema-design`, `migration-author`, `vertical-slice`, `refactor`,
  `money-modeling`, `uuidv7-ids`, `soft-delete-pattern`, `neon-turso-driver`) just resolved a
  fork and its step said "record in `DECISIONS.md`."
- The project chose against an abstract default in `../../CLAUDE.md`, or picked one of the spine's
  explicitly-open options (ID strategy per table, money type, delete strategy, driver class).
- A justified deviation from one of the nine rules was agreed and needs a paper trail.
- A prior decision is being reversed or narrowed and the change must supersede the old record.

## When NOT to Use

- A significant architectural choice that needs framed context, an option set, and consequences →
  `draft-adr` (write the ADR, then leave a one-line `DECISIONS.md` pointer to it).
- Gathering the evidence and trade-off matrix *before* such a decision → `adr-research`.
- Summarizing what happened in a work session for handoff → `summarize-thread`.
- Re-verifying dated facts (versions, OWASP order, CWV thresholds) → `perishable-refresh`.
- Applying a settled rule with no fork involved → nothing to log; do the work.

---

## Procedure

1. **Confirm a fork was actually resolved (medium-interrogation).** Name the abstract default in
   `../../CLAUDE.md` this overrides, or the open option the spine left. If nothing was forked —
   you merely applied a rule — there is no entry to write. If the decision is large enough to need
   options and consequences, stop and hand to `draft-adr`. See `references/when-to-log.md`.

2. **Grep `DECISIONS.md` first for an existing record (idempotency).** Search the topic keywords.
   If the fork is already logged and unchanged, stop and cite it — do not duplicate. If this
   *reverses* a prior entry, you will supersede it in step 5, not edit it. See
   `references/when-to-log.md`.

3. **Capture the entry fields.** Today's date (`2026-06-26`), a short imperative title, status
   (`Accepted`), the fork, the concrete decision, a one-or-two-line rationale that also says *why
   not* the rejected option, and the scope it binds (which tables/procedures/modules). Vague
   rationale is the field most often dropped and the one most read later. See
   `references/entry-format.md`.

4. **Link the rule or spine section it touches.** Cite by number/section — "Rule 5 (resolves: a
   typed decimal is permitted)" or "IDs convention (deviates: BIGSERIAL on an internal-only
   table)". A deviation from a rule must say *why the deviation is safe*; flag it for `rule-audit`
   awareness if it weakens a guard. See `references/entry-format.md`.

5. **Append, never rewrite (high-interrogation on edits).** Add the entry to the bottom of the
   chronological log. Never silently edit a prior decision: to change one, append a new dated entry
   and mark the old `Superseded by <date>`, preserving the trail. See `references/entry-format.md`.

6. **Note the source that surfaced the fork.** Record which skill or feature produced it
   (`schema-design on orders`, `money-modeling on invoices`) so a reader can trace the decision to
   its origin. If you handed a bigger version off to `draft-adr`, link the ADR here instead.

---

## Composes With

- **Consumes:** the resolved fork emitted by any generating skill — `schema-design`,
  `migration-author`, `vertical-slice`, `refactor`, `money-modeling`, `uuidv7-ids`,
  `soft-delete-pattern`, `neon-turso-driver`, `multitenancy-scoping` — each of which says "record
  in `DECISIONS.md`" and routes that record here.
- **Pairs with:** every generating skill above; this is the shared sink for the forks they resolve.
- **Hands off:** a decision that needs options-and-consequences depth → `draft-adr` (then back-link
  the ADR from a one-line `DECISIONS.md` pointer).
- **Runs against:** `../../CLAUDE.md` (the abstract defaults this records overrides of) and the
  existing `DECISIONS.md` (checked for duplicates and supersession).

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked to record the UUIDv7-for-public-IDs call, the naive agent never read
`CLAUDE.md` or `DECISIONS.md` — where UUIDv7-for-public and BIGSERIAL-for-internal are *already*
the decided spine — so it re-stated a settled default as if new, risking a duplicate or conflicting
record. It used an ad-hoc heading with no decision template (no Context/Decision/Consequences, no
ID, no author), mentioned the rejected alternatives only in passing, and gave no reversibility note
or migration plan for tables already on UUIDv4:

```markdown
## Use UUIDv7 for public-facing IDs
**Date:** 2026-06-26
**Status:** Adopted
...
- Existing tables already on UUIDv4 stay as-is for now; no big migration unless we have a reason.
```

**Failure class (confirmed).** Without grepping the existing log and spine first, an agent
re-litigates an already-decided fork instead of recording only the project-specific resolution,
and writes undated/untemplated prose with no scope, no named-and-rejected alternatives, no
reversibility (one-way vs two-way door), and no link to the rule it touches — leaving a reader
unable to tell a sanctioned decision from drift.

---

## Examples

**Input:** "Record this decision: `orders.total` is `numeric(12,2)`, not integer cents."
**Output:** Appended entry dated 2026-06-26, status Accepted; Fork = "Rule 5 permits integer minor
units *or* a typed decimal"; Decision = decimal `numeric(12,2)`; Rationale = "multi-currency
rounding handled in SQL; team reads dollars directly — cents offered no win here"; Scope = `orders`
table + the `orders` tRPC router + the order form; Touches = Rule 5 (resolves, decimal branch);
Source = `money-modeling on orders`.

**Input:** "Log a decision: `audit_log` uses BIGSERIAL, not UUIDv7."
**Output:** Entry citing the IDs convention (deviates): UUIDv7 is for *public-facing* rows;
`audit_log` is internal-only and append-only, so a monotonic `BIGSERIAL` is correct and cheaper.
Scope = `audit_log` only. Source = `schema-design`.

**Input:** "We decided to drop Clerk for Auth.js across the app."
**Output:** Recognized as architectural (auth is a spine decision, multi-consequence) → handed to
`draft-adr` to write the ADR with options and consequences; `decision-log` then appends a one-line
`DECISIONS.md` pointer to that ADR rather than capturing the decision itself.

---

## Edge Cases

- **The decision is large/architectural (auth swap, ORM swap, multi-consequence)** → write it as an
  ADR via `draft-adr`; `decision-log` only appends a one-line pointer to the ADR.
- **An entry already covers this fork** → cite it; if you're reversing it, append a new dated entry
  and mark the old `Superseded by <date>` — never edit the old in place.
- **No fork was actually resolved (you just applied a rule)** → write nothing; logging
  rule-applications is noise that buries the real decisions.
- **The decision deviates from a rule** → still log it, but name the rule number and the safety
  argument, and flag it so `rule-audit` won't read the deviation as a violation.

## References

- `references/entry-format.md` — the `DECISIONS.md` entry template and field definitions, the
  status lifecycle (Accepted → Superseded), the append-and-supersede convention, the rule/section
  linking format, and worked entries for the common forks (money, IDs, soft-delete, driver).
- `references/when-to-log.md` — the triage that decides fork-worthy vs rule-application vs
  ADR-worthy, the list of generating skills that route forks here, and the grep-first idempotency
  and supersession rules.

## Scripts

`scripts/` is reserved. A signal that would justify one: a helper that greps `DECISIONS.md` for a
fork's keywords and prints any matching entry with its date and status, so step 2's duplicate /
supersession check is mechanical rather than a manual scan of a growing log.
