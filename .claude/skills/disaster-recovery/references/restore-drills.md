Purpose: turn a backup into a proven recovery path — the tested restore procedure, the drill cadence and assertions, measuring achieved RTO/RPO, and the load-bearing detail the naive plan misses: a restore lands you on an OLD schema version that must be reconciled with current migrations (in UTC, Rule 6).

# Restore drills and schema-version reconciliation

## Why the drill is the whole point

A backup is a claim until a restore proves it. The failures a drill catches — a dump that has been
silently truncating for weeks, a restore that needs an extension the target lacks, a recovery that
technically works but takes 6 hours against a 1-hour RTO — are invisible until you actually run it.
This is the concrete form of the rule "never trust a backup you have not restored."

## The tested restore procedure

1. **Provision a throwaway target.** A fresh DB (new branch / new project / scratch container) —
   never the production instance.
2. **Restore the backup end-to-end.** Layer 1: PITR a recovery branch to the target timestamp.
   Layer 3: decrypt the dump and `pg_restore` / libSQL-restore into the scratch target.
3. **Assert, do not eyeball.** Run a script that checks: table row counts against an expected
   range, key foreign-key integrity, a few known-row spot checks, and that critical indexes exist.
   Fail loudly on any drift — a green "it ran" without assertions is not a pass.
4. **Time it.** Record wall-clock from "start restore" to "assertions pass" — this is your *actual*
   RTO for that path. Record the lag between the backup's timestamp and now — this bounds the RPO.
5. **Tear down** the throwaway target.

## Drill cadence

- **Monthly (automated):** restore the latest off-provider dump into a throwaway target, run the
  assertion script, tear down. This is the single most important recurring job in the plan.
- **Quarterly (game-day, human):** simulate full provider loss — restore to an *alternate*
  provider/region end-to-end, reconnect a staging app, and measure achieved RTO/RPO against the
  recorded targets. Update the runbook with whatever bit you.
- **Per migration:** the pre-deploy branch (Layer 2) is the per-change proof that rollback works.

## Measuring achieved vs target

After each drill, compare achieved RTO/RPO to the `DECISIONS.md` targets and record the delta.
A drill that *restores correctly but misses RTO* is not a green drill — the backup is valid, the
*procedure* is too slow. Fix the procedure (pre-provisioned standby, scripted restore, parallel
restore) rather than declaring success. A drill that misses RPO means the cadence/window is wrong.

## Reconciling restored data with the current schema (the part the naive plan skips)

A restore to timestamp **T** returns data shaped for the **schema version live at T**, not today's.
"The dump is just data, schema rebuilds from git" is the trap: if you `drizzle-kit migrate` the
current migration set over restored *old* data, or point *current* code at the restored *old*
schema, you get column-not-found errors or a half-applied state.

Decide, explicitly, per restore:

- **Restore is recent (data is same schema version as live):** reconcile is trivial — promote /
  cut over directly. The common logical-error case.
- **Restore predates migrations that have since applied:** you must either
  (a) **replay forward** — apply the migrations between version(T) and now over the restored data,
      which only works if those migrations are data-safe over the restored rows (use
      `migration-deploy-coordination`'s expand-contract sequencing reasoning), or
  (b) **promote the matching prior code build** so code and the restored schema agree, then catch
      the schema up forward under control.
- **Restore must land before a destructive contract migration** (it dropped a column you need
  back): restore to the **pre-contract** point — this is exactly the
  `migration-deploy-coordination` irreversibility boundary. Do not run a migration `down` that
  fabricates an empty column; that lossy path belongs to `rollback-runbook`.

## UTC discipline for PITR targets (Rule 6)

The app stores timestamps as `timestamptz` in UTC. Identify the PITR target — "just before the bad
operation" — **in UTC**, consistently. Reasoning in local time and passing a local string is a
classic off-by-timezone error that restores to the wrong moment (an hour of writes too much or too
little). Use explicit `Z`/UTC timestamps in every restore command.
