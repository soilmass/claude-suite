---
name: disaster-recovery
description: >
  Build a tested database backup & disaster-recovery plan for the edge DB (Neon/Turso class):
  separate what the managed platform gives you (continuous PITR, retention window) from what you
  must configure (off-provider copies, drills), derive RTO/RPO from business impact instead of
  picking round numbers, schedule AND verify backups with a real restore DRILL — a backup you
  have never restored is not a backup — define a retention policy, and walk a region/instance-loss
  decision tree. The trap: a plan that leans on "the platform backs it up," asserts plausible
  RTO/RPO it never derived, and treats data and schema as independent on restore.
  Use when: "backup plan", "disaster recovery", "set up database backups", "RTO RPO", "point in
  time recovery", "restore drill", "what if the database is lost", "region failover for the DB".
  Do NOT use for: rolling back a bad code/schema deploy (use rollback-runbook — that is recovery
  of CODE, this is recovery of DATA); coordinating a live incident's comms/timeline (use
  incident-response); wiring the DB driver in the first place (use neon-turso-driver).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the DR-planning failure class: trusting the managed platform's
    built-in backups without an off-provider copy or a tested restore, asserting RTO/RPO targets
    never derived from business impact, and ignoring that a point-in-time restore lands you on an
    OLD schema version. Baseline section replaced with an observed transcript (2026-06-26).
---

# disaster-recovery

The data-recovery counterpart to `rollback-runbook`. Rollback recovers a bad *deploy*; this skill
recovers *lost or corrupted data*: backup cadence and the PITR window, RTO/RPO derived from what an
outage actually costs, a restore *proven* by drill, a retention policy, and the decision tree for when
an instance or a whole region is gone. It exists because the convincing version — "Neon keeps backups,
we're covered" — survives review and fails the one day it's needed, because the backup was never
restored, the target was a guess, or the restored data no longer fits the schema.

The spine and nine rules live in `../../CLAUDE.md`. This skill leans on **Rule 6** (UTC timestamps; a
PITR target reasoned in local time restores to the wrong moment) and **Rule 9** (a backup carries
prod's secrets/PII — server-only and encrypted).

## Non-Negotiable Rules

A DR plan is written calm and executed in panic; the gaps only surface during the real incident —
so these are hard lines:

- **Never trust a backup you have not restored.** An un-drilled backup is a hope. Every path
  (managed PITR, off-provider dump) is proven by a scheduled restore DRILL that asserts row
  counts / integrity on a throwaway target, or it does not count toward recovery.
- **Never launch without RTO and RPO derived from business impact and recorded.** Set the
  recovery-time and data-loss targets *before* the bill and the incident, from what an outage costs
  (revenue/min, transactions/min, SLA) — not round numbers. Record them in `DECISIONS.md`; the
  plan's cost (retention, replicas, drill cadence) follows from them.
- **Never depend on a single provider for the disaster copy.** Managed PITR lives *inside* the
  project/account it protects; it does not survive project deletion, account loss, or the provider
  itself. A copy in an independent account/cloud is mandatory for the provider-loss case.
- **Never treat data and schema as independent on restore.** A restore lands you on the schema
  version live at that timestamp, not today's. Reconciling restored data with the current migration
  state is the hard part — coordinate it with `migration-deploy-coordination`.

Refuse these rationalizations: "the platform backs it up, we're covered"; "we'll set RTO/RPO after
launch"; "we've never had to restore so it must work"; "the dump is just data, schema rebuilds from
git"; "one provider is fine, they have 99.99% uptime."

## When to Use

- Standing up the backup & DR posture for a new edge DB before launch (the spend-cap moment).
- Defining or revising RTO/RPO targets, the PITR retention window, or the retention policy.
- Designing or scheduling a restore drill, or proving an existing backup actually restores.
- Planning the response to a region/instance loss, project corruption, or provider outage.

## When NOT to Use

- A bad *code or schema deploy* needs reversing → `rollback-runbook` + `migration-deploy-coordination`
  (the irreversibility boundary it hands off here).
- A live incident's coordination, comms, timeline, roles → `incident-response`; this supplies the
  data-recovery runbook it invokes, not the incident management.
- Wiring the DB client/driver or its env → `neon-turso-driver` (this consumes its recorded choice).
- Moving data between columns within one live DB (a backfill) → `data-backfill`.

## Procedure

1. **Derive RTO and RPO from business impact, then record them (interrogation: high — load-bearing).**
   Per failure class (logical error, instance/branch corruption, region loss, provider loss), set RTO
   (max downtime) and RPO (max data loss) from the *cost* of the outage — revenue/min, transactions/min,
   SLA penalties — not a plausible table. These numbers size everything downstream; record them and the
   rationale in `DECISIONS.md`. See `references/targets-and-layers.md`.

2. **Map what the platform gives vs what you must configure (interrogation: medium).** Confirm the
   driver from `DECISIONS.md` (Neon vs Turso/libSQL — backup models differ entirely) and read its
   *actual* defaults: continuous PITR exists, but the retention window default may be hours, not days.
   The gap between that floor and your RTO/RPO is your work. See `references/targets-and-layers.md`.

3. **Layer the backups: managed PITR + independent off-provider copy (interrogation: high).** L1 = the
   PITR window (raised to meet RPO) for "bad DELETE / bad migration." L2 = a pre-deploy branch/snapshot
   before each risky migration. L3 = a scheduled off-provider logical dump in an account you control,
   encrypted (Rule 9), run in a Node/CI runtime on a direct connection — never at the edge. Set a GFS
   retention policy. See `references/targets-and-layers.md`.

4. **Prove restore with a scheduled DRILL, not a hope (interrogation: high — this is the skill).**
   Schedule an automated restore into a throwaway target that asserts row counts / integrity and fails
   loudly on drift — monthly for the dump path, a quarterly game-day for the provider-loss path. Measure
   *actual* RTO/RPO against step 1 and record the delta. See `references/restore-drills.md`.

5. **Reconcile restored data with the current schema version (interrogation: high).** A restore to
   timestamp T returns data shaped for the schema live at T. Per restore, decide: replay forward
   migrations over the restored data, or promote the matching prior code build — via
   `migration-deploy-coordination`'s irreversibility boundary. Reason the PITR target in **UTC** (Rule
   6); an off-by-timezone target restores to the wrong moment. See `references/restore-drills.md`.

