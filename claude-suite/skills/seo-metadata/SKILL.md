---
name: seo-metadata
description: >
  Treat SEO metadata as data, not decoration, on the Next.js App Router edge stack: derive a
  page's title, description, canonical URL, Open Graph image, and JSON-LD from the same typed
  entity the page renders (sourced through tRPC/Drizzle), generate the OG image dynamically,
  emit structured data per entity type that matches the visible content, and build sitemap.ts +
  robots.ts from the real route/data inventory.
  Use when: "add SEO metadata", "generateMetadata for this page", "open graph image",
  "structured data", "JSON-LD", "sitemap and robots", "canonical URL", "social preview".
  Do NOT use for: probing AI answer engines / GEO ranking and citation checks (use aeo-baseline),
  or the route file conventions and server/client boundary themselves (use nextjs-app-router).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the metadata-as-decoration failure class: hardcoded
    title/description strings, a static OG image, no canonical, no sitemap/robots, and absent or
    page-mismatched JSON-LD. Baseline section is the encoded failure class; replace with an
    observed transcript.
---

# seo-metadata

SEO surfaces are **projections of the page's own data**, not a parallel set of strings. On the
App Router edge stack the title, description, canonical, OG image, and JSON-LD for an entity page
all derive from the same typed row the page renders, so they cannot drift from what a user sees.
The failure class this skill fixes is the opposite: metadata that leaks unpublished rows into a
sitemap, reads its param unvalidated, formats money by hand, and asserts its JSON-LD is "safe."

The spine and nine inviolable rules live in `../../CLAUDE.md`; this skill obeys them, does not
restate them, and fills the metadata layer of a page `nextjs-app-router` shaped and `vertical-slice` built.

---

## Non-Negotiable Rules

Each is an SEO defect that ships looking fine — it renders, it validates, and it silently lies:

- **Never hardcode a title/description/OG value that describes data.** Derive every such field from
  the same typed source the page renders (Rule 1); a hand-typed string drifts from the row.
- **Never ship an indexable page without a canonical URL and OG metadata, and never let JSON-LD
  assert what the page does not visibly show.** Mismatched structured data is a manual-action risk;
  a missing canonical splits ranking across duplicate URLs.
- **Never let private, owned, unpublished, or soft-deleted rows into metadata, a sitemap, or an OG
  image.** The sitemap is public — a `SELECT` without the published/`deleted_at`/owner filter leaks
  them (Rule 2); no secret reaches the OG route's output (Rule 9).
- **Never read a route param in `generateMetadata`/`sitemap`/OG without Zod-parsing it** and calling
  `notFound()` on a miss (Rule 8). Timestamps emitted to JSON-LD or the sitemap are UTC ISO (Rule 6).

Refuse these rationalizations: "I'll hardcode the title for now"; "a static OG image is fine";
"JSON-LD can describe more than the page shows, it helps SEO"; "the sitemap can just list every
row"; "the param comes from our own link."

---

## When to Use

- Adding metadata to a dynamic entity page (`/products/[slug]`, `/blog/[slug]`) that renders data.
- Generating a per-entity Open Graph / social-preview image.
- Emitting JSON-LD structured data (Product, Article, BreadcrumbList, …) for a page.
- Authoring `sitemap.ts` and `robots.ts` from the route and data inventory.
- Fixing duplicate-content / canonical issues or social previews that show the wrong thing.

## When NOT to Use

- Probing ChatGPT/Perplexity/AI Overviews for ranking, citation rate, quote accuracy → `aeo-baseline`.
- The route file conventions, `generateMetadata` placement, server/client boundary → `nextjs-app-router`.
- Defining or changing the Zod schema the metadata validates against → `zod-schema-library`.
- Building the page's data → API → form → UI chain itself → `vertical-slice` (this annotates it).
- Visible-content a11y of the page or its images (alt text, headings) → `a11y-gate`.

---

## Procedure

