---
name: visual-regression
description: >
  Catch unintended UI change with Playwright pixel snapshots of components and key pages —
  the diffs that compile, pass functional tests, and still ship a broken layout, a regressed
  spacing token, or a color shift no assertion covers. Encodes the two things generated
  snapshot code gets wrong: making the render deterministic (frozen clock, disabled animations,
  loaded fonts, stubbed data) and pinning the OS/browser so a baseline is a reviewed artifact,
  not noise. Snapshots each of Rule 4's four states and the theme variants, not one happy frame.
  Use when: "visual regression", "screenshot test", "ui snapshot", "visual diff".
  Do NOT use for: functional state behavior like clicks/inputs/assertions (use component-state-test),
  or wiring the snapshot job into CI itself (use ci-pipeline).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the visual-regression failure class: flaky, non-deterministic
    snapshots taken on the wrong OS and blindly --update-snapshots'd, so the baseline locks in the
    bug instead of catching it.
    Baseline observed (clean-room capture).
---

# visual-regression

Pixel-level coverage of the presentational surface a functional test cannot prove: that a
component or key page still *looks* right after a refactor, a dependency bump, or a token edit.
This skill encodes what generated snapshot code gets wrong — determinism (so the diff means
something) and OS/browser pinning (so the baseline is comparable) — then snapshots all four
states (Rule 4) and the theme variants rather than one frame.

Spine and the nine inviolable rules live in `../../CLAUDE.md`. This skill obeys them and does
not restate them.

---

## Non-Negotiable Rules

A visual suite that is non-deterministic or rubber-stamped is worse than none — it goes red on
noise, gets muted, and stops catching the real regression. Hard lines:

- **Never `--update-snapshots` without eyeballing every changed PNG.** A baseline is a *reviewed*
  artifact. Blind-accepting the diff locks the bug in as the new truth — the exact failure this
  skill prevents.
- **Never snapshot non-deterministic content unmasked.** Freeze the clock (Rule 6 timestamps),
  stub tRPC data with fixed fixtures, wait for `document.fonts.ready`, disable animations, and
  `mask` genuinely dynamic regions (avatars, relative dates). Unmasked volatility = perpetual flake.
- **Never generate or compare baselines on a different OS/browser than CI.** Snapshots are
  platform-specific (font hinting, anti-aliasing differ). Pin the `mcr.microsoft.com/playwright`
  image to your `@playwright/test` version; record the tag in `DECISIONS.md`.
- **Never silence a diff by inflating `maxDiffPixelRatio`/`threshold`.** A loose tolerance to
  "make it pass" blinds the suite to real shifts. Tune narrow; investigate every diff.

Refuse these rationalizations: "just update all the snapshots"; "bump the threshold so it
passes"; "snapshot the whole page, masking is overkill"; "I'll generate baselines on my Mac,
CI will sort it out."

---

## When to Use

- Adding pixel coverage for a stable presentational surface: a shadcn-composed component, a
  marketing/landing page, the key dashboard layout.
- Locking the rendered output of design tokens so a stray `@theme` edit (Rule 3) is caught.
- Guarding against silent UI breakage from a dependency bump, Tailwind upgrade, or refactor.
- Proving each of Rule 4's four states and the light/dark variants render as designed.

## When NOT to Use

- Asserting behavior — clicks, form input, query status, "the error fallback renders" → `component-state-test`
  (functional) or `playwright-e2e` (full browser flow).
- Wiring the snapshot job, artifact upload, or sharding into the pipeline → `ci-pipeline`.
- Auditing rendered output against axe / WCAG → `a11y-gate` (pixels are not accessibility).
- Generating or changing the tokens themselves → `design-tokens` (this skill *guards* their output).

---

## Procedure

1. **Pick WHAT to snapshot, narrowly (low).** Visual regression is for stable, presentational
   surfaces — prefer component-level `locator.toHaveScreenshot()` over full-page shots of
   data-heavy screens. Pull the candidate list from `test-strategy`; do not snapshot everything.
2. **Pin the rendering environment (high).** Baselines are OS/browser-specific. Run local
   generation and CI in the same pinned `mcr.microsoft.com/playwright:vX.Y.Z-jammy` image, tag
   matching `@playwright/test`. Record the tag in `DECISIONS.md`. See `references/baseline-workflow-and-ci.md`.
3. **Make the render deterministic (high).** Disable animations, `page.clock.setFixedTime` for
   timestamps (Rule 6), `await document.fonts.ready`, and stub tRPC calls with fixed typed
   fixtures via `page.route` (Rule 8 — fixtures typed from inference, Rule 1). Reuse Clerk
   `storageState` from `playwright-e2e` for authed pages. See `references/deterministic-snapshots.md`.
4. **Snapshot the four states and theme variants (medium — Rule 4).** Drive loading/empty/error/
   success by routing the tRPC call (delay, `[]`, 500, real fixture); snapshot each. Repeat
   under `colorScheme: 'dark'`/`'light'`. See `references/deterministic-snapshots.md`.
5. **Mask the genuinely dynamic (medium).** Anything that legitimately varies (live counts, user
   avatars, fuzzy "2m ago") gets `mask: [locator]`, not a loosened tolerance. Mask is surgical;
   threshold is a blunt instrument. See `references/deterministic-snapshots.md`.
