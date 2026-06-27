Purpose: the playwright.config.ts shape, how to drive all four component states (Rule 4) in the browser by intercepting tRPC, and the locator/assertion/flake rules that keep specs stable.

# Config, four states, and stability

## playwright.config.ts

Boot the real app so the edge runtime and `clerkMiddleware` actually run; chain the setup
projects so auth state exists before browser tests start.

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",        // a trace to debug, not a sleep to mask
  },
  projects: [
    { name: "global", testMatch: /global\.setup\.ts/ },
    { name: "auth", testMatch: /auth\.setup\.ts/, dependencies: ["global"] },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      dependencies: ["auth"],
    },
  ],
  webServer: {
    command: "npm run build && npm run start",   // built app = prod-like edge behavior
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

Use the built app in CI (`build && start`); dev server is acceptable locally but record the
choice in `DECISIONS.md` if a spec behaves differently between them.

## Driving all four states (Rule 4) by intercepting tRPC

tRPC over the HTTP link hits `/api/trpc/<router>.<proc>`. `page.route` lets you force each state
deterministically instead of depending on real data.

```ts
import { test, expect } from "@playwright/test";

const LIST = "**/api/trpc/project.list*";

test("loading state", async ({ page }) => {
  await page.route(LIST, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));   // hold the response open
    await route.continue();
  });
  await page.goto("/projects");
  await expect(page.getByRole("status")).toBeVisible();   // spinner/skeleton
});

test("empty state", async ({ page }) => {
  await page.route(LIST, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      // tRPC httpBatchLink envelope: an array of { result: { data: { json } } }
      body: JSON.stringify([{ result: { data: { json: [] } } }]),
    }),
  );
  await page.goto("/projects");
  await expect(page.getByText(/no projects yet/i)).toBeVisible();
});

test("error state", async ({ page }) => {
  await page.route(LIST, (route) => route.fulfill({ status: 500 }));
  await page.goto("/projects");
  await expect(page.getByRole("alert")).toBeVisible();      // error fallback
  await expect(page.getByRole("button", { name: /retry/i })).toBeVisible();
});

test("success state", async ({ page }) => {
  await page.goto("/projects");                              // real data
  await expect(page.getByRole("listitem")).not.toHaveCount(0);
});
```

Note the envelope shape depends on the tRPC link/transformer (`superjson` wraps payloads in
`json`). Confirm the real network shape in DevTools before hand-writing a `fulfill` body, or
intercept and reshape the real response with `route.fetch()` + edit.

## Locators — by role, never by class (brittleness)

| Do | Avoid |
|----|-------|
| `getByRole("button", { name: /save/i })` | `locator(".btn-primary")` |
| `getByLabel("Email")` | `locator("input").nth(2)` |
| `getByText(/welcome/i)`, `getByTestId(...)` | XPath, deep CSS chains |

Role/label locators survive Tailwind restyles (Rule 3 churns class names) and double as an
accessibility signal that pairs with `ci-a11y-test`.

## Web-first assertions — never sleep

- `await expect(locator).toBeVisible()` auto-retries to the timeout. Same for `toHaveText`,
  `toHaveURL`, `toBeEnabled`.
- For a specific network round-trip: `await page.waitForResponse((r) => r.url().includes("project.create") && r.ok())`.
- `page.waitForTimeout(...)` is banned — it is either too short (flake) or too slow (waste).

## Flake-elimination checklist

- [ ] Zero `waitForTimeout` / arbitrary sleeps.
- [ ] Every locator is role/label/text/testid — no CSS class or `nth`.
- [ ] All four states asserted for each data-bound critical screen (Rule 4).
- [ ] Auth via testing token + reused `storageState`, not per-test form-filling.
- [ ] Each test seeds + cleans its own data; no order dependence (`fullyParallel`).
- [ ] `--repeat-each=5` passes locally before commit.
- [ ] CI: `retries: 2`, `trace: "on-first-retry"`, runs the built app, paired with `ci-a11y-test`.