1. **Source metadata from the page's own data, fetched once (medium-interrogation).** Implement
   `generateMetadata({ params })` to call the **same** tRPC/Drizzle read the page uses, wrapped in
   React `cache()` so the row is fetched once per request. The metadata's types come *from* that
   row (Rule 1), never invented at the metadata leaf.
2. **Derive title/description with fallbacks, set the canonical (high — duplicate-content blast
   radius).** Build `title`/`description` from entity fields with a safe fallback when null; set
   `metadataBase` once in the root layout and a per-page `alternates.canonical` so every indexable
   URL has exactly one canonical. See `references/metadata-and-canonical.md`.
3. **Generate the OG image dynamically from the same entity (medium).** Add `opengraph-image.tsx`
   using `ImageResponse` from `next/og`, reading the entity (public fields only — Rule 9) so the
   social card reflects the live row, not a stale static file.
4. **Emit JSON-LD per entity type via a typed helper (high — must match visible content).** A helper
   per schema type (`productJsonLd(p)`) takes the typed entity, returns a `schema.org` object, and
   is injected as an escaped `<script type="application/ld+json">`. Assert only what the page
   visibly shows; dates are UTC ISO (Rule 6). See `references/structured-data.md`.
5. **Generate `sitemap.ts` from the data inventory — public rows only (high — leak surface).** Map
   static routes plus a query for **published, non-deleted, public** entities into
   `MetadataRoute.Sitemap`, `lastModified` from `updated_at` (UTC). Never emit owned, draft, or
   soft-deleted rows (Rule 2). Then author `robots.ts`: allow public routes, disallow app/API
   routes, reference the absolute sitemap URL. See `references/og-sitemap-robots.md`.
6. **Validate and self-audit (completeness check).** Zod-parse the route param before the read and
   `notFound()` on a miss (Rule 8); confirm no secret or private field reached an OG image or
   sitemap; walk the rules in `../../CLAUDE.md`. Then hand off to `rule-audit` / `security-pass`.

---

## Composes With

- **Consumes:** `nextjs-app-router` (the metadata file conventions and segment shape this fills in),
  `zod-schema-library` (the schema that validates the data the metadata derives from), and the
  page's data layer that `vertical-slice` built.
- **Pairs with:** `vertical-slice` — metadata is part of a page slice; build the slice there, then
  annotate it here so SEO traces the same type chain.
- **Hands off:** AI answer-engine / GEO probing → `aeo-baseline`; alt text and visible-content a11y
  of the page and OG image → `a11y-gate`; final verification → `rule-audit`, `security-pass`.
- **Runs against:** `../../CLAUDE.md` — App Router only, edge runtime, the unbroken type chain.

---

## Baseline failure (observed 2026-06-26)

> Captured by running "add SEO metadata, Open Graph, and structured data to our Next.js product
> pages" without this skill (a general-purpose agent, no project conventions). The imagined
> catastrophe (hardcoded strings, static OG, no canonical/sitemap, no JSON-LD) did NOT occur — a
> capable base model does better than that. A **narrower** failure class was confirmed.

**Observed run.** The agent produced a competent SEO setup: a `generateMetadata` derived from the
product row (deduped with `cache()`), a per-product `opengraph-image`, an `alternates.canonical`,
`metadataBase`, a `Product` JSON-LD matching the visible price, and both `sitemap.ts`/`robots.ts`.
But the disciplines that need rigor, not plausibility, were missed:

```ts
const products = await api.product.all();          // sitemap lists EVERY row — leaks drafts/soft-deleted (Rule 2)
function Image({ params }: { params: { slug: string } }) { ... } // params is a Promise in Next 15; slug never Zod-parsed (Rule 8)
price: (product.priceMinor / 100).toFixed(2),      // hardcoded /100 + en-US in 3 places — mis-scales JPY/BHD (Rule 5)
process.env.NEXT_PUBLIC_SITE_URL ?? "https://acme.com"  // hardcoded fallback domain across 4 files, env unvalidated (Rule 8)
dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} // JSON-LD: no </script> escaping, asserted "safe ... no user HTML"
```

