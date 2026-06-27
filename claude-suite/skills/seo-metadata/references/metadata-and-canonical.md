# generateMetadata, canonical, and social blocks — sourced from the page's own data

Purpose: show how a page's metadata derives from the **same typed row the page renders**, fetched
once, with a canonical URL and OG/Twitter blocks — never hardcoded strings. Honors Rule 1 (type
chain), Rule 8 (validated param), Rule 9 (no secrets in the document).

---

## 1. Fetch the row once, share it between metadata and page

`generateMetadata` and the page component run separately, so a naive implementation fetches the
entity twice. Wrap the read in React `cache()` so it is deduped per request. The read is the same
tRPC/Drizzle call the page already uses — metadata's types come from its return type, not a
hand-written shape.

```ts
// src/app/products/[slug]/_data.ts
import { cache } from "react";
import { z } from "zod";
import { notFound } from "next/navigation";
import { api } from "~/trpc/server";

const ParamsSchema = z.object({ slug: z.string().min(1) }); // Rule 8: validate the boundary

export const getProduct = cache(async (raw: { slug: string }) => {
  const { slug } = ParamsSchema.parse(raw);
  const product = await api.product.bySlug({ slug }); // public read; ownership/publish filter in the procedure
  if (!product) notFound();
  return product; // type flows from Drizzle inference outward (Rule 1)
});
```

Both `generateMetadata` and the default page export call `getProduct(await params)`; `cache()`
collapses them to one query.

## 2. metadataBase once, canonical per page

Set `metadataBase` once in the root layout so every relative canonical/OG URL resolves to an
absolute one. Read the origin from a validated env var (never hardcode the prod domain inline).

```ts
// src/app/layout.tsx
import { env } from "~/env"; // Zod-validated env (Rule 8)
export const metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: { default: "Acme", template: "%s — Acme" },
};
```

Each indexable page declares exactly one canonical via `alternates.canonical`. This is the
duplicate-content fix: query strings, trailing slashes, and tracking params all collapse to one
canonical URL.

## 3. Derive title/description from the row, with fallbacks

```ts
// src/app/products/[slug]/page.tsx
import type { Metadata } from "next";
import { getProduct } from "./_data";

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const product = await getProduct(await params);
  const description = product.summary ?? `Buy ${product.name} at Acme.`; // explicit fallback, never null
  return {
    title: product.name, // template in layout makes it "Name — Acme"
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      type: "website",
      title: product.name,
      description,
      url: `/products/${product.slug}`,
      // images: the dynamic opengraph-image.tsx is picked up automatically; no manual URL needed
    },
    twitter: { card: "summary_large_image", title: product.name, description },
    robots: product.publishedAt ? undefined : { index: false, follow: false }, // never index a draft
  };
}
```

Notes:
- The page component renders `product.name` / `product.summary` from the **same** `getProduct`
  call — metadata and visible content cannot diverge.
- `robots: { index: false }` keeps private/unpublished entities out of the index even if someone
  reaches the URL (defense in depth with the sitemap exclusion).
- No secret or server-only field is placed in the returned object — it becomes `<head>` markup the
  client sees (Rule 9).
