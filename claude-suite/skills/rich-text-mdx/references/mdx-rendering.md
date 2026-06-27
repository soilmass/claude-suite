Purpose: the trusted-authored-MDX pipeline on the App Router — compiling MDX, mapping every element to a design-token component, adding heading anchors and build-time syntax highlighting, and the edge-runtime constraints.

# Rendering authored MDX/markdown

This is for content **you** author and commit (blog posts, docs, a changelog). It is trusted —
MDX compiles to a React component and can run JS — so the discipline here is *styling* and
*structure*, not sanitization. Never feed user input into this pipeline (see
`user-rich-text.md`).

## 1. Two compile paths

| Path | Use when | Where it runs |
| --- | --- | --- |
| `@next/mdx` | `.mdx` files that live in the repo as routes/imports | Build time |
| `next-mdx-remote` (RSC: `next-mdx-remote/rsc`) | MDX **strings** you fetch from a CMS/DB at build or request time | Server Component |

Both render server-side. Prefer compiling at build time; if you must compile per request, do it
in a Server Component (an RSC), never ship the MDX compiler to the client.

```tsx
// app/docs/[slug]/page.tsx — remote/string MDX compiled in an RSC
import { compileMDX } from "next-mdx-remote/rsc";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { mdxComponents } from "@/components/mdx/components";
import { getDocSource } from "@/lib/docs"; // YOUR content, not user input

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const source = await getDocSource(slug); // trusted, authored markdown/MDX string
  const { content, frontmatter } = await compileMDX<{ title: string; description: string }>({
    source,
    components: mdxComponents,
    options: {
      parseFrontmatter: true,
      mdxOptions: {
        rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings, { behavior: "wrap" }]],
      },
    },
  });
  // frontmatter feeds seo-metadata's generateMetadata, not this skill.
  return <article className="prose-tokens mx-auto max-w-prose">{content}</article>;
}
```

For file-based `@next/mdx`, the App Router requires a root `mdx-components.tsx` exporting
`useMDXComponents` — return the same `mdxComponents` map below from it.

## 2. The element → token component map (Rule 3)

Every rendered element maps to a component whose styles resolve to `@theme` design tokens — never
a raw `text-[32px]`, never a one-off hex. Do **not** lean on `@tailwindcss/typography`'s `prose`
class as the styling source of truth: it injects its own values outside your token scale. If you
use the plugin at all, drive it from your tokens (`--tw-prose-*` mapped to `@theme` variables);
otherwise map elements explicitly. The map is the seam where `design-tokens` plugs in.

```tsx
// components/mdx/components.tsx
import type { MDXComponents } from "mdx/types";
import Link from "next/link";

export const mdxComponents: MDXComponents = {
  h1: (p) => <h1 className="mt-0 mb-(--space-4) text-(length:--font-size-3xl) font-semibold" {...p} />,
  h2: (p) => <h2 className="mt-(--space-8) mb-(--space-3) text-(length:--font-size-2xl) font-semibold" {...p} />,
  h3: (p) => <h3 className="mt-(--space-6) mb-(--space-2) text-(length:--font-size-xl) font-medium" {...p} />,
  p:  (p) => <p className="my-(--space-4) leading-(--leading-relaxed) text-(--color-foreground)" {...p} />,
  a:  ({ href = "#", ...p }) => <Link href={href} className="text-(--color-primary) underline underline-offset-2" {...p} />,
  ul: (p) => <ul className="my-(--space-4) list-disc pl-(--space-6)" {...p} />,
  blockquote: (p) => <blockquote className="border-l-2 border-(--color-border) pl-(--space-4) text-(--color-muted-foreground)" {...p} />,
  code: (p) => <code className="rounded-(--radius-sm) bg-(--color-muted) px-(--space-1) text-(length:--font-size-sm)" {...p} />,
  // `pre` is produced by the highlighter (below); keep its token-driven frame here.
  pre: (p) => <pre className="my-(--space-4) overflow-x-auto rounded-(--radius-md) bg-(--color-muted) p-(--space-4)" {...p} />,
};
```

Token names above are illustrative — bind to whatever `design-tokens` emits in `@theme`. The
point is that **no value is hardcoded**; the type scale and spacing come from the token layer.

## 3. Heading anchors

`rehype-slug` adds an `id` to every heading; `rehype-autolink-headings` makes the heading
linkable. Both run at compile time in the `rehypePlugins` array (shown in §1). With `behavior:
"wrap"` the heading text becomes the anchor; `"append"` adds a `#` link after it — pick one and
style the anchor via tokens in the `h*` components.

## 4. Syntax highlighting — build time, not client runtime

Highlight at **compile time** with Shiki (`rehype-pretty-code` wraps it for MDX) so zero
highlighting JS ships to the browser and nothing runs at the edge per request. Avoid
client-runtime highlighters (Prism/highlight.js in a `useEffect`) — they add bundle weight and a
hydration flash.

```ts
import rehypePrettyCode from "rehype-pretty-code";
// rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings, ...],
//                 [rehypePrettyCode, { theme: "github-dark", keepBackground: false }]]
```

Set `keepBackground: false` and style the `pre`/`code` frame from tokens (§2) so the code block
matches the palette instead of Shiki's built-in background.

## 5. Edge-runtime constraints

- `@next/mdx` file compilation happens at **build time** — no edge concern.
- `next-mdx-remote/rsc` compiles MDX in the RSC. The MDX/remark/rehype toolchain is heavy;
  compiling per request at the edge can blow the CPU budget. Prefer build-time or cache the
  compiled output. If a route must compile per request and the toolchain isn't edge-safe, move
  that route to the node runtime and record the call (`edge-runtime-constraints`,
  `../../CLAUDE.md`).
- Shiki ships a large grammar/theme set; load only the languages and the single theme you use to
  keep the build lean.
</content>
