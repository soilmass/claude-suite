Purpose: wire Clerk into Playwright on the edge stack — testing tokens, a one-time sign-in setup project, and reused storageState — so authenticated specs are fast and not blocked by bot detection.

# Clerk + Playwright auth setup

Use the official `@clerk/testing` package — do not hand-roll Clerk session cookies, and do not
mock Clerk away entirely (that stops the spec from being end-to-end).

```
npm i -D @playwright/test @clerk/testing
```

## Test instance, not production (Rule 9)

Always run against a Clerk **development/test instance**. Keys come from the same Zod-validated
env the app uses (see `env-validation`), never inlined:

```
# .env.test (git-ignored) — test-instance keys only
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
E2E_CLERK_USER_EMAIL=qa+e2e@example.com
E2E_CLERK_USER_PASSWORD=...        # a dedicated, disposable test user
```

`setupClerkTestingToken` injects a token that makes Clerk skip bot/CAPTCHA detection for the
request — without it, programmatic sign-in is blocked intermittently and produces the classic
"works locally, flaky in CI" failure.

## Global setup: clerkSetup()

`clerkSetup()` fetches a Testing Token using `CLERK_SECRET_KEY` and exposes it to the run.

```ts
// e2e/global.setup.ts
import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

setup("global clerk setup", async () => {
  await clerkSetup();
});
```

## Auth setup project: sign in once, save storageState

Sign in a single time, persist the authenticated browser state, and let every other spec reuse
it. This avoids re-driving the sign-in form per test (slow and flaky).

```ts
// e2e/auth.setup.ts
import { test as setup, expect } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";

const authFile = "e2e/.auth/user.json";

setup("authenticate", async ({ page }) => {
  await setupClerkTestingToken({ page });
  await page.goto("/");                       // load app so Clerk JS is present
  await clerk.signIn({
    page,
    signInParams: {
      strategy: "password",
      identifier: process.env.E2E_CLERK_USER_EMAIL!,
      password: process.env.E2E_CLERK_USER_PASSWORD!,
    },
  });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
  await page.context().storageState({ path: authFile });
});
```

Reference `authFile` from the browser projects via `storageState` (see config in
`four-states-and-stability.md`). The `.auth/` dir must be git-ignored.

## Per-test for unauthenticated cases

For sign-in/sign-up specs themselves (the flow under test), do NOT use the saved state — start
clean and still call `setupClerkTestingToken({ page })` in a `beforeEach` so the form-driven
sign-in is not bot-blocked. Assert the post-sign-in redirect lands on the protected route.

## Testing the redirect (middleware coverage)

A visit to a protected route with no session should redirect to `/sign-in`. Run that in a
project with no `storageState` and assert `await expect(page).toHaveURL(/\/sign-in/)`. This
proves `clerkMiddleware` (from `clerk-auth-flows`) actually guards the route.

## Notes / pitfalls

- `clerk.signIn` requires the Clerk JS to be loaded — `page.goto` an app route first.
- If the app uses Clerk **organizations**, set the active org after sign-in (`clerk.setActive`)
  so `ctx.auth.orgId` is populated for org-scoped ownership checks.
- Rotate or scope the test user so a leaked `.env.test` cannot touch real data.