6. **Generate, REVIEW, then commit baselines (high).** Run `--update-snapshots`, open every PNG,
   confirm it is the *intended* render, then commit it as a tracked artifact. An unreviewed
   baseline is a bug with a green check. See `references/baseline-workflow-and-ci.md`.
7. **Set narrow tolerance and hand CI the diff (medium).** Small `maxDiffPixels`/`threshold` in
   config; on a real diff, CI uploads the actual/expected/diff triplet so a human adjudicates.
   When a design-token change is *intended*, regenerate baselines deliberately in the same PR.
   `ci-pipeline` owns the job wiring.

---

## Composes With

- **Consumes:** `test-strategy` (which surfaces earn visual coverage), `design-tokens` (a token
  change is the *intended* diff this suite forces you to acknowledge and regenerate).
- **Pairs with:** `component-state-test` (it proves the states *behave*; this proves they *look*
  right), `ci-pipeline` (runs the job in the pinned image and uploads diff artifacts).
- **Runs against:** components/pages from `vertical-slice`, `shadcn-compose`, and `nextjs-app-router`;
  authed pages reuse the Clerk `storageState` set up by `playwright-e2e`.
- **Hands off:** the pinned-image tag and tolerance forks → `DECISIONS.md`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** The naive agent produced a working Playwright config and spec but stopped at
"animations disabled" for determinism — it never froze the clock, stubbed tRPC data, or waited
for `document.fonts.ready`, so any "now"/relative-time/web-font render flakes. It full-page-shot
whole routes instead of per-component locators, captured only the default success instance (not
Rule 4's loading/empty/error states), ran a single Desktop Chrome viewport with no dark-mode
variant, generated baselines on a dev machine that will not match the Ubuntu CI runner's font
hinting, and picked an unjustified tolerance:

```ts
expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" } },
// ...
await expect(page).toHaveScreenshot(`${c.name}.png`, { fullPage: true });
```

**Failure class (confirmed).** Snapshot code that treats "disable animations" as the whole of
determinism — leaving the clock, data, and fonts unpinned — produces a suite that is flaky
(false reds on volatile content) and blind at once: full-page scope, one viewport/theme, and
success-only capture let real regressions through, while host-vs-CI font rendering guarantees
mismatched baselines. This skill forces frozen-clock + stubbed-data + fonts-ready determinism,
per-component scope, the four states and theme variants, and an OS-pinned baseline.

---

## Examples

**Input:** "Snapshot the `ProjectCard` component."
**Output:** A spec mounting the card on a harness route with a fixed typed fixture (no live data),
`page.clock.setFixedTime` so its date label is stable, `await document.fonts.ready`, then
`await expect(page.getByRole('article')).toHaveScreenshot('project-card.png', { animations: 'disabled', mask: [page.getByTestId('owner-avatar')] })`.
A second `test.use({ colorScheme: 'dark' })` block captures the dark variant. Baselines generated
in the pinned Playwright Docker image and committed after review.

**Input:** "Visual-regress the projects list across its states."
**Output:** Four cases routing `**/api/trpc/project.list**`: a delayed response → snapshot the
skeleton; `{ result: { data: [] } }` → snapshot the empty state; `fulfill({ status: 500 })` →
snapshot the error fallback; the real fixture → snapshot the populated list (Rule 4). Each
`toHaveScreenshot` uses a narrow `maxDiffPixels` and masks the relative-time column.

**Input:** "We changed a spacing token and CI visual tests are red."
**Output:** Confirm the diff PNGs show *only* the intended spacing change (design-tokens drove it),
regenerate baselines with `--update-snapshots` in the same PR, and commit the new PNGs alongside
the token change so the diff is reviewable as one intentional unit — not a separate "fix snapshots" commit.

---

## Edge Cases

- **The surface is inherently data-driven (live feed, charts)** → snapshot a component-level
  locator with a fixed fixture, or mask the volatile region; do not full-page-shot live data.
- **A web font causes intermittent off-by-anti-aliasing diffs** → `await document.fonts.ready`
  before the shot and self-host the font; never paper over FOUT with a wider threshold.
- **macOS-local vs Linux-CI baselines diverge** → generate baselines only inside the pinned
  Docker image (or commit per-platform suffixed snapshots); Playwright names them per platform.
- **A genuinely intended visual change makes many snapshots red** → regenerate deliberately and
  review the PNG diffs in the PR; never blanket `--update-snapshots` to clear the board unseen.

## References

- `references/deterministic-snapshots.md` — making a render reproducible: disabling animations,
  `page.clock` fixed time (Rule 6), `document.fonts.ready`, stubbing tRPC with typed fixtures via
  `page.route`, masking, four-states + light/dark capture, and tuning tolerance narrowly.
- `references/baseline-workflow-and-ci.md` — `playwright.config.ts` `toHaveScreenshot` settings
  and `snapshotPathTemplate`, OS/browser pinning via the `mcr.microsoft.com/playwright` image, the
  generate→review→commit baseline workflow, and what `ci-pipeline` runs + uploads on a diff.

## Scripts

`scripts/` is reserved (`scripts/.gitkeep`). A signal that would justify one: a check that fails
when a snapshot baseline PNG is added or modified without a corresponding reviewed entry — i.e.
catching a blind `--update-snapshots` commit. Until that proves worth maintaining, this stays a
review check and a CI gate (`ci-pipeline`).
