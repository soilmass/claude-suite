---
name: rich-text-mdx
description: >
  Render trusted authored MDX/markdown and safely handle user-authored rich text on the edge
  stack. Two cases under one safety rule. (1) Authored content: compile MDX in an RSC, map
  elements to design-token-styled components, add build-time syntax highlighting and heading
  anchors. (2) User content: a Tiptap/Lexical-class editor whose document is stored as a
  Zod-validated JSON AST (never raw HTML), then rendered through a typed allowlist so stored
  content can never XSS — no unsanitized dangerouslySetInnerHTML, ever.
  Use when: "render markdown/MDX", "rich text editor", "tiptap / lexical", "user-authored
  content", "blog/article rendering", "WYSIWYG".
  Do NOT use for: defining the type scale / prose typography tokens themselves (use
  design-tokens), or the rendered page's SEO/OpenGraph metadata (use seo-metadata).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the stored-XSS failure class: user rich text stored as raw
    HTML and rendered with unsanitized dangerouslySetInnerHTML, no Zod validation of the
    document, no design-token prose styling, and trusted-MDX and untrusted-user pipelines
    blurred together. Baseline observed (clean-room capture).
---

# rich-text-mdx

The skill for getting prose onto the page two ways without opening an XSS hole: rendering
**MDX/markdown you authored** (trusted, in the repo) and handling **rich text a user wrote**
(never trusted). The load-bearing distinction is trust — authored content may compile and execute;
user content must be stored as a validated typed AST and rendered through an allowlist, never as
raw HTML. See `../../CLAUDE.md` for the spine and nine rules; this skill is the concrete procedure
behind Rule 8 (validate the stored document), Rule 1 (the typed AST), Rule 3 (prose via tokens),
and Rule 4 (four states), with `security-pass` owning the XSS threat model.

## Non-Negotiable Rules

The defect here ships because it renders correctly in the demo — your own test post has no
`<script>` in it — and only a malicious user proves the hole. So these are hard lines:

- **Never render user-authored content with unsanitized `dangerouslySetInnerHTML`.** Render
  from the typed, Zod-validated AST through an allowlist (node type → component), or sanitize
  the HTML against a strict allowlist with an edge-safe sanitizer first. This is the XSS surface
  (`security-pass`).
- **Never store user rich text as raw HTML when a typed JSON AST will do.** Persist the editor's
  JSON document (ProseMirror/Lexical), Zod-validated on write (Rule 8), so the stored shape is
  constrained and the type chain stays rooted in that schema (Rule 1).
- **Never execute user-submitted MDX or markdown-with-components.** MDX runs arbitrary
  JS/components; it is only ever for content *you* author in the repo, never for user input.
- **Never hardcode prose styles.** The element/node → component map resolves to `@theme`
  typography and spacing tokens (Rule 3); a raw `<h1 className="text-[32px]">` is drift.

Refuse these rationalizations: "DOMPurify on the client is enough"; "it's just our own users,
they won't inject a script"; "storing HTML is simpler than JSON"; "I'll add sanitization later";
"the markdown renderer escapes everything anyway" (it does not once `rehype-raw` passes HTML
through).

## When to Use

- Rendering MDX/markdown you author — blog posts, docs, a changelog — as App Router pages.
- Adding a WYSIWYG / rich-text editor for user-authored content (posts, comments, descriptions).
- Deciding how to **store** and how to **safely render** user rich text.
- Mapping markdown elements to design-token components, syntax highlighting, or heading anchors.

## When NOT to Use

- Defining the type scale or prose typography tokens themselves → **design-tokens** (this skill
  consumes those tokens; it does not author them).
- The rendered page's SEO/OpenGraph/`generateMetadata` → **seo-metadata**.
- The mechanics of authoring the Zod schema that validates the AST → **zod-schema-library** (this
  skill decides *what* to validate; that one is *how* to build the schema).
- The full threat-model and security-header review of the render surface → **security-pass**.

## Procedure

