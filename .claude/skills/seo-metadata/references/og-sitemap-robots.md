# Dynamic OG images, sitemap.ts, and robots.ts — generated from the route/data inventory

Purpose: generate the Open Graph image per entity, and build `sitemap.ts` / `robots.ts` from the
real route and **public, published, non-deleted** data — never a static card or an unfiltered
`SELECT`. Honors Rule 2 (no leaking private rows), Rule 6 (UTC `lastModified`), Rule 9 (no secrets).

---

## 1. Dynamic Open Graph image (`opengraph-image.tsx`)

Next.js treats `opengraph-image.tsx` in a route segment as the OG image for that route. It runs on
the server (edge-compatible via `next/og`) and returns an `ImageResponse`. Source it from the same
entity read so the card reflects the live row.

```tsx
// src/app/products/[slug]/opengraph-image.tsx
import { ImageResponse } from "next/og";
import { getProduct } from "./_data"; // the same cache()-wrapped read the page uses
import { formatMoney } from "~/lib/money"; // per-currency exponent; never inline /100 (Rule 5)

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const product = await getProduct(await params); // params is a Promise in Next 15; notFound() handled inside
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%",
                    padding: 64, background: "white", justifyContent: "flex-end" }}>
        <div style={{ fontSize: 64, fontWeight: 700 }}>{product.name}</div>
        <div style={{ fontSize: 36, opacity: 0.7 }}>
          {formatMoney(product.priceMinor, product.currency)}
        </div>
      </div>
    ),
    size,
  );
}
```

Notes:
- Only public fields are rendered into the image — it is served to anyone who can see the card (Rule 9).
- The image is referenced automatically by `generateMetadata`'s `openGraph`; you do not hand-wire a URL.
- Inline `style` here is the `next/og` (Satori) constraint, which supports only a CSS subset — this
  is the one place raw style values are unavoidable; it is not app UI, so Rule 3's token rule does
  not reach it. Keep app components token-driven.

## 2. `sitemap.ts` — public, published rows only

`sitemap.ts` exports a function returning `MetadataRoute.Sitemap`. Combine static routes with a
query that filters to **published, non-deleted, public** entities. The filter lives in the query,
not in a hope.

```ts
// src/app/sitemap.ts
import type { MetadataRoute } from "next";
import { db } from "~/db";
import { products } from "~/db/schema";
import { and, isNull, isNotNull } from "drizzle-orm";
import { env } from "~/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_SITE_URL;
  const rows = await db
    .select({ slug: products.slug, updatedAt: products.updatedAt })
    .from(products)
    .where(and(isNotNull(products.publishedAt), isNull(products.deletedAt))); // Rule 2: no drafts/soft-deleted

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${base}/products`, changeFrequency: "daily", priority: 0.8 },
  ];

  const productRoutes: MetadataRoute.Sitemap = rows.map((p) => ({
    url: `${base}/products/${p.slug}`,
    lastModified: p.updatedAt, // timestamptz → UTC (Rule 6)
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...productRoutes];
}
```

Never `SELECT *` every row: that leaks drafts, soft-deleted rows, and (if the table is user-owned)
private content into a public document.

## 3. Large catalogs — sitemap index

A single sitemap is capped (~50k URLs / 50 MB). Past that, split into a sitemap index with
`generateSitemaps()` returning chunk ids and a `sitemap.ts` that paginates by id. Always bound the
per-chunk query with `limit`/`offset`; never emit an unbounded result.

## 4. `robots.ts`

```ts
// src/app/robots.ts
import type { MetadataRoute } from "next";
import { env } from "~/env";

export default function robots(): MetadataRoute.Robots {
  const base = env.NEXT_PUBLIC_SITE_URL;
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/api", "/sign-in"] },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
```

Disallow the authenticated app and API surfaces; allow the public marketing/catalog routes; point
crawlers at the absolute sitemap URL. `robots` is a hint to crawlers, not an access control — the
real protection for private routes is auth (Clerk middleware), not this file.
