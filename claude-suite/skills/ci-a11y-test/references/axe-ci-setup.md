Purpose: the concrete `@axe-core/playwright` wiring that runs axe over key routes in CI — WCAG 2.2 AA tags, the route-inventory loop, Clerk auth reuse, four-state scanning, and a build-failing GitHub Actions job.

# Why a real browser, not jsdom

`jest-axe` / `vitest-axe` run against a jsdom render. jsdom has **no layout engine**, so axe's
`color-contrast` rule is silently skipped — the single most common WCAG AA failure goes
undetected. Run axe in a real browser via `@axe-core/playwright` against the built app so the
edge middleware runs and the OKLCH `design-tokens` are computed into real styles. Reuse the
`playwright-e2e` `playwright.config.ts` (`webServer` + the Clerk `setup` project); do not stand
up a second harness.

```bash
pnpm add -D @axe-core/playwright axe-html-reporter
```

# Route inventory (single source)

Keep the gated routes in one typed list that `playwright-e2e` and this gate share. Mark which
need a signed-in session.

```ts
// e2e/routes.ts
export const ROUTES = [
  { path: "/",            auth: false },
  { path: "/pricing",     auth: false },
  { path: "/dashboard",   auth: true  },
  { path: "/projects",    auth: true  },
  { path: "/settings",    auth: true  },
] as const;
```

# The WCAG 2.2 AA tag set

An unscoped `AxeBuilder().analyze()` runs axe's default rule set, which drifts from the AA floor
in `../../CLAUDE.md`. Pin the tags so the run *is* the AA floor:

```ts
// e2e/a11y/withAA.ts
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

export const WCAG_AA_TAGS = [
  "wcag2a", "wcag2aa",      // WCAG 2.0 A + AA
  "wcag21a", "wcag21aa",    // WCAG 2.1 A + AA
  "wcag22aa",               // WCAG 2.2 AA (target-size, focus-not-obscured, etc.)
];

export const axeAA = (page: Page) => new AxeBuilder({ page }).withTags(WCAG_AA_TAGS);
```

# Authenticated scan (reach the actual app)

Most routes are gated. Reuse the Clerk `storageState` the `playwright-e2e` `setup` project
produced via `@clerk/testing/playwright` (`setupClerkTestingToken` + `clerk.signIn`). Keys come
from the Zod-validated env (`env.ts`), never inlined — Rule 9. Define two projects: one default
(public routes) and one with `storageState` for authed routes.

```ts
// playwright.config.ts (add ONLY this to the existing projects array;
// `setup` is already defined by playwright-e2e — reference it, don't redefine it)
{
  name: "a11y",
  dependencies: ["setup"],   // the Clerk setup project from playwright-e2e
  use: { storageState: "playwright/.clerk/user.json" },
  testMatch: /a11y\/.*\.spec\.ts/,
},
```

# The scan loop — every route, every state, zero violations

For each route, visit, wait for the page to settle on a web-first assertion (never
`waitForTimeout`), analyze, and assert empty `violations`. For data-bound screens, drive the
empty and error states (Rule 4) by intercepting the tRPC call and re-analyze each distinct DOM —
an inaccessible error toast or low-contrast empty illustration ships otherwise.

```ts
// e2e/a11y/routes.spec.ts
import { test, expect } from "@playwright/test";
import { axeAA } from "./withAA";
import { ROUTES } from "../routes";

for (const route of ROUTES) {
  test(`a11y: ${route.path} (success)`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.getByRole("main")).toBeVisible();
    const results = await axeAA(page).analyze();
    expect(results.violations, formatViolations(results.violations)).toEqual([]);
  });
}

test("a11y: /projects empty + error states", async ({ page }) => {
  // empty
  await page.route("**/api/trpc/project.list**", (r) =>
    r.fulfill({ json: { result: { data: [] } } }));
  await page.goto("/projects");
  await expect(page.getByText(/no projects yet/i)).toBeVisible();
  expect((await axeAA(page).analyze()).violations).toEqual([]);

  // error
  await page.route("**/api/trpc/project.list**", (r) => r.fulfill({ status: 500 }));
  await page.reload();
  await expect(page.getByRole("alert")).toBeVisible();
  expect((await axeAA(page).analyze()).violations).toEqual([]);
});
```

`formatViolations` is the inline reporter (see `triage-and-handoff.md`) so a failure prints the
rule id, impact, node target, and help URL — not just `expected [] to equal [Array]`.

# CI job — build-failing, artifact-emitting

The job runs the suite headless and fails on any violation. No `continue-on-error`. Upload the
HTML report as an artifact for triage; the failed exit is the gate, the artifact is the detail.

```yaml
# .github/workflows/ci.yml (a11y job)
a11y:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with: { node-version: 20, cache: pnpm }
    - run: pnpm install --frozen-lockfile
    - run: pnpm exec playwright install --with-deps chromium
    - run: pnpm build
    - run: pnpm exec playwright test e2e/a11y   # exits non-zero on any violation
      env:
        CLERK_PUBLISHABLE_KEY: ${{ secrets.CLERK_TEST_PUBLISHABLE_KEY }}
        CLERK_SECRET_KEY: ${{ secrets.CLERK_TEST_SECRET_KEY }}
    - if: failure()
      uses: actions/upload-artifact@v4
      with: { name: axe-report, path: playwright-report/ }
```

`ci-pipeline` decides where this job sits in the graph (it runs after build, alongside
`playwright-e2e`, and gates merge).
