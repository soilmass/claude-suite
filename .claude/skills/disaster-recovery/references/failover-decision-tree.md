Purpose: give the on-call a branch to follow under pressure instead of prose to read — a symptom-keyed decision tree from "what is actually wrong" to the right recovery leaf, each with its RTO/RPO and the hand-off boundaries to rollback-runbook and incident-response.

# Region / instance-loss decision tree

Linear per-scenario runbooks force the on-call to read and match prose at 3am. This is a decision
tree: start from the *symptom*, branch to the leaf, execute its named procedure. Each leaf inherits
the RTO/RPO recorded for its failure class in `DECISIONS.md`.

```
START: production data is wrong or unreachable.

Q1. Is the DB reachable and healthy, but the DATA is wrong (bad DELETE/UPDATE/migration)?
    └─ YES → LEAF A: Logical-error recovery (PITR)
    └─ NO  → Q2

Q2. Is the bad state caused by a CODE or SCHEMA deploy (not data loss)?
    └─ YES → HAND OFF to rollback-runbook (code rollback / migration reversal).
             If its reversal is LOSSY (past the contract boundary) it hands back to LEAF A/D.
    └─ NO  → Q3

Q3. Is the primary instance/branch corrupted but the provider/region is up?
    └─ YES → LEAF B: Instance/branch failover
    └─ NO  → Q4

Q4. Is the DB's REGION down but the provider/account is fine?
    └─ YES → LEAF C: Region cutover
    └─ NO  → LEAF D: Provider loss (off-provider restore)
```

Whenever the event is user-visible or multi-team, open `incident-response` in parallel — these
leaves are the *data-recovery* runbook it drives, not the incident's coordination, comms, or
timeline.

## LEAF A — Logical-error recovery (PITR)

Symptom: a bad statement/migration corrupted data; the DB itself is healthy.

1. **Stop the bleeding** — if the bad operation is ongoing, feature-flag the path read-only.
2. Identify the timestamp **just before** the bad op, **in UTC** (Rule 6).
3. PITR a *new recovery branch* to that timestamp (never overwrite prod in place first).
4. Validate on the branch (row counts, spot checks) per `references/restore-drills.md`.
5. Reconcile with the current schema version (see restore-drills.md) — usually same-version here.
6. Cut over: repoint `DATABASE_URL` at the recovery branch, or reset the primary from it.
7. Resume writes; record the incident and the achieved RPO.

RTO/RPO: the tightest in the plan — minutes, inside the PITR window.

## LEAF B — Instance/branch failover

Symptom: the primary branch is unusable but the project/region is up.

1. Promote a clean branch (a recent pre-deploy branch or a fresh PITR branch) to primary.
2. Update the app's connection string to the promoted branch; redeploy.
3. Validate critical read/write paths.

RTO/RPO: minutes to low tens of minutes, depending on how current the promoted branch is.

## LEAF C — Region cutover

Symptom: the DB's region is down; provider/account healthy.

1. If a cross-region replica/standby exists, fail over to it; otherwise restore the latest
   backup into a project in a healthy region.
2. Rotate the new connection string into the edge app env; redeploy (the edge app is multi-region,
   the DB endpoint is what moves).
3. Smoke-test; record the achieved RPO (replica lag, or backup age if restored).

RTO/RPO: set by whether you pay for a warm replica (minutes) or restore cold (the region RTO).

## LEAF D — Provider loss (off-provider restore)

Symptom: account deleted, provider down/gone — Layers 1 & 2 are unreachable.

1. Provision a fresh DB on an alternate provider/region.
2. Apply schema from git migrations to the version matching the dump (see restore-drills.md for
   the version-reconciliation decision).
3. Pull the latest good off-provider dump, decrypt, restore.
4. Rotate the new connection string into the edge app env; redeploy.
5. Smoke-test critical paths (auth, primary flows); communicate status.
6. Record the achieved RPO (dump age) — this is the widest in the plan and is why provider-loss
   RPO is set deliberately, not aspirationally.

## Hand-off boundaries

- **To `rollback-runbook`:** the cause is a bad deploy, not lost data (Q2). It owns code rollback
  and lossless migration reversal; it returns here only when its reversal would be lossy.
- **To `migration-deploy-coordination`:** to locate the irreversibility boundary a restore must
  land before, and to reason about replaying migrations over restored data.
- **To `incident-response`:** all coordination, comms, status-page, and timeline — run in parallel
  with whichever leaf above is executing.