**Failure class (confirmed, narrowed).** Not "produces garbage" — "produces a plausible SEO setup
and then skips the parts that protect a public surface": the sitemap `SELECT`s every row with no
published / `deleted_at` filter (leaks drafts, Rule 2); the `[slug]` param reaches tRPC unvalidated
and the OG route mistypes `params` (Rule 8); money uses scattered hardcoded `/100` + a fixed
`en-US` locale (Rule 5); the canonical/OG domain is a hardcoded fallback repeated across four files
instead of a validated env (Rule 8); and JSON-LD is injected without `</script>` escaping while
*asserting* it is safe. This skill adds the missing rigor — a public-only sitemap query, a
Zod-parsed param, money through the per-currency helper, a validated `metadataBase` env, and safe
`<script>` injection.

---

## Examples

**Input:** "Add SEO to `/products/[slug]`."
**Output:** `generateMetadata` calls the same `cache()`-wrapped product read as the page; `title`
is `product.name` (the layout's `%s — Acme` template adds the suffix), `description` from
`product.summary` with a fallback, `alternates.canonical` = `/products/${slug}` against
`metadataBase`; an `opengraph-image.tsx` rendering name + price via `ImageResponse`; a
`productJsonLd(product)` `<script>` whose `offers.price`/`availability` match the visible PDP; the
`[slug]` param Zod-parsed with `notFound()` on a miss.

**Input:** "We need a sitemap and robots for the blog."
**Output:** `sitemap.ts` mapping static routes plus a query for **published, non-deleted** posts to
`MetadataRoute.Sitemap` with `lastModified: post.updatedAt` (UTC); `robots.ts` allowing `/` and
`/blog`, disallowing `/dashboard` and `/api`, and pointing at the absolute sitemap URL. Drafts and
soft-deleted posts are excluded by the query, not by hoping.

---

## Edge Cases

- **The page is fully static (no data)** → a plain static `metadata` export is correct; you still
  set a canonical and include the route in the sitemap. `generateMetadata` is only for data-derived pages.
- **The entity is private / owned / unpublished** → it must NOT be indexable: omit it from the
  sitemap, and emit `robots: { index: false }` in its metadata. Never leak a draft via OG or JSON-LD (Rule 2).
- **A field JSON-LD wants is not shown on the page** (e.g. an internal SKU) → do not invent it into
  the markup; structured data must mirror visible content, so either surface it on the page or omit it.
- **The catalog is large (10k+ rows) or a slug changed** → split into a sitemap index with
  `generateSitemaps()` (bounded, paginated chunks — never one unbounded query); on a rename, keep
  the canonical on the current slug and 301 the old one, so two URLs never both claim canonical.

---

## References

- `references/metadata-and-canonical.md` — `generateMetadata` from the page's `cache()`-deduped
  tRPC read, `metadataBase`, `alternates.canonical`, title/description fallbacks, `openGraph`/`twitter`.
- `references/structured-data.md` — the typed JSON-LD helper per entity (Product/Article/Breadcrumb),
  matching visible content, UTC-ISO dates, and safe `<script>` injection.
- `references/og-sitemap-robots.md` — dynamic `opengraph-image` via `ImageResponse`, `sitemap.ts`
  from the public/published inventory, sitemap-index splitting, and `robots.ts` rules.

## Scripts

`scripts/` is reserved (`.gitkeep`). A script would earn its place if a static check could flag a
`sitemap.ts`/OG query lacking a `published`/`deleted_at`/owner filter, or a `generateMetadata`
whose `title`/`description` are string literals rather than derived from a fetched row — both
AST-detectable leak/drift tells. Until then, `rule-audit` covers Rules 1/2/8 and `security-pass`
the leak surface.
