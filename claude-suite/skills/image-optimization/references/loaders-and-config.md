Purpose: the `next.config` `images` block and the custom CDN `loader` — the allowlist, the format/quality config, and the contract that keeps image bytes resizing at the CDN edge instead of routing through the Next server or the JS graph. The per-image markup decisions live in `image-pipeline.md`.

The discipline: **every remote host is allowlisted, the formats you claim are actually configured,
and CDN-hosted media is resized by the CDN via a `loader` — not proxied through the Next image
optimizer.** On the edge runtime this matters twice: a built-in optimizer adds a server hop and
serverless cost; a CDN loader removes both.

---

## The `images` config block

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // 1. Allowlist every remote host. An unlisted host won't optimize; an open one is an abuse vector.
    remotePatterns: [
      { protocol: "https", hostname: "cdn.ourshop.com" }, // scope pathname if you can
    ],
    // 2. Configure the formats you claim. Default is WebP only — AVIF ships ONLY if listed.
    formats: ["image/avif", "image/webp"],
    // 3. The responsive widths the optimizer/loader may generate (match your real breakpoints).
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },
};
module.exports = nextConfig;
```

- **`remotePatterns`** — prefer a specific `pathname` (e.g. `/images/**`) over `/**`; the optimizer
  will fetch any URL matching the pattern, so a wide pattern widens the SSRF surface (Rule 8/9-adjacent).
- **`formats`** — the asserted-but-unconfigured trap: listing AVIF first is what makes the optimizer
  emit AVIF to browsers that accept it. Without this line, only WebP ships no matter what a comment claims.
- **`deviceSizes` / `imageSizes`** — the candidate widths in the generated `srcset`; keep them aligned
  with the layout's breakpoints so `sizes` (see `image-pipeline.md`) can resolve to a real candidate.

---

## The custom CDN loader

The built-in optimizer fetches the original, resizes it on the Next server, and serves it. For
CDN-hosted media that is a redundant hop — the CDN already resizes. A custom `loader` hands the
resize to the CDN: `next/image` calls it with `(src, width, quality)` and you return the CDN
transform URL. The image bytes then flow browser ⇄ CDN directly, never through the Next server and
never into the JS graph (`bundle-analysis`'s concern — the loader is a pure function, a few bytes).

```ts
// lib/cdn-loader.ts
import type { ImageLoaderProps } from "next/image";

export default function cdnLoader({ src, width, quality }: ImageLoaderProps): string {
  const q = (quality ?? 75).toString();
  // src is the path you pass to <Image src="/products/1.jpg" />; build the CDN transform URL.
  return `https://cdn.ourshop.com${src}?w=${width}&q=${q}&fm=auto`; // fm=auto → CDN negotiates AVIF/WebP
}
```

Wire it globally in config, or per-image with the `loader` prop:

```js
// next.config — global
images: { loader: "custom", loaderFile: "./lib/cdn-loader.ts" }
```
```tsx
// or per <Image> (when only some images come from the CDN)
<Image src="/products/1.jpg" alt="…" width={400} height={400} loader={cdnLoader} />
```

Loader contract notes:
- It is called **once per srcset candidate** — return a URL with the passed `width`; let the CDN do
  the actual resize. Never ignore `width` (that defeats responsive images).
- Push format negotiation to the CDN (`fm=auto`/`f=auto`) so the CDN serves AVIF/WebP by `Accept`;
  this is the CDN-side equivalent of the `formats` config above.
- A custom global loader **disables** the built-in optimizer — so `images.formats`/`remotePatterns`
  no longer apply (the CDN owns fetch + format), and all `<Image>` go through the loader (global) or
  you mix per-image loaders. Decide once and record it in `DECISIONS.md`.

---

## Built-in optimizer vs CDN loader — the call

| | Built-in optimizer | Custom CDN loader |
| --- | --- | --- |
| Resize happens | Next server (a hop) | CDN edge |
| Edge/serverless cost | Per-image compute + cache | None (CDN owns it) |
| Setup | Zero (default) | A loader fn + config |
| Best for | Self-hosted/static images | CMS/CDN-hosted media at volume |

Default to the built-in optimizer for static, app-bundled images. Reach for a CDN loader when
images are CMS/CDN-hosted and high-volume — exactly the case where proxying them through the Next
server on the edge is the cost you don't want. Record the choice in `DECISIONS.md`.
