---
name: image-optimization
description: >
  Run the image pipeline on the edge App Router stack through `next/image`: always-sized
  images (explicit `width`/`height`, or `fill` over an aspect-ratio box) so an image can never
  shift layout, a `sizes` attribute derived from the real grid so the browser downloads the
  right srcset candidate, AVIF/WebP negotiation with a fallback, `priority` on the one LCP image
  and lazy everywhere else, LQIP/blur placeholders, an allowlisted `remotePatterns` config, and
  a custom CDN loader so bytes resize at the CDN edge instead of routing through the JS graph.
  Use when: "next/image", "optimize images", "hero image", "responsive image gallery", "blur
  placeholder", "image CDN loader", "image is causing CLS".
  Do NOT use for: the pass/fail Core Web Vitals budget verdict (use perf-budget-check), or the
  layout grid and spacing/aspect-ratio tokens themselves (use layout-composition).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the "plausible images, but the quiet disciplines skipped"
    failure class: sizing/`sizes`/`priority`/allowlist done competently, then AVIF asserted but
    never configured (`images.formats` unset), no LQIP/blur placeholder, and no CDN loader (image
    bytes route through the Next server). Baseline replaced with an observed transcript.
---

# image-optimization

How a content image is sized, formatted, prioritized, placed, and served so it loads fast and never
shifts the page. It exists because a base model gets the *visible* parts right — `next/image`,
dimensions, a `sizes` attribute, an allowlist — then skips the quiet disciplines: asserting AVIF
without configuring it, no placeholder, and the built-in optimizer instead of a CDN loader. It owns
the IMAGE pipeline only — the grid, spacing, and aspect-ratio *tokens* belong to `layout-composition`,
the pass/fail Core Web Vitals verdict to `perf-budget-check`; this serves both. The spine (Next.js
App Router, edge runtime) and the nine rules live in `../../../CLAUDE.md`.

---

## Non-Negotiable Rules

An unsized or un-negotiated image type-checks, renders, and demos fine — the cost (layout shift,
oversized downloads, a slow LCP) only appears in the field, which is why these are hard lines:

- **Never ship an unsized image.** Every image carries explicit `width`/`height`, or `fill` over a
  parent that owns an `aspect-ratio` and `position: relative`. The reserved ratio means the image
  cannot shift the page (CLS) — Rule 4 / perf-adjacent; an unsized image is not done.
- **Never use a raw `<img>` for content imagery.** Use `next/image` so resizing, format
  negotiation, lazy-loading, and dimension-reservation are handled, not hand-rolled.
- **`priority` belongs to the LCP image and nothing else.** Exactly one above-the-fold, largest
  image is `priority` (eager + preloaded); everything else stays lazy (the default). Spraying
  `priority` preloads everything and destroys the benefit.
- **Never assert a format you didn't configure or serve a host you didn't allowlist.** AVIF ships
  only if `images.formats` lists it; a CMS host optimizes only if it's in `remotePatterns`. Prove
  both in `next.config` — a claimed "WebP/AVIF" without the config is the failure.

Refuse these rationalizations: "it's just an `<img>`, `next/image` is overkill"; "I'll add
`width`/`height` later"; "mark them all `priority` so they load fast"; "`next/image` already does
AVIF" (only if configured); "the CMS already optimized it, ship the URL".

---

## When to Use
- Adding any content image: a hero, a thumbnail, a product photo, a responsive gallery/grid.
- An image is the LCP element, or an image is causing layout shift (CLS) at p75.
- Wiring a CMS/CDN's remote image URLs into the app (allowlist + loader + transforms).
- Choosing a placeholder (blur/LQIP) or deciding format/quality for an image-heavy route.

## When NOT to Use
- The pass/fail Core Web Vitals budget (LCP/CLS at p75) verdict → `perf-budget-check` (it grades;
  this skill supplies the sized, prioritized image that helps the grade).
- The grid, spacing scale, and aspect-ratio *tokens* the layout uses → `layout-composition`
  (this skill reads the grid to write `sizes`; it does not define the grid).
