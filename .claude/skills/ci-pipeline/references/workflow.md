Purpose: the annotated GitHub Actions `ci.yml` for the edge stack — triggers, concurrency, the parallel gate job graph, caching, and where each sibling gate plugs in.

# The pipeline shape

One workflow, `.github/workflows/ci.yml`. Triggers on PRs (the enforcement point), the merge
queue, and a scheduled run for the dependency scan. Cheap broad-failure jobs first; heavier
gates in parallel after. Every gate job runs its sibling skill's script and fails on non-zero
exit (suite convention: exit code = number of findings, 0 = clean).

```yaml
name: ci

on:
  pull_request:           # the enforcement point — every PR is gated
  merge_group:            # required for a merge queue
  push:
    branches: [main]      # post-merge signal only, NEVER the sole trigger
  schedule:
    - cron: "0 6 * * 1"   # weekly dependency-audit, independent of PRs

# Stop superseded runs on the same ref; don't cancel the protected branch.
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}

permissions:
  contents: read          # least privilege; add only what a job proves it needs

jobs:
  setup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm     # caches the pnpm store keyed on the lockfile
      - run: pnpm install --frozen-lockfile

  typecheck:              # fast, broad-failure — runs first
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck          # tsc --noEmit; enforces Rule 1 (type chain)

  lint:                   # fast — parallel with typecheck
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  rule-audit:             # the nine inviolable rules — owned by rule-audit
    needs: [typecheck, lint]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }     # full history so the audit can diff the PR
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm rule-audit         # non-zero exit fails the job

  coverage:               # threshold owned by coverage-gate
    needs: [typecheck, lint]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:coverage      # vitest run --coverage; fails under threshold

  a11y:                   # axe over key routes — owned by ci-a11y-test
    needs: [typecheck, lint]
    runs-on: ubuntu-latest
    env:                  # edge env the rendered app needs (see gate-wiring.md)
      CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.CLERK_PUBLISHABLE_KEY }}
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm build && pnpm test:a11y   # axe run fails on any violation

  perf-budget:            # LCP/INP/CLS p75 budget — owned by perf-budget-check
    needs: [typecheck, lint]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm perf:budget        # Lighthouse-CI assert; non-zero exit fails

  deps:                   # supply-chain scan — owned by dependency-audit
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit:ci           # gate script; interpretation stays in dependency-audit
```

## Caching notes
- `cache: pnpm` on `setup-node` caches the **store**, not `node_modules`; `--frozen-lockfile`
  keeps installs reproducible and fails on lockfile drift.
- Cache the `.next/cache` dir keyed on the lockfile + source hash for the jobs that `pnpm build`
  (a11y, perf) to cut build time. Use `actions/cache` with a restore-key fallback.

## Build the app once, reuse it
The `a11y` and `perf-budget` jobs both need a production build. For larger repos, add a `build`
job that uploads the `.next` output as an artifact and have a11y/perf `needs:` it and download —
trades artifact I/O for one fewer build. Keep it one build only when build time is small.

## Where each gate plugs in
| Job | Sibling skill | What its script enforces |
|-----|---------------|--------------------------|
| `typecheck` | (built-in) | Rule 1 — unbroken type chain |
| `rule-audit` | `rule-audit` | the nine rules over the PR diff |
| `coverage` | `coverage-gate` | coverage threshold + ratchet |
| `a11y` | `ci-a11y-test` | axe clean over key routes, all four states (Rule 4) |
| `perf-budget` | `perf-budget-check` | LCP/INP/CLS p75 budget |
| `deps` | `dependency-audit` | supply-chain advisories |

This skill owns the wiring above. The *logic* of each gate — what it checks, how to read its
output — belongs to the sibling skill in the table. Do not reimplement a gate here.