1. **Classify the content: authored MDX vs. untrusted user rich text (high — sets the whole
   safety posture).** Content you write and commit to the repo → the MDX pipeline (step 2).
   Content a user submits → the editor + typed-AST pipeline (steps 3–5). Never run one path on
   the other's content; blurring them is how user input reaches a code-executing renderer.

2. **(Authored MDX) Compile in an RSC and map elements to token components.** Use `@next/mdx` for
   repo files or `next-mdx-remote` for content fetched at build/request time, compiled in a Server
   Component. Pass an `mdxComponents` map (`h1`–`h3`, `p`, `a`, `code`, `pre`, `blockquote`) styled
   via prose tokens (Rule 3); add `rehype-slug` + `rehype-autolink-headings` for anchors and
   build-time Shiki for highlighting (not a client-runtime highlighter). See
   `references/mdx-rendering.md`.

3. **(User rich text) Store the editor's JSON AST, not HTML.** Reach for a structured editor —
   Tiptap (ProseMirror JSON) or Lexical (Lexical JSON) — whose document is a JSON tree, and
   persist *that*, in a `jsonb` column (record the schemaless-but-constrained choice per
   `../../CLAUDE.md`). The editor is a `"use client"` component; it holds no secrets (Rule 9).
   See `references/user-rich-text.md`.

4. **Validate the document with a shared Zod schema before persist (Rule 8).** The JSON AST is
   untrusted external input the moment it leaves the browser — Zod-parse it in the tRPC mutation
   against an **allowlist** of node types and marks, rejecting anything unknown, before the
   ownership-checked insert (Rule 2). One schema, shared input and store. Hand the schema
   mechanics to **zod-schema-library**.

5. **Render user content from the typed AST, not raw HTML (the load-bearing step).** Walk the
   validated JSON tree through an allowlist map (node type → token-styled React component): no
   HTML string is ever produced, so there is nothing to sanitize and no `dangerouslySetInnerHTML`.
   If HTML is genuinely unavoidable, sanitize it against a strict allowlist with an edge-safe
   sanitizer *before* `dangerouslySetInnerHTML`. Never trust the editor's serialized HTML. See
   `references/user-rich-text.md` and **security-pass**.

6. **Render all four states and style prose through tokens (Rules 4, 3).** The article/editor
   renders loading, empty (no content yet), error (a document that fails Zod validation renders
   the error state — never a blank or a crash), and success. The element/node map resolves to
   `@theme` typography + spacing tokens; hand the rendered page's metadata to **seo-metadata**.

## Composes With

- **Consumes:** `design-tokens` (the prose/typography tokens the element map resolves to);
  `zod-schema-library` (the shared Zod schema that validates the stored AST against an allowlist).
- **Pairs with:** `security-pass` (owns the XSS threat model and header review — this skill builds
  the safe renderer, that gate proves it).