6. **Write the region/instance-loss decision tree.** Encode the branch the on-call follows: data
   corruption (→ PITR to a recovery branch), instance/branch loss (→ promote a branch), region loss (→
   cut over to another region), or provider loss (→ L3 restore to a new provider). Each leaf names its
   RTO/RPO and exact commands. See `references/failover-decision-tree.md`.

7. **Wire backup-health monitoring.** Alert on a missed/late dump, a sharply size-deviating dump
   (truncated/empty), a PITR window below target, and a failing drill — a silent backup failure is
   indistinguishable from no backup. Record the final posture in `DECISIONS.md`.

## Composes With

- **Consumes:** `neon-turso-driver` — the recorded driver choice (Neon vs Turso/libSQL) decides the
  backup mechanism and PITR model; this skill plans recovery for whichever was wired.
- **Consumes:** `migration-deploy-coordination` — receives the irreversibility boundary; a contract
  that dropped data is where "rollback" becomes "restore," and a restore must be reconciled against
  the migration version it lands on.
- **Sibling of:** `rollback-runbook` — code rollback is the other half; it hands its lossy
  (past-the-boundary) case here for point-in-time data restore.
- **Pairs with:** `spend-cap` — retention window, off-provider storage, and drill frequency are cost
  decisions set against the RTO/RPO they buy.
- **Hands off:** to `incident-response` — supplies the data-recovery runbook it runs during a live incident.

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project conventions):
> "set up a backup & disaster-recovery plan for our serverless Neon Postgres." The imagined
> catastrophe — "the platform backs it up, we're done," no drills, no off-provider copy — did NOT
> occur. A capable base model is better than that. A **narrower** failure class was confirmed.

**Observed run.** The agent produced a competent plan: an RTO/RPO table, three backup layers (Neon
PITR + pre-deploy branches + nightly off-provider `pg_dump` to an independent encrypted account, GFS
retention, object-lock), per-scenario runbooks, and — notably — a **monthly restore drill** it called
"the single most important line in this document." The discipline I expected it to omit, it included.
But three load-bearing pieces were missing or merely asserted:

```text
RTO/RPO table presented as fact: "Logical error ≤5min/≤30min … Region outage ≤24hr/≤4hr"
  → "These are the design targets." Plausible round numbers, never DERIVED from business impact.
"Schema/migrations: already in git. The dump is for DATA; schema rebuilds from version control."
  → data and schema treated as independent; restore-lands-on-an-old-schema problem unaddressed.
Plan assumes Neon throughout (PITR + pg_dump). No tie to the recorded driver; on Turso/libSQL the
  backup mechanism is different, and the choice is never recorded in DECISIONS.md.
```

