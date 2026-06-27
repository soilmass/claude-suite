# JSON-LD structured data — a typed helper per entity, matching visible content

Purpose: emit `schema.org` JSON-LD that a typed helper derives from the entity, asserts only what
the page visibly renders, and dates in UTC ISO. Honors Rule 1 (typed from the row), Rule 6 (UTC
timestamps), and Google's "structured data must match visible content" requirement.

---

## 1. One typed helper per schema type

The helper takes the **typed entity** (its type flows from Drizzle inference through tRPC) and
returns a `schema.org` object. Typing the input is what stops the markup from drifting from the
row and from claiming fields the page does not show.

```ts
// src/lib/seo/json-ld.ts
import type { RouterOutputs } from "~/trpc/shared";
import { minorToDecimalString } from "~/lib/money"; // per-currency exponent (money-modeling); no inline /100

type Product = NonNullable<RouterOutputs["product"]["bySlug"]>;
type Article = NonNullable<RouterOutputs["post"]["bySlug"]>;

export function productJsonLd(p: Product, url: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.summary ?? undefined,
    sku: p.sku,
    offers: {
      "@type": "Offer",
      url,
      // money lives as integer minor units (Rule 5); the helper applies the currency's exponent
      price: minorToDecimalString(p.priceMinor, p.currency),
      priceCurrency: p.currency, // stored alongside the amount, never assumed
      availability: p.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
  } as const;
}

export function articleJsonLd(a: Article, url: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    datePublished: a.publishedAt?.toISOString(), // Rule 6: UTC ISO, not local
    dateModified: a.updatedAt.toISOString(),
    author: { "@type": "Person", name: a.authorName },
    mainEntityOfPage: url,
  } as const;
}
```

Only fields the page **visibly renders** belong here. If JSON-LD asserts a price the PDP does not
show, or a `datePublished` for an unpublished draft, that is a markup-vs-content mismatch — a
manual-action risk, not a ranking gain.

## 2. Inject safely in the Server Component

```tsx
// src/app/products/[slug]/page.tsx (Server Component)
import { productJsonLd } from "~/lib/seo/json-ld";

const ld = productJsonLd(product, `${env.NEXT_PUBLIC_SITE_URL}/products/${product.slug}`);

return (
  <>
    <script
      type="application/ld+json"
      // JSON.stringify, then escape "<" so a value containing "</script>" cannot break out
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }}
    />
    {/* …the visible product UI rendering the SAME `product` fields… */}
  </>
);
```

The `replace(/</g, "\\u003c")` is the one safe-injection rule: JSON-LD is the only place we hand
JSON to `dangerouslySetInnerHTML`, and a stray `</script>` in user data would otherwise break the
document. This stays server-side; no secret enters the object (Rule 9).

## 3. BreadcrumbList for nested pages

For a product under a category, add a `BreadcrumbList` whose `itemListElement` mirrors the
on-page breadcrumb trail — same labels, same order, same URLs. If the breadcrumb is not visible,
do not emit the markup.

## 4. Validate before trusting

Run the rendered page through Google's Rich Results Test / Schema Markup Validator as a done-time
check. A helper that type-checks can still produce a `schema.org` shape Google rejects (e.g. an
`Offer` missing `priceCurrency`); the validator is the external gate, like `a11y-gate` is for axe.
