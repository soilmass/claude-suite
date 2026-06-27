Purpose: Vitest install and configuration for the edge stack, the node-vs-jsdom environment split, file layout, scripts, coverage, and the unit-scope boundary (no db, no network, no Clerk).

## Install

```bash
pnpm add -D vitest @vitest/coverage-v8
# only if a test renders a component:
pnpm add -D jsdom @testing-library/react @testing-library/jest-dom
```

## Config — `vitest.config.ts`

Logic tests run in `node`. The edge runtime is a deploy target, not a test runtime: pure
functions are plain TypeScript, so the fast `node` environment is correct. Only component tests
need `jsdom`, scoped per-file with a docblock, not globally.

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths"; // resolves "@/..." like Next

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,                 // describe/it/expect without imports
    environment: "node",           // default; logic needs no DOM
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/db/**", "src/server/api/routers/**"],
    },
  },
});
```

Per-file environment override for the rare component test:

```ts
// @vitest-environment jsdom
```

## Setup file — `vitest.setup.ts`

```ts
import { afterEach, vi } from "vitest";

// One global safety net: never let a test leak a frozen clock into the next.
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
```

If component tests exist, also `import "@testing-library/jest-dom/vitest";` here.

## Scripts — `package.json`

```jsonc
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage"
  }
}
```

## File layout

Co-locate the test with its source — one `*.test.ts` beside the module it covers:

```
src/
  lib/pricing.ts
  lib/pricing.test.ts          # unit: calculateLineTotal, applyDiscount
  lib/dates.ts
  lib/dates.test.ts
  schemas/product.ts
  schemas/product.test.ts      # the shared Zod schema, tested as a boundary
```

The function under test is the plain function a thin procedure calls (per `../../CLAUDE.md`:
procedures validate, authorize, **call a function**, return). The router file is excluded from
unit coverage on purpose — it belongs to `trpc-integration-test`.

## The unit-scope boundary — what a unit test must NOT touch

| Forbidden in a unit test | Why / where it belongs |
| --- | --- |
| The Drizzle `db` client (real or mocked) | If logic needs db, extract the pure part; the db path is integration scope. |
| `fetch` / any network | Inject the result as an argument; network is integration scope. |
| Clerk `auth()` / `currentUser()` | Auth + ownership (Rule 2) is exercised in `trpc-integration-test`. |
| `process.env` reads | Pass config in as a parameter; env parsing is tested where the Zod env schema lives. |
| The real clock (`Date.now()`, `new Date()`) | Inject `now`, or freeze with `vi.setSystemTime` (Rule 6). |

If you find yourself writing `vi.mock("@/db")` to test a function, that is the signal the logic
is trapped in a procedure. Extract it (`refactor`), then unit-test the extraction. The mock is
the smell, not the solution.

## Why no `tsx`/ts-node config is needed

Vitest transpiles TypeScript via esbuild out of the box and `vite-tsconfig-paths` honors the
project's path aliases, so tests import `@/lib/pricing` exactly as production code does — keeping
the type chain (Rule 1) identical between test and runtime.
