Purpose: the untrusted-user rich-text pipeline — a structured editor, storing a Zod-validated JSON AST (never raw HTML), rendering it through a typed allowlist so it can never XSS, and the four states.

# User-authored rich text (the XSS surface)

User rich text is **never trusted**. The whole pipeline is built so that a malicious document —
`<img src=x onerror=…>`, a `javascript:` link, an injected `<script>` — cannot execute when
another user views it. The way you guarantee that is: store a **typed JSON AST**, validate it
against an **allowlist** on write, and render it by walking the tree to React elements (no HTML
string ever exists). `security-pass` owns the threat model; this is the implementation.

## 1. Use a structured editor; keep its JSON, drop its HTML

Tiptap (ProseMirror) and Lexical both model the document as a **JSON tree**, not HTML. Capture
`editor.getJSON()` (Tiptap) or the Lexical editor state JSON — never `editor.getHTML()`. HTML is a
serialization that re-introduces the injection surface; JSON is structured data you can validate.

```tsx
"use client"; // the editor is a client component — and holds no secrets (Rule 9)
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { JSONContent } from "@tiptap/core";

export function PostEditor({ value, onChange }: {
  value: JSONContent | undefined;
  onChange: (doc: JSONContent) => void; // JSON, NOT html
}) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ /* enable only the nodes you allowlist */ })],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
  });
  return <EditorContent editor={editor} />;
}
```

Keep the enabled extension set and the render/validation allowlist (below) in lockstep — one
source of truth for "which nodes exist."

## 2. Validate the document against an allowlist (Rule 8)

The JSON leaving the browser is untrusted input. In the tRPC mutation, Zod-parse it against an
allowlist of node `type`s and mark `type`s before storing — reject unknown nodes rather than
passing them through. Author this schema with `zod-schema-library`; share it between the form
resolver and the `.input()`.

```ts
import { z } from "zod";

const ALLOWED_MARKS = ["bold", "italic", "link"] as const;
const ALLOWED_NODES = ["doc", "paragraph", "text", "heading", "bulletList",
  "orderedList", "listItem", "blockquote"] as const;

const markSchema = z.object({
  type: z.enum(ALLOWED_MARKS),
  // link href is the XSS vector — constrain the scheme, no javascript:/data:
  attrs: z.object({ href: z.string().url().refine(
    (u) => /^https?:\/\//.test(u), "only http(s) links") }).partial().optional(),
});

// recursive node schema — z.lazy for the children
export const docNode: z.ZodType<DocNode> = z.lazy(() =>
  z.object({
    type: z.enum(ALLOWED_NODES),
    attrs: z.record(z.string(), z.unknown()).optional(),
    marks: z.array(markSchema).optional(),
    text: z.string().optional(),
    content: z.array(docNode).optional(),
  }),
);
type DocNode = {
  type: (typeof ALLOWED_NODES)[number];
  attrs?: Record<string, unknown>;
  marks?: z.infer<typeof markSchema>[];
  text?: string;
  content?: DocNode[];
};
export const postDocument = docNode; // shared: tRPC input + RHF resolver
```

In the mutation, `postDocument.parse(input.content)` runs **before** the ownership-checked insert
(Rule 2). A document with an un-allowlisted node throws — it never reaches the DB.

## 3. Store the AST as `jsonb`

```ts
// src/db/schema/posts.ts
import { pgTable, uuid, varchar, jsonb, timestamp } from "drizzle-orm/pg-core";
import type { DocNode } from "@/schemas/post-document";

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(), // UUIDv7 in practice — schema-design
  authorId: varchar("author_id", { length: 256 }).notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  // the validated JSON AST — typed via $type so the chain stays rooted (Rule 1)
  content: jsonb("content").$type<DocNode>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

`jsonb` is the sanctioned use of JSON columns per `../../CLAUDE.md`: schemaless-but-constrained
data you don't query into. Record the choice. `timestamptz` (Rule 6), not bare `timestamp`.

## 4. Render the typed AST through an allowlist — no HTML

Walk the validated tree to React elements via a node→component map. Because you build elements
(never an HTML string), there is **nothing to sanitize and no `dangerouslySetInnerHTML`**. Each
component resolves to design tokens (Rule 3), so the rendered post inherits the same prose styling
as the authored MDX (`mdx-rendering.md`).

```tsx
// components/post/RenderDoc.tsx — server component, no client JS needed
import type { DocNode } from "@/schemas/post-document";

export function RenderDoc({ node }: { node: DocNode }) {
  const children = node.content?.map((c, i) => <RenderDoc node={c} key={i} />);
  switch (node.type) {
    case "doc": return <div className="space-y-(--space-4)">{children}</div>;
    case "paragraph": return <p className="leading-(--leading-relaxed)">{children}</p>;
    case "heading": return <h2 className="text-(length:--font-size-2xl) font-semibold">{children}</h2>; // map node.attrs.level → h1–h6 for real hierarchy
    case "blockquote": return <blockquote className="border-l-2 border-(--color-border) pl-(--space-4)">{children}</blockquote>;
    case "bulletList": return <ul className="list-disc pl-(--space-6)">{children}</ul>;
    case "orderedList": return <ol className="list-decimal pl-(--space-6)">{children}</ol>;
    case "listItem": return <li>{children}</li>;
    case "text": return <Text node={node} />;
    default: return null; // un-allowlisted node: drop it, never render raw
  }
}

function Text({ node }: { node: DocNode }) {
  let el: React.ReactNode = node.text;
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") el = <strong>{el}</strong>;
    else if (mark.type === "italic") el = <em>{el}</em>;
    else if (mark.type === "link" && mark.attrs?.href)
      el = <a href={mark.attrs.href} rel="nofollow ugc noopener" className="text-(--color-primary) underline">{el}</a>;
  }
  return <>{el}</>;
}
```

`rel="nofollow ugc noopener"` on user links is the standard hardening for user-generated content.

### The sanitize-HTML fallback (only if HTML is unavoidable)

If a legacy path forces an HTML string, sanitize against a **strict allowlist** with an edge-safe
sanitizer (e.g. a parser-based one that doesn't need a DOM) before any `dangerouslySetInnerHTML` —
strip every tag/attribute not on the list, and drop `javascript:`/`data:` URLs. DOMPurify needs
`jsdom` and is not edge-safe; prefer rendering the AST (above), or sanitize at write-time in a
node context. Record the residual risk in `DECISIONS.md` and take it through `security-pass`.

## 5. The four states (Rule 4)

The viewer and the editor each render all four:

- **Loading** — skeleton while the post query resolves.
- **Empty** — the author hasn't written anything yet (`content.content` is empty) → an empty-state
  prompt, not a blank `<div>`.
- **Error** — the query failed *or* `postDocument.parse` threw on a stored document (a pre-existing
  bad row): render an explicit "couldn't display this post" state, never a crash or blank.
- **Success** — the rendered AST.

Parsing on read as well as write means a malformed legacy row degrades to the error state instead
of reaching the renderer.
</content>
