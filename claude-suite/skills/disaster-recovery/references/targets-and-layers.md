Purpose: derive RTO/RPO from business impact (not round numbers), separate what the managed edge DB gives you from what you must configure per driver, and lay out the three backup layers with cadence, off-provider dump mechanics, and a GFS retention policy.

# Targets and backup layers

## Deriving RTO/RPO from business impact

**RTO** (Recovery Time Objective) = the maximum acceptable wall-clock time from "we noticed" to
"we are serving correctly again." **RPO** (Recovery Point Objective) = the maximum acceptable
amount of data loss, measured in *time* (e.g. "up to 5 minutes of writes").

Do not start from a plausible table. Start from cost:

1. **Quantify the cost of downtime and of loss.** Revenue per minute while down; transactions per
   minute that would be lost or replayed; contractual SLA penalties; reputational/regulatory cost
   of losing N minutes of records. A checkout flow losing $X/min justifies a different RTO than an
   internal admin tool.
2. **Set targets per failure class, because cost differs by class.** A 5-minute RPO for a logical
   error (cheap to meet with PITR) is reasonable; a 5-minute RPO surviving full provider loss
   needs continuous off-provider replication that may cost more than the loss it prevents.
3. **Tighten only where the business pays for it.** A tighter RTO/RPO is bought with retention
   spend, a warm/hot standby, and more frequent drills. Each tightening is a `spend-cap` decision.
4. **Record the numbers and their rationale in `DECISIONS.md`.** They are a fork — the project's
   resolution of an abstract default — and everything downstream (retention window, replica,
   drill cadence) is sized from them.

| Failure class | What it is | Typical recovery tool | RTO/RPO driven by |
|---|---|---|---|
| Logical error | bad DELETE / bad migration / app bug | managed PITR to a recovery branch | how fast you detect; cost/min |
| Instance / branch corruption | the primary branch is unusable | promote a clean branch / failover | standby readiness |
| Region loss | the DB's region is down | cut over / restore to another region | cross-region replication or restore time |
| Provider loss | account deleted, provider down/gone | restore Layer-3 dump to a new provider | off-provider cadence + restore time |

The table is a *shape*; the numbers in each cell come from step 1, not from this document.

## What the managed platform gives vs what you must configure

Confirm the driver from `DECISIONS.md` first — the backup model is driver-specific:

**Neon (Postgres).** Gives continuous PITR via retained WAL and copy-on-write branches. The
*default retention window can be short* (hours on a lower tier); it is a setting you must verify
and usually raise to meet your logical-error RPO. PITR and branches live *inside the Neon project*
— they do not survive project deletion or account loss. Off-provider dumps use `pg_dump`/`pg_restore`.

**Turso / libSQL (SQLite).** A different model entirely: point-in-time restore and database dumps
via the Turso platform / `turso db shell <db> .dump`, embedded-replica topology, SQLite-dialect
restore. `pg_dump` does not apply. Plan recovery around libSQL's tooling and record it.

You must configure, regardless of driver: the off-provider copy (Layer 3), encryption, retention
policy, the restore drills, monitoring, and the failover runbook. The platform gives you a floor;
the gap between that floor and your recorded RTO/RPO is your work.

## The three backup layers

- **Layer 1 — managed PITR (primary).** Raise the retention window to cover the logical-error RPO.
  This is the workhorse for "someone ran a bad statement at 14:32 UTC." Effectively near-zero RPO
  *inside the window*, but bounded to the same project/account — not a disaster copy.
- **Layer 2 — pre-deploy snapshot/branch.** Before every risky migration, CI creates a named
  restore point (`pre-deploy-<sha>`). Recovery from a bad deploy becomes "repoint at the branch,"
  proof that rollback works for that specific change. Keep the last ~10; prune older.
- **Layer 3 — independent off-provider logical dump (disaster net).** A scheduled dump shipped to
  an account/cloud you control, separate from the DB provider. This is the *only* layer that
  survives provider loss.

## Off-provider dump mechanics

- **Runs in a Node/CI runtime, never at the edge.** `pg_dump`/`turso ... .dump` need a real
  process and a *direct* (non-pooled) connection string — the edge runtime has neither. Use a
  scheduled GitHub Action / cron worker.
- **Encrypt before it leaves the box (Rule 9).** A dump carries the same PII and secrets as prod.
  GPG or SSE-KMS on every object; the bucket is a prod data store, scoped server-side only.
- **Immutability.** Enable object-lock so a compromised credential cannot delete history.
- **Cadence** follows the provider-loss RPO from step 1 (e.g. nightly full; hourly high-churn
  tables if the RPO is tighter).

## Retention policy (GFS)

Grandfather-father-son: e.g. 7 daily, 4 weekly, 12 monthly, enforced by a storage lifecycle
policy. The depth is a `spend-cap` trade-off against the recorded RPO and any regulatory
retention floor; record the chosen policy in `DECISIONS.md`.