- Why a heavy JS dep inflates the client bundle → `bundle-analysis` (this skill keeps images out
  of the JS graph; that skill audits the graph's weight).
- Meaningful `alt` text and reading order as a conformance check → `a11y-gate`.

---

## Procedure

1. **Identify the one LCP image; everything else is lazy (low cost, do first — most own-goals
   start here).** Exactly one above-the-fold, largest-area image gets `priority`; everything below
   the fold stays lazy (the `next/image` default). `priority` on a below-fold image, or on all of
   them, preloads bytes that compete with the real LCP. See `references/image-pipeline.md`.

2. **Size every image to kill CLS (high — Rule 4 / perf-adjacent, expensive to retrofit).**
   Fixed-dimension images get explicit `width`/`height` (the ratio reserves space). Fluid or
   art-directed images use `fill` over a parent that owns `aspect-ratio` + `position: relative`.
   There is no third option — an unsized image is not done. See `references/image-pipeline.md`.

3. **Write `sizes` from the real layout (medium — the most-skipped, highest-leverage step).**
   `sizes` tells the browser the rendered width *per breakpoint, before layout*, so it picks the
   right srcset candidate; a missing or wrong `sizes` (or a bare `fill` without it) downloads the
   largest source on every screen. Derive it from the grid (`layout-composition` owns it; this
   reads it). See `references/image-pipeline.md`.

4. **Configure formats, quality, and the allowlist — don't assert them (medium — the
   asserted-but-unconfigured trap).** Set `images.formats` to `["image/avif", "image/webp"]`
   explicitly (the default emits WebP only, *not* AVIF), pick a `quality`, and allowlist every
   remote host in `images.remotePatterns`. A format not in config never ships. See
   `references/loaders-and-config.md`.

