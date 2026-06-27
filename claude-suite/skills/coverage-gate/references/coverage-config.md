Purpose: the Vitest v8 coverage configuration and the CI step that makes a threshold miss fail the build, with copy-ready config for the edge stack.

# Provider choice

Use the `v8` provider. It reads V8's built-in coverage, so there is no Istanbul source-transform
step — faster, and it matches the node environment unit tests run in. Install:

```bash
pnpm add -D @vitest/coverage-v8
```

`istanbul` is the alternative; reach for it only if you need its remap precision on heavily
transpiled output. On this stack, `v8` is the default — record a switch in `DECISIONS.md`.

# vitest.config.ts — the coverage block

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",           // jsdom only for component-state tests
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      // text  -> console table in CI logs
      // json-summary -> coverage/coverage-summary.json for a PR-comment delta
      // lcov  -> coverage/lcov.info artifact for external dashboards
      reportsDirectory: "./coverage",
      all: true,                    // count files with ZERO tests, not just imported ones —
                                    // without this, an untested module is simply absent and
                                    // the percentage lies upward.
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        // keep this list in sync with references/exclusions-and-budget.md
        "src/db/migrations/**",     // drizzle-kit generated SQL + journal
        "src/db/schema/**",         // table definitions: declarative, no branches
        "**/*.config.*",
        "**/*.d.ts",
        "src/env.*",                // env schema is exercised by its own boundary test
        "**/*.stories.tsx",
        "src/components/ui/**",     // shadcn scaffolds (compose, don't author)
        "src/**/index.ts",          // barrel re-exports: no logic
        "**/__tests__/**",
        "**/*.test.{ts,tsx}",
      ],
      thresholds: {
        // global floor — start from the MEASURED baseline (see budget ref), then ratchet
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,               // branches is intentionally the honest, lower number
        autoUpdate: true,           // green runs raise these in-file; a red run = write a test

        // per-file floors for high-blast-radius logic (Rule 2 / Rule 5)
        "src/lib/money/**": { branches: 100, functions: 100, lines: 100 },
        "src/server/api/**/ownership.ts": { branches: 100, lines: 100 },
        "src/lib/validation/**": { functions: 95, lines: 95 },
      },
    },
  },
});
```

Key points:

- `all: true` is load-bearing. Without it, coverage only counts files that some test imported, so a
  module with no test at all vanishes from the denominator and the percentage looks healthier than
  reality.
- `thresholds` (not just `reporter`) is what makes `vitest run --coverage` exit non-zero below
  budget. Reporters alone print and exit 0 — decoration, not a gate.
- `autoUpdate: true` rewrites the threshold values in this file upward after a green run. Commit the
  bump. It never lowers them.

# package.json scripts

```jsonc
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

# The CI step (lives inside ci-pipeline)

The coverage gate is one step in the test job that `ci-pipeline` owns. Minimal GitHub Actions
shape:

```yaml
      - run: pnpm test:coverage
        # exits non-zero if any threshold is missed -> the job (and build) fails.

      - name: Upload coverage artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage-lcov
          path: coverage/lcov.info
```

The whole point is the first step's exit code. Do not wrap it with `|| true`, do not add
`continue-on-error: true`, and do not move thresholds out of config into a hand-rolled grep — the
config-driven exit is the gate.

# Suppressing a genuinely unreachable line

When a line cannot be hit (a defensive `default:` after an exhaustive switch, an
environment-impossible branch), annotate the specific line rather than excluding the whole file:

```ts
/* v8 ignore next */
throw new Error("unreachable: exhaustive switch");
```

This keeps the file's real logic in the denominator. Excluding the file would hide the rest.
