Purpose: the build-failing checklist (exit-code contract + anti-patterns), masked-secret/env handling, and the `gh` commands that make gate jobs required for merge.

# Build-failing checklist

A gate is only a gate if its failure fails the build AND blocks the merge. Both halves matter:
the job must turn red, and that red must be required.

## The exit-code contract
Every gate script follows the suite convention: **exit code = number of findings, 0 = clean.**
A GitHub Actions step fails the job when its command exits non-zero. So the correct wiring is
simply to run the script directly:

```yaml
- run: pnpm rule-audit        # exits non-zero on findings -> job fails. Done.
```

Nothing else is needed. Any extra wrapping that captures, inspects, or discards the exit code
is how the gate gets defanged.

## Anti-patterns that silently defang a gate (audit for ALL of these)
```yaml
- run: pnpm rule-audit
  continue-on-error: true     # ❌ job goes green even on findings
- run: pnpm audit:ci || true  # ❌ exit code discarded
- run: |                      # ❌ `set +e` + unchecked code
    set +e
    pnpm test:coverage
    echo "done"
- run: pnpm perf:budget       # ❌ step skipped with if: ${{ false }}, check never reports (required checks block forever)
  if: ${{ false }}
```
Also catch: a step that pipes the script through `tee` without `set -o pipefail` (pipe masks
the exit code); a composite action whose final step always `exit 0`; a `try/catch` in a Node
wrapper that logs and returns 0; marking the whole job `if: always()` in a way that ignores a
prior failure. Any deliberate non-blocking exception is recorded in `DECISIONS.md` with reason.

## pipefail rule
When a gate step uses a pipe, set the shell so the pipe's failure propagates:
```yaml
defaults:
  run:
    shell: bash    # GitHub's bash runs with `set -eo pipefail` by default; make it explicit
```

# Secrets and env (CLAUDE.md Rule 9)

Gates that render the app (a11y, perf) need the same edge env the app needs. Supply it only via
masked CI secrets, never inlined, never logged.

- Store Clerk keys, the Neon/Turso driver URL, etc. as **repository or environment secrets**.
- Reference them in `env:` as `${{ secrets.NAME }}` — GitHub masks them in logs automatically.
- **Never** `echo "$DATABASE_URL"` or `run: echo ${{ secrets.X }}` "for debugging" — that
  prints the secret (masking covers exact matches, not transforms/base64).
- Validate env at job start with the **same Zod env schema the app uses** (Rule 8) so a missing
  CI secret fails loudly with a clear message, not a confusing render error later:
  ```yaml
  - run: pnpm exec tsx src/env.ts   # parses process.env through the Zod schema; throws on miss
  ```
- Secret-needing jobs do not run on external-fork PRs (secrets are withheld). Gate those via a
  manual-approval `environment:` or a maintainer label — never disable the gate to "support
  forks".

# Making jobs required for merge (the most-skipped step)

A red check that does not block merge is theater. Mark every gate job's check as required on the
default branch. Prefer a **ruleset** (`gh api`) over legacy branch protection.

```bash
# Create/replace a ruleset requiring the gate checks + PR review on main.
gh api -X POST repos/:owner/:repo/rulesets \
  -f name='main-gates' \
  -f target='branch' \
  -F enforcement='active' \
  -f 'conditions[ref_name][include][]=refs/heads/main' \
  -f 'rules[][type]=pull_request' \
  -F 'rules[][parameters][required_approving_review_count]=1' \
  -f 'rules[][type]=required_status_checks' \
  -F 'rules[][parameters][strict_required_status_checks_policy]=true' \
  -f 'rules[][parameters][required_status_checks][][context]=typecheck' \
  -f 'rules[][parameters][required_status_checks][][context]=lint' \
  -f 'rules[][parameters][required_status_checks][][context]=rule-audit' \
  -f 'rules[][parameters][required_status_checks][][context]=coverage' \
  -f 'rules[][parameters][required_status_checks][][context]=a11y' \
  -f 'rules[][parameters][required_status_checks][][context]=perf-budget' \
  -f 'rules[][parameters][required_status_checks][][context]=deps'
```
- `strict_required_status_checks_policy: true` requires the PR branch be up to date with main
  before merge — stops a stale-branch green check from hiding a break introduced on main.
- The `context` strings must exactly match the **job names** in `ci.yml` (or the job-level
  `name:`). A typo means the check is "required" but never reported, blocking all merges forever.
- Verify with `gh api repos/:owner/:repo/rulesets`.

## Path-filtered / skipped jobs and required checks
If you scope a job with `paths:` filters in a monorepo, a skipped job reports no status — and a
required check that never reports **blocks merge forever**. Either: (a) keep the job always-run
and short-circuit inside with an `if:`-guarded success step, or (b) use a "required-checks
aggregator" job that `needs:` all gates and itself is the single required check. The aggregator
pattern is cleanest at scale:
```yaml
  gates-passed:
    needs: [typecheck, lint, rule-audit, coverage, a11y, perf-budget, deps, secret-scan, visual]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - run: |
          [ "${{ contains(needs.*.result, 'failure') }}" = "false" ] || exit 1
```
Then require only `gates-passed`.

# Verify against failure
A pipeline never tested against a real failure is assumed broken. Open a known-bad PR:
- an `any` or `@ts-ignore` → `typecheck`/`rule-audit` red,
- an `<img>` without dimensions / a contrast regression → `a11y` red,
- a deleted test → `coverage` red,
- a pinned-vulnerable dep → `deps` red.
Confirm each turns the check red AND the PR shows "merging is blocked". Only then hand the green
artifact to `deploy-edge`.
