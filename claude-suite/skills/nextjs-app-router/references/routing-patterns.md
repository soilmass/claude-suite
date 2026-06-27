Purpose: App Router file conventions, validated route handlers (Rule 8), streaming/Suspense, parallel and intercepting routes, and metadata.

# File conventions

Within an `app/` segment folder, file names are reserved and behavioral:

| File | Role |
|------|------|
| `layout.tsx` | Persistent shell wrapping the subtree; nests; does not re-render on child navigation. Root layout owns `<html>`/`<body>` and providers. |
| `page.tsx` | The route's leaf UI (makes the segment publicly routable). |
| `loading.tsx` | Suspense fallback for the segment while its server work streams. Rule 4: loading. |
| `error.tsx` | Error boundary for the segment. **Must be `"use client"`**; receives `{ error, reset }`. Rule 4: error. |
| `not-found.tsx` | Rendered by `notFound()` or an unmatched dynamic segment. Rule 4: empty/absent. |
| `route.ts` | HTTP handler(s) for the path (`GET`/`POST`/...). Cannot coexist with `page.tsx` at the same path. |
| `template.tsx` | Like layout but re-mounts per navigation (rarely needed). |

Folder conventions:

- `[id]` dynamic segment → `params.id`. `[...slug]` catch-all. `[[...slug]]` optional catch-all.
- `(group)` route group → organizes without affecting the URL (e.g. `(marketing)`, `(app)`).
- `@slot` named slot → a parallel route (see below).
- `(.)seg` / `(..)seg` → intercepting routes (see below).

`generateStaticParams` pre-renders dynamic params at build; pair with `data-fetching-cache`
for revalidation semantics — that ownership is not this skill's.

# Route handlers (Rule 8 + Rule 9)

A `route.ts` is an external boundary: parse before use.

```ts
// app/api/projects/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { createProjectSchema } from "@/features/projects/schema"; // shared Zod (one copy)

export const runtime = "edge";              // spine default

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = createProjectSchema.safeParse(await req.json()); // Rule 8
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [row] = await db.insert(projects)
    .values({ ...parsed.data, ownerId: userId })   // ownership stamped from auth, Rule 2
    .returning();
  return NextResponse.json(row, { status: 201 });
}
```

Notes:
- Parse `searchParams` too: `z.coerce.number().parse(new URL(req.url).searchParams.get("page"))`.
- Parse dynamic `params` (`{ params }: { params: Promise<{ id: string }> }` in current
  Next; `await params`) with a Zod schema before querying.
- Webhooks: verify the signature against the raw body *before* parsing, then Zod-parse the
  event. Read the signing secret server-side only (Rule 9). Hand abuse cases to `security-pass`.
- Prefer tRPC for app data; reserve `route.ts` for webhooks, OAuth callbacks, uploads, and
  non-tRPC integrations.

# Streaming with Suspense

`loading.tsx` is sugar for wrapping the whole segment in `<Suspense>`. For finer control,
stream slow children individually so the shell paints immediately:

```tsx
// app/dashboard/page.tsx (Server Component)
import { Suspense } from "react";
export default function Page() {
  return (
    <>
      <Header />                                  {/* fast, paints now */}
      <Suspense fallback={<StatsSkeleton />}>
        <Stats />                                  {/* async server child, streams in */}
      </Suspense>
    </>
  );
}
```

The skeleton fallback is token-styled (no hardcoded sizes — Rule 3); design it with
`error-boundaries`/`design-tokens`. Avoid one giant Suspense around everything if part of the
page is fast.

# Parallel routes (`@slot`)

Render multiple independent subtrees in one layout — dashboards, split views, slot-level
loading/error. Folders prefixed `@` become props on the layout:

```
app/dashboard/
  layout.tsx        // ({ children, team, analytics }) => render all three
  @team/page.tsx
  @analytics/page.tsx
  page.tsx          // fills {children}
```

Each slot has its own independent `loading.tsx`/`error.tsx`. Provide `default.tsx` for a slot
so unmatched states on hard navigation render something.

# Intercepting routes (`(.)`)

Show a route's content in the current layout's context (e.g. a modal over a list) on client
navigation, while a hard load/refresh hits the real page. Matchers: `(.)` same level,
`(..)` one up, `(...)` from root.

```
app/photos/
  page.tsx                 // the grid
  @modal/(.)photo/[id]/page.tsx   // modal overlay on client nav from the grid
  photo/[id]/page.tsx      // full page on hard load / refresh / shared link
```

The non-intercepted `photo/[id]/page.tsx` **must** exist so a direct visit or refresh renders
a real page, not an empty slot. Pair `@modal` with a `default.tsx` returning `null`.

# Metadata

```tsx
// static
export const metadata = { title: "Dashboard", description: "..." };

// dynamic — runs on the server; may read params, never leaks a secret (Rule 9)
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectPublicById(id);   // public fields only
  return { title: project?.name ?? "Project" };
}
```

`generateMetadata` runs server-side and is fine to query the DB, but emit only
public-safe fields into the document head.