- **Feeds:** `seo-metadata` (the rendered article's title/description/OpenGraph).
- **Hands off:** `edge-runtime-constraints` when the MDX compile or a sanitizer is not edge-safe.

## Baseline failure (observed 2026-06-27)

> Captured by running the task without this skill (a fresh general-purpose agent told to build
> "a rich-text editor for user posts, render them, and also render our MDX docs" as a typical
> developer would, with no project conventions and forbidden from reading `.claude/`/`CLAUDE.md`).
> The encoded stored-XSS failure class was confirmed, in full.

**Observed run.** The agent reached for Tiptap, then — the moment the editor produced output —
serialized it with `editor.getHTML()`, stored that **HTML string** in a `text` column, and
rendered it straight back onto the public page:

```tsx
createPost.mutate({ title, content: editor.getHTML() }); // input: content: z.string().min(1)
// column: content: text("content").notNull()   // "rendered HTML from the editor"
// render: the stored user HTML, injected with no sanitization
<div className="prose prose-neutral" dangerouslySetInnerHTML={{ __html: post.content }} />
```

Its own closing note: *"I stored the user post content as the editor's serialized HTML in a `text`
column… I render it back out with `dangerouslySetInnerHTML`."* That is stored XSS verbatim — any
user who submits `<img src=x onerror=…>` runs script in every viewer's session. The document was
validated only as a bare `z.string().min(1)` (no node/mark allowlist, breaking Rules 8 and 1), the
trusted-MDX and untrusted-user paths were treated as one problem, and prose leaned on the
`@tailwindcss/typography` `prose` plugin rather than the stack's `@theme` design-token map (Rule 3).
The MDX docs rendered competently with `@next/mdx`, but with only an `a→Link` override — no
element→token map, no heading anchors, no syntax highlighting.

**Failure class (confirmed).** Left to instinct, an agent stores user rich text as raw HTML and
renders it with unsanitized `dangerouslySetInnerHTML` (stored XSS), validates the document as a
bare string instead of an allowlisted AST, never distinguishes trusted authored content from
untrusted user content, and styles prose off-token. This skill makes the document a Zod-validated
typed AST, renders it through an allowlist so no HTML is trusted, and keeps the two pipelines
distinct.

## Examples

**Input:** "Let users write blog posts with bold, links, and headings, and show them publicly."
**Output:** A Tiptap editor (`"use client"`) emitting ProseMirror JSON; a tRPC `create` mutation
Zod-parses the document against a node/mark allowlist and stores it as `jsonb`, ownership-checked
(Rule 2); the public page loads the JSON and renders it through a typed node→component map styled
with prose tokens — no HTML, no `dangerouslySetInnerHTML` — across loading/empty/error/success.

**Input:** "Render our `/docs` MDX files with code blocks and linkable headings."
**Output:** `@next/mdx` compiled in an RSC; an `mdxComponents` map binding `h1`–`h3`/`p`/`a`/
`code`/`pre`/`blockquote` to token-styled components; `rehype-slug` + `rehype-autolink-headings`
for anchors; build-time Shiki for highlighting; page metadata handed to `seo-metadata`.

**Input:** "A reviewer flags that our comment renderer does `dangerouslySetInnerHTML` on stored
HTML." **Output:** Named as stored XSS (launch-blocking) — switch storage to the editor's JSON
AST, Zod-validate on write, render via the allowlist map; if HTML must remain, sanitize against a
strict edge-safe allowlist before render and record the accepted residual risk in `DECISIONS.md`.

## Edge Cases

- **A sanitizer or `next-mdx-remote` that needs a DOM at the edge** → DOMPurify needs `jsdom`
  (not edge-safe). Render from the typed AST instead (no sanitizer needed), sanitize/compile at
  build time, or move the route to the node runtime and record it (`edge-runtime-constraints`).
- **You must accept user-authored *markdown* (not a JSON editor)** → parse to an AST with `remark`
  and render through an allowlist with `rehype-sanitize`; never enable `rehype-raw` on untrusted
  markdown — it reintroduces raw-HTML injection.
- **The editor allows images, embeds, or iframes** → these are the XSS/SSRF vectors; allowlist the
  exact node types, validate every URL (scheme + host), sandbox embeds, and run it through
  `security-pass`.
- **A new node type is added to the editor** → extend the shared Zod allowlist *and* the render
  map together; an un-allowlisted node must be dropped or error the document, never passed raw.

## References

- `references/mdx-rendering.md` — the authored-MDX pipeline: `@next/mdx` vs `next-mdx-remote` in an
  RSC, the token-styled `mdxComponents` map, `rehype-slug`/`rehype-autolink-headings` anchors,
  build-time Shiki highlighting, and the edge constraints.
- `references/user-rich-text.md` — the user-content pipeline: Tiptap/Lexical JSON AST, the shared
  Zod allowlist schema, `jsonb` storage, rendering the typed AST through an allowlist (with the
  sanitize-HTML fallback), and the four states.

## Scripts

`scripts/` is reserved (empty `.gitkeep`). A signal that would justify one: a static check grepping
`src/` for `dangerouslySetInnerHTML` fed by stored/user content with no sanitizer in scope, or
`rehype-raw` on an untrusted-markdown path — both greppable, unlike the trusted-vs-untrusted
classification, which is a judgment call.
</content>