It also gave linear per-scenario runbooks, not a decision tree keyed on the symptom, so the on-call
reads prose instead of following a branch under pressure.

**Failure class (confirmed, narrowed).** Not "trusts the platform and skips drills" — the base model
drills. The real gaps: (1) RTO/RPO **asserted as a plausible table, never derived** from
revenue/transaction/SLA impact and never recorded; (2) **data and schema treated as independent** on
restore — the restore-to-an-old-schema reconciliation, the hard part, goes unmentioned; (3) a
**single-driver assumption** (Neon-only), no tie to the recorded driver or Turso/libSQL's different
model, no `DECISIONS.md` record. This skill adds the derivation, the schema-version reconciliation, the
driver-aware model, and a symptom-keyed failover tree.

## Examples

**Input:** "We're about to launch on Neon. Set up backups and DR."
**Output:** Derive RTO/RPO per failure class from revenue/min and SLA, recorded in `DECISIONS.md`.
Raise Neon PITR retention to meet the logical-error RPO; add a CI pre-deploy branch per migration; add
a nightly `pg_dump` (CI/Node runtime, direct connection) to an independent S3/R2 account, GPG-encrypted
(Rule 9), GFS retention. Schedule a monthly restore drill asserting row counts and a quarterly game-day
to an alternate region. Write the failover tree; monitor dump freshness/size and the PITR window.

**Input:** "Someone ran a bad DELETE 20 minutes ago — recover it."
**Output:** Decision tree → data-corruption leaf. Identify the timestamp *just before* the delete in
**UTC** (Rule 6). PITR a recovery branch to that moment; validate row counts; reconcile against the
current schema (20-min-old data is same-version, so promote/cut over directly). Resume writes, record
the incident, and check the drill would have caught it.

**Input:** "The plan assumes Neon — but we're on Turso." (Turso/libSQL project.)
**Output:** Stop — the recorded driver is libSQL, so PITR + `pg_dump` are wrong. Plan around Turso's
model: its point-in-time restore / `turso db shell <db> .dump` for the off-provider copy, embedded-replica
considerations, SQLite-dialect restore verification. Record the driver-specific decisions in
`DECISIONS.md`; the RTO/RPO targets are unchanged.

## Edge Cases

- **The provider's default PITR window is shorter than your RTO/RPO** (e.g. hours on a free tier) →
  raising it is the first config action, costed against `spend-cap`; until raised, the off-provider
  dump cadence must cover the gap.
- **A restore must land before a destructive contract migration** → this is the
  `migration-deploy-coordination` irreversibility boundary; restore to the pre-contract point and
  reconcile forward, do NOT run a `down` that fabricates an empty column (that path is `rollback-runbook`).
- **Backups contain PII / secrets** → treat the dump as crown-jewel data (Rule 9): encrypt at rest,
  store server-side only, enable object-lock so a leaked credential cannot delete history, scope reads;
  a backup bucket is a prod data store.
- **The drill passes but RTO is missed** → the backup is valid, recovery is too slow; the gap is
  procedure, not the backup. Record the achieved-vs-target delta and fix the runbook (pre-provisioned
  standby, scripted restore) rather than declaring the drill green.

## References

- `references/targets-and-layers.md` — deriving RTO/RPO from business impact, the managed-vs-configured
  split per driver (Neon PITR defaults, Turso/libSQL model), the three backup layers, off-provider dump
  mechanics (Node/CI runtime, direct connection, encryption), GFS retention.
- `references/restore-drills.md` — the tested-restore procedure, drill cadence (monthly / quarterly
  game-day), row-count/integrity assertions, measuring achieved RTO/RPO, and reconciling restored data
  with the current schema version (UTC PITR targets, Rule 6).
- `references/failover-decision-tree.md` — the symptom-keyed tree (corruption → instance loss → region
  loss → provider loss), each leaf's RTO/RPO and commands, and the hand-offs to `rollback-runbook` and
  `incident-response`.

## Scripts

`scripts/` is reserved (`.gitkeep`). A signal that would justify one: a check reading the backup
manifest / drill log that flags any backup whose last *successful restore drill* is older than its
policy interval — mechanizing "a backup you have not restored is not a backup." Deferred until those
formats stabilize; until then it is a human-verified gate and step 7 covers freshness.