5. **Choose a placeholder strategy (don't skip it).** Blur/LQIP for hero and above-the-fold images
   (static imports get `blurDataURL` free; remote images need a tiny generated base64); skip it for
   icons where the swap is imperceptible, and never inline a large `blurDataURL`. See
   `references/image-pipeline.md`.

6. **Wire a CDN loader when the CDN does the transforms (medium).** A custom `loader` maps
   `(src, width, quality)` → a CDN transform URL, so resizing happens at the CDN edge, not the
   Next server, and bytes never route through the JS graph (`bundle-analysis`'s concern) — replacing
   the built-in-optimizer default for CDN-hosted media. See `references/loaders-and-config.md`.

7. **Verify no rule reopened, then hand off (low cost).** Any wrapper sizing resolves to a token
   (Rule 3 → `layout-composition`); every content image has meaningful `alt` (`a11y-gate`); a
   data-bound gallery still renders loading/empty/error/success (Rule 4). The pass/fail CWV
   verdict is `perf-budget-check`'s — this skill hands it a sized, prioritized, right-sized image.

---

## Composes With
- **Pairs with:** `perf-budget-check` — it owns the LCP/CLS pass/fail verdict at p75; this supplies
  the sized + `priority` + correctly-`sizes`d image that moves those vitals.
- **Pairs with:** `bundle-analysis` — it audits the client JS graph; this keeps image bytes out of
  that graph (CDN loader + optimizer), never paid as JS weight.
- **Consumes:** `layout-composition` — it defines the grid, breakpoints, and aspect-ratio tokens;
  this reads them to write `sizes` and size each `fill` wrapper.
- **Hands off:** layout tokens → `layout-composition`; the CWV verdict → `perf-budget-check`;
  `alt`-text and reading-order → `a11y-gate`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions): "add a full-width hero image and a responsive 9-photo gallery to a Next.js App
> Router marketing page; images are remote CMS URLs." The imagined catastrophe — raw `<img>`,
> unsized, no `sizes`, `priority` everywhere — did **not** occur. A **narrower** class was confirmed.

**Observed run.** The agent did the visible work well: `next/image` throughout (no raw `<img>`),
the CMS host allowlisted, the hero given `fill` + `priority` + `sizes="100vw"` (correct LCP
handling), and the gallery left lazy with `fill` in an `aspect-square` wrapper (CLS-safe) and a
`sizes` matching its 1/2/3-column grid. But three quiet disciplines were missing:

```js
// the whole images block it wrote:
images: { remotePatterns: [{ protocol: 'https', hostname: 'cdn.ourshop.com', pathname: '/**' }] }
// no `formats` (default ships WebP only, NOT AVIF) · no `quality` · no custom `loader`
// its note: "we get ... WebP/AVIF conversion"  ← asserted, AVIF never configured
// hero + every gallery cell: no placeholder="blur" / blurDataURL anywhere
```

It **asserted** AVIF/WebP while leaving `images.formats` unset (so only WebP ships), shipped **no
placeholder/LQIP**, and **wrote no CDN loader** — routing every CMS image through the Next server.
(Peripherally: arbitrary `h-[70vh]`/`gap-4` values — Rule 3 — and a hardcoded `products` array
with no loading/empty/error states — Rule 4.)

**Failure class (confirmed, narrowed).** Not "can't optimize images" — "gets sizing, `sizes`,
`priority`, and the allowlist right, then asserts the format it never configured and skips the
placeholder and the loader." This skill adds the missing rigor: `images.formats` set so AVIF
actually ships, a blur/LQIP strategy, and a CDN loader so bytes resize at the CDN edge.

---

## Examples

**Input:** "Add a full-width hero image to the landing page."
**Output:** `next/image` with `priority` (it is the LCP), `fill` over a `relative` aspect-ratio
wrapper (or explicit `width`/`height` if fixed), `sizes="100vw"`, and `images.formats:
["image/avif","image/webp"]` actually set so AVIF ships. A `blurDataURL` LQIP fills the box before
the bytes land. Confirm the wrapper sizing is a token (Rule 3), not a magic px.

**Input:** "A responsive gallery of 9 product photos, 1 / 2 / 3 columns."
**Output:** One `next/image` per cell, **not** `priority` (below the fold → lazy default), `fill`
in an `aspect-square` wrapper so no cell shifts, and `sizes="(min-width:1024px) 33vw,
(min-width:640px) 50vw, 100vw"` matching the grid so desktop fetches a third-width image, not a
full one. A generated `blurDataURL` per remote photo. The gallery renders all four states (Rule 4).

**Input:** "Our photos live on `https://cdn.ourshop.com`; wire them up."
**Output:** A `remotePatterns` entry for the host and a custom `loader` building
`https://cdn.ourshop.com/...?w={width}&q={quality}&f=auto` so the CDN resizes and negotiates format
at its edge — a global custom loader bypasses the built-in optimizer, so the CDN owns format (the
`f=auto`), not `images.formats`. Images never route through the Next server; `bundle-analysis`
confirms they're absent from the JS graph.

---

## Edge Cases
- **Dimensions unknown at build (user-uploaded)** → use `fill` over an aspect-ratio box so space
  is still reserved; never render unsized. Better: store `width`/`height` with the upload so the
  ratio is known and CLS is impossible.
- **SVG / icons** → `dangerouslyAllowSVG` is a footgun (SVG can carry script); prefer inline SVG
  or a sprite. If a remote SVG is unavoidable, sandbox it via CSP and the loader.
- **Animated GIF** → the optimizer won't compress animation well; convert to a muted, autoplay,
  `playsInline` `<video>` (or animated AVIF) and flag it — an image tag can't fix a heavy GIF.
- **Carousel slide treated as LCP** → only the visible first slide is `priority`; the rest stay
  lazy, or the carousel's preload defeats itself.

---

## References
- `references/image-pipeline.md` — sizing (`width`/`height` vs `fill` + aspect-ratio box), deriving
  `sizes` from the grid, format negotiation (AVIF/WebP/fallback), `priority` assignment, and the
  blur/LQIP placeholder decision.
- `references/loaders-and-config.md` — the `next.config` `images` block (`remotePatterns`, `formats`,
  `quality`) and the custom CDN `loader` contract (`(src, width, quality)` → transform URL) that
  keeps image bytes off the JS graph and the Next server.

## Scripts
`scripts/` reserved (`.gitkeep`). A grep for a raw `<img ` on content, a `next/image` missing
`width`/`height`/`fill`, or more than one `priority` per route is plausible, but needs to tell a
content image from a decorative one to avoid false positives, and the unsized-image rule is
perf-adjacent, not one of the nine. Add one only once that distinction is reliable and no sibling
(`rule-audit` Rule 3/4) owns it. Empty for now.
