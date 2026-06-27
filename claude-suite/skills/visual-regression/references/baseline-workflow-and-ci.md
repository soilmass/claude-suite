Purpose: configure Playwright visual comparison, pin the OS/browser so baselines are comparable, and run the generate→review→commit baseline workflow that keeps a snapshot a *reviewed* artifact rather than a rubber-stamped one.

# Config: `playwright.config.ts`

Set the visual-comparison defaults centrally so no spec forgets them, and make the snapshot path
explicit and platform-suffixed.

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  // One file of baselines per OS/browser; the {platform}/{projectName} keep them disjoint.
  snapshotPathTemplate: "{testDir}/__screenshots__/{platform}/{projectName}/{testFilePath}/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      animations: "disabled",   // freeze every animation by default (see deterministic-snapshots.md)
      caret: "hide",            // no blinking text caret
      scale: "css",             // stable across device-pixel-ratios
      maxDiffPixels: 100,       // narrow absolute tolerance for anti-aliasing only
      threshold: 0.2,           // per-pixel YIQ sensitivity (default); do NOT inflate to pass
    },
  },
  use: { baseURL: process.env.E2E_BASE_URL },
});
```

`maxDiffPixels` (absolute) is safer than `maxDiffPixelRatio` (relative) for small components — a
ratio that tolerates a fixed *percentage* scales the blind spot with the element size.

# Pinning the rendering environment (non-negotiable)

Screenshots are platform-specific: font hinting, sub-pixel anti-aliasing, and emoji rendering
differ between macOS, Windows, and Linux. A baseline generated on one and compared on another
fails 100% of the time on noise. Generate AND compare in the same pinned container.

- Use `mcr.microsoft.com/playwright:vX.Y.Z-jammy` where `vX.Y.Z` **exactly matches** your
  installed `@playwright/test` version (mismatched browser builds also shift rendering).
- Generate baselines locally *inside* that image, not on the host OS:

```bash
docker run --rm -it -v "$PWD":/work -w /work \
  mcr.microsoft.com/playwright:v1.49.0-jammy \
  npx playwright test --update-snapshots --grep @visual
```

- Record the pinned image tag and the decision to store baselines in git (vs. an external
  service) in `DECISIONS.md`. Bumping `@playwright/test` is a deliberate baseline-regeneration
  event, reviewed like any intended visual change.

# The baseline workflow: generate → REVIEW → commit

A baseline is a reviewed artifact. The dangerous shortcut is `--update-snapshots` followed by an
unseen commit, which bakes whatever is currently on screen — including the bug — in as truth.

1. **Generate** the new/changed baselines in the pinned image (command above).
2. **Review every changed PNG** before staging. `git status` shows added/modified `*.png` under
   `__screenshots__/`; open each and confirm it is the *intended* render. For a change PR, open
   the actual/expected/diff triplet Playwright writes to `test-results/` on failure.
3. **Commit the PNGs as tracked artifacts**, in the *same* PR as the code/token change that
   caused them — so a reviewer sees the visual delta and its cause as one unit. Never a separate
   "fix snapshots" commit divorced from its cause.
4. **On an intended design-token change** (`design-tokens` drove a palette/spacing edit),
   regenerate deliberately and let the PNG diff document the intended visual change.

Add the snapshot diff scratch output to `.gitignore`, but track the baselines:

```gitignore
test-results/
playwright-report/
# baselines ARE committed — do not ignore __screenshots__/
```

# What `ci-pipeline` runs (this skill defines the job; ci-pipeline wires it)

The CI job, owned by `ci-pipeline`, must:

- Run in the **same pinned** `mcr.microsoft.com/playwright` image as local generation.
- Run comparison only (no `--update-snapshots` in CI — CI never writes baselines).
- On failure, **upload the `test-results/` actual/expected/diff PNGs** as artifacts so a human
  adjudicates the diff instead of guessing from a red check.
- Fail the build on any diff outside tolerance — a visual regression is build-failing, like the
  performance budget.

```yaml
# illustrative; the real job lives in ci-pipeline
- name: Visual regression
  run: npx playwright test --grep @visual
- if: failure()
  uses: actions/upload-artifact@v4
  with: { name: visual-diffs, path: test-results/ }
```

# Updating after a legitimate change (the safe loop)

```bash
# 1. make the intended code/token change
# 2. regenerate inside the pinned image
docker run --rm -v "$PWD":/work -w /work \
  mcr.microsoft.com/playwright:v1.49.0-jammy \
  npx playwright test --update-snapshots --grep @visual
# 3. review every changed PNG, then commit code + baselines together
git add src/ __screenshots__/ && git commit
```

If many baselines go red from one intended change, that is expected — review them, do not assume
the count means "just accept all." A wrong baseline accepted at scale is the failure this skill
exists to stop.
