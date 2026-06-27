Purpose: mechanism-to-benefit rewrite patterns with before/after examples, and the upgrade-path template for breaking changes and migrations.

# The translation rule

A commit/PR describes a **mechanism** (what the code now does). A release note describes the
**benefit or impact** (what changes for the reader). Every entry is the second, derived from the
first. Ask of each raw item: "If I only read this, what can I now do, or what must I do?"

# Before → after (mechanism → benefit)

| Raw (mechanism) | Release note (benefit/impact) |
| --- | --- |
| `feat(invoices): add cursor pagination to listInvoices` | Invoice lists now load instantly even past 50 rows. |
| `perf(db): add index on orders.user_id` | The orders page loads noticeably faster for large accounts. |
| `fix(auth): handle null session in middleware` | Fixed an occasional sign-out loop on slow connections. |
| `refactor(trpc): extract billing into its own router` | (No user-facing note — internal. Collapse into "internal improvements" or drop.) |
| `feat!: rename CLERK_SECRET to CLERK_SECRET_KEY` | **Breaking:** the `CLERK_SECRET` env var is now `CLERK_SECRET_KEY`. See upgrade steps. |
| `chore: bump min node to 20` | You now need Node 20 or newer to self-host. |

Rules of thumb:
- Bug fixes are framed by the **symptom the user saw**, not the root cause ("fixed a crash when
  exporting empty reports", not "guard against undefined rows array").
- Pure internal refactors with zero user-visible effect produce **no entry**, or collapse into a
  single "internal improvements and stability" line. Do not pad the notes with them.
- Performance wins state the felt effect ("faster", "instant") and, where you have a number from a
  perf budget run, the measured improvement.

# Upgrade-path template (breaking changes & required migrations)

Every Breaking-changes entry that requires reader action carries an explicit, ordered path the
reader can follow without reading source. Template:

```
### Breaking: <one-line what changed>

Impact: <who is affected and what breaks if they do nothing>.

Upgrade:
1. <first concrete step — exact command, file, or value>
2. <next step>
3. <verify step — how to confirm it worked>

Rollback: <how to revert if the upgrade fails>.
```

Example (env-var rename):

```
### Breaking: the CLERK_SECRET env var is now CLERK_SECRET_KEY

Impact: deployments still using CLERK_SECRET will fail to authenticate on boot.

Upgrade:
1. Rename CLERK_SECRET to CLERK_SECRET_KEY in your environment (.env, host dashboard, CI secrets).
2. Redeploy.
3. Verify a protected route returns your user — not a 401.

Rollback: restore the old var name and redeploy the previous release tag.
```

# When a schema migration ships

Release notes describe **user impact**, not the SQL. For a migration:

- State what the reader experiences (downtime expectations, a one-time reindex, none).
- Because the stack migrates via **expand-contract across separate deploys** (see ../../CLAUDE.md
  Migrations and the `migration-author` skill), tell the reader which deploy they are on and what
  each requires — do not present a destructive change as a single step.
- Link the `migration-author` output for the operational sequence; do not re-document columns or
  the `down` migration here.
- Record any non-obvious upgrade ordering or data-backfill caveat in `DECISIONS.md`.

# Deprecation entries

A deprecation is a promise, so it must be specific:

- What is deprecated, the replacement, and the **version it will be removed in**.
- Keep the old path working until that version (notes must not claim removal before it happens).
- Flag the removal date/version for `perishable-refresh` so a stale "will be removed in v2" does not
  outlive v2.
