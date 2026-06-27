# route-states — the four route-level files of Rule 4, with correct App Router code

Purpose: the canonical patterns for `loading.tsx`, `error.tsx`, `global-error.tsx`, and
`not-found.tsx` in a Next.js App Router segment on the edge, including recovery, digest
logging, and ownership-as-404 (Rule 2). Pair the UI here with `a11y-gate`; style with tokens
(Rule 3).

---

## The mapping: Rule 4 → files

| State    | File                       | Mechanism                                        |
| -------- | -------------------------- | ------------------------------------------------ |
| loading  | `loading.tsx`              | Auto Suspense boundary around the segment        |
| error    | `error.tsx`                | Client Component error boundary, `error`+`reset` |
| empty    | `not-found.tsx`            | Rendered when the loader calls `notFound()`      |
| success  | `page.tsx`                 | The resolved content                             |
| root err | `global-error.tsx` (root)  | Catches throws in the root `layout.tsx`          |

A segment's `error.tsx` catches errors thrown by that segment **and its children**, but NOT
by its own sibling `layout.tsx` or `template.tsx` (they render *above* the boundary). To catch
a layout's error, put the boundary in the parent segment, or use `global-error.tsx` at the root.

---

## `loading.tsx` — a layout-matching skeleton, not a spinner

`loading.tsx` is sugar for wrapping `page.tsx` in `<Suspense>` with this as the fallback. It
shows instantly while the server component awaits data. Mirror the success layout so the shell
does not reflow (CLS) when content arrives. Use token spacing/colors only (Rule 3).

```tsx
// app/invoices/[id]/loading.tsx  — Server Component is fine; no "use client" needed
export default function Loading() {
  return (
    <div className="space-y-6 p-6" aria-hidden>
      {/* header skeleton mirrors the real <InvoiceHeader/> footprint */}
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 w-full animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    </div>
  );
}
```

Notes:
- `bg-muted`, `rounded-md`, `space-y-6` are tokens — never `bg-[#eee]` or `gap-[13px]` (Rule 3).
- `aria-hidden` on the skeleton so a screen reader does not announce placeholder boxes as
  content; announce the real "loading" via a live region in the page if needed (`a11y-gate`).
- For partial loading, skip `loading.tsx` and wrap slow children in `<Suspense fallback={...}>`
  islands so the rest of the segment paints immediately.

---

## `error.tsx` — a recovering Client Component

MUST be a Client Component. Receives exactly `{ error, reset }`. `error` is an `Error` with an
optional `digest` (a hash Next also logs server-side; use it to correlate, never show the raw
message/stack). `reset()` re-renders the segment to retry a transient failure.

```tsx
// app/invoices/[id]/error.tsx
"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

export default function InvoiceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // log the real cause; do NOT render it
    Sentry.captureException(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto max-w-md space-y-4 p-6 text-center">
      <h2 className="text-lg font-semibold">We couldn’t load this invoice.</h2>
      <p className="text-sm text-muted-foreground">
        Something went wrong on our end. You can try again.
      </p>
      <div className="flex justify-center gap-3">
        <Button onClick={() => reset()}>Try again</Button>
        <Button variant="outline" asChild>
          <a href="/invoices">Back to invoices</a>
        </Button>
      </div>
    </div>
  );
}
```

Contract:
- `"use client"` is mandatory — error boundaries are client-only in React.
- Always offer recovery: `reset()` for transient failures AND a navigation for persistent ones
  (so a re-throwing `reset` does not trap the user).
- Stable, in-voice copy. Never `{error.message}` / `{error.stack}` in the JSX (disclosure + UX).
- `role="alert"` so the failure is announced; focus management is an `a11y-gate` concern.
- Tokens only: `text-muted-foreground`, `max-w-md`, `gap-3` (Rule 3).

---

## `global-error.tsx` — catches the root layout

A segment `error.tsx` cannot catch an error thrown in the **root** `layout.tsx`. `global-error.tsx`
replaces the whole root, so it must render its own `<html>` and `<body>`. One per app, at the
root. It only fires in production (the dev overlay takes over in development).

```tsx
// app/global-error.tsx
"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center p-6">
        <div role="alert" className="space-y-4 text-center">
          <h2 className="text-lg font-semibold">The app hit an unexpected error.</h2>
          <button className="underline" onClick={() => reset()}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
```

---

## `not-found.tsx` + `notFound()` — and ownership-as-404 (Rule 2)

`notFound()` (from `next/navigation`) throws a special error the framework renders as the
nearest `not-found.tsx` with a 404 status. Call it in the **server loader**, not the renderer.

Critical Rule 2 detail: a row that exists but does **not** belong to `ctx.auth.userId` must be
treated as absent — call `notFound()` (404), not a 403. A 403 reveals that the resource exists,
which is the ownership-disclosure leak. Fetch with the ownership predicate in the query so an
unowned row simply returns nothing:

```tsx
// app/invoices/[id]/page.tsx  — Server Component
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { invoices } from "@/db/schema";

// route params are external input — Zod-parse before use (Rule 8)
const paramsSchema = z.object({ id: z.string().uuid() });

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound(); // malformed id ⇒ 404, never reaches the query
  const { id } = parsed.data;
  const { userId } = await auth();
  if (!userId) notFound(); // or redirect to sign-in per nextjs-app-router

  // ownership baked into the predicate — unowned ⇒ no row ⇒ 404 (Rule 2)
  const invoice = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, id), eq(invoices.userId, userId)),
  });
  if (!invoice) notFound();

  return <InvoiceDetail invoice={invoice} />;
}
```

```tsx
// app/invoices/[id]/not-found.tsx  — Server Component is fine
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 p-6 text-center">
      <h2 className="text-lg font-semibold">Invoice not found</h2>
      <p className="text-sm text-muted-foreground">
        It may have been deleted, or you don’t have access to it.
      </p>
      <Link href="/invoices" className="underline">
        Back to invoices
      </Link>
    </div>
  );
}
```

Note the not-found copy deliberately conflates "deleted" and "no access" so it does not confirm
existence to a probing user.

---

## Per-segment completeness checklist (Rule 4)

For every data-bound route segment, confirm all of:

- [ ] `loading.tsx` exists and is a layout-matching skeleton (or `<Suspense>` islands cover it).
- [ ] `error.tsx` exists, is `"use client"`, offers `reset()` AND a navigation, logs `digest`,
      and renders NO raw `error.message`/`stack`.
- [ ] `not-found.tsx` exists and the loader calls `notFound()` on missing OR unowned rows (Rule 2).
- [ ] `global-error.tsx` exists once at the app root.
- [ ] All four surfaces use tokens only (Rule 3) and pass `a11y-gate` (role/alert, focus, no
      skeleton announced as content).
- [ ] Non-obvious boundary nesting recorded in `DECISIONS.md`.
