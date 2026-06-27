Purpose: make a Playwright render byte-reproducible so a pixel diff means a real UI change — freeze time, settle fonts, kill animations, stub data, mask the irreducibly dynamic, and capture all four states plus theme variants.

# Why determinism is the whole game

A visual diff is only signal if everything *except* the code under test is held constant. Every
source of variation below produces a false positive that, left unfixed, gets "solved" by
loosening tolerance — which then hides the true positives. Eliminate variation at the source;
reach for `mask` only for what genuinely cannot be frozen.

# The four variation sources and their fixes

## 1. Animations and transitions

Pass `animations: 'disabled'` — Playwright freezes CSS animations/transitions and sets them to
their end state before capture.

```ts
await expect(page.getByRole("article")).toHaveScreenshot("project-card.png", {
  animations: "disabled",
});
```

Set it globally in config (see `baseline-workflow-and-ci.md`) so no spec forgets it.

## 2. Time (Rule 6 — timestamps are UTC; the display edge formats them)

Any rendered date/relative-time shifts every run. Freeze the clock before navigating so the
component formats a fixed instant:

```ts
await page.clock.setFixedTime(new Date("2026-01-01T00:00:00Z"));
await page.goto("/projects");
```

Use `page.clock.install({ time })` instead when the component runs timers (e.g. a "live" ticker)
you also want paused. The component still receives UTC and converts at the edge — you are only
pinning *which* instant.

## 3. Fonts (FOUT / anti-aliasing noise)

A web font that loads after first paint changes glyph rendering between runs. Wait for fonts to
settle before every shot, and self-host fonts so they are deterministic offline:

```ts
await page.goto("/projects");
await page.evaluate(() => document.fonts.ready);
await expect(page).toHaveScreenshot();
```

## 4. Data (the biggest source — stub it, never shoot live)

Live tRPC data changes row counts, ordering, and content. Intercept the call and return a fixed,
typed fixture. The fixture is typed from the procedure's inferred output (Rule 1) and the shape
is what crosses the boundary (Rule 8) — never an `any`-cast literal.

```ts
import type { inferProcedureOutput } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";

type ProjectList = inferProcedureOutput<AppRouter["project"]["list"]>;

const fixture: ProjectList = [
  { id: "0193...uuidv7", name: "Acme", priceCents: 4900, createdAt: "2026-01-01T00:00:00Z" },
];

await page.route("**/api/trpc/project.list**", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    // tRPC httpBatchLink envelope:
    body: JSON.stringify([{ result: { data: fixture } }]),
  }),
);
```

Money in the fixture is integer minor units (Rule 5); the component formats it at the display
edge, which is exactly what the snapshot verifies.

# Capturing all four states (Rule 4)

Drive each state by varying the routed response, then snapshot it. One spec, four cases:

```ts
test("projects list — loading", async ({ page }) => {
  await page.route("**/api/trpc/project.list**", async (route) => {
    await new Promise((r) => setTimeout(r, 10_000)); // hold so the skeleton is on screen
    await route.abort();
  });
  await page.goto("/projects");
  await expect(page.getByRole("status")).toHaveScreenshot("projects-loading.png");
});

test("projects list — empty", async ({ page }) => {
  await page.route("**/api/trpc/project.list**", (route) =>
    route.fulfill({ body: JSON.stringify([{ result: { data: [] } }]) }),
  );
  await page.goto("/projects");
  await expect(page.getByTestId("projects-root")).toHaveScreenshot("projects-empty.png");
});

test("projects list — error", async ({ page }) => {
  await page.route("**/api/trpc/project.list**", (route) => route.fulfill({ status: 500 }));
  await page.goto("/projects");
  await expect(page.getByRole("alert")).toHaveScreenshot("projects-error.png");
});

test("projects list — success", async ({ page }) => {
  await page.route("**/api/trpc/project.list**", (route) =>
    route.fulfill({ body: JSON.stringify([{ result: { data: fixture } }]) }),
  );
  await page.goto("/projects");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("list")).toHaveScreenshot("projects-success.png", {
    mask: [page.getByTestId("relative-time")], // the one irreducibly dynamic bit
  });
});
```

# Theme variants (guards Rule 3 token output)

Tailwind v4 `@theme` tokens render under light and dark. Capture both — a token edit that breaks
one variant is exactly what this catches:

```ts
test.describe("dark", () => {
  test.use({ colorScheme: "dark" });
  test("project card", async ({ page }) => {
    await page.goto("/components/project-card");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole("article")).toHaveScreenshot("project-card-dark.png");
  });
});
```

# Masking — surgical, not a tolerance dial

`mask` paints a solid box over a locator before comparison. Use it ONLY for content that cannot
be frozen (third-party avatars, a live count you deliberately exclude). Masking the whole card to
"stop flake" defeats the test; freeze the data instead.

```ts
await expect(page).toHaveScreenshot({ mask: [page.getByTestId("owner-avatar")] });
```

# Tolerance — keep it narrow

Prefer fixing the variation over widening tolerance. When a tiny tolerance is needed for
anti-aliasing, set `maxDiffPixels` (an absolute count) rather than a large `maxDiffPixelRatio`,
and keep `threshold` (per-pixel YIQ sensitivity) near its default 0.2. A high ratio is how real
regressions slip through green.

# Authed surfaces

Reuse the Clerk `storageState` produced by `playwright-e2e`'s setup project so the snapshot runs
signed in without re-driving the form. Never embed Clerk keys in a spec (Rule 9) — they come from
the Zod-validated env.
