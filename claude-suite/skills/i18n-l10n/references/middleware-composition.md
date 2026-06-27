Purpose: folding the locale matcher into the existing `clerkMiddleware` (one chain), the combined `config.matcher`, and why a second middleware silently drops auth.

# Middleware composition — locale inside Clerk, not beside it

## The trap

Next.js runs **exactly one** `middleware.ts`, top to bottom, for a matched request. The
next-intl quick-start tells you to `export default createMiddleware(...)`. The Clerk quick-start
(`clerk-auth-flows`) tells you to `export default clerkMiddleware(...)`. You cannot have two
default exports, so the naive merge is to make `middleware.ts` *return early* into the intl
middleware for "page" routes and run Clerk for the rest — and that is the defect: every route the
intl branch handles **never reaches `auth.protect()`**. It returns 200, renders correctly in
English, and is unauthenticated. This is the Rule 2 coexistence failure.

## The fix: one chain, intl composed inside the Clerk callback

Create the next-intl middleware as a **plain function** and call it from *inside*
`clerkMiddleware`, so a single chain does locale rewriting and auth on every request.

```ts
// src/middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import createIntlMiddleware from "next-intl/middleware";
import { locales, defaultLocale } from "~/i18n/config";

const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: "as-needed",
});

// Protect by exception: only the gated areas require auth. Everything else — landing pages,
// marketing, and `/api/trpc` (so first-class `publicProcedure` works) — stays open. Match both
// the unprefixed and locale-prefixed paths, since Clerk sees the pre-rewrite URL (`/fr/dashboard`).
const isProtected = createRouteMatcher([
  "/dashboard(.*)",
  "/app(.*)",
  "/settings(.*)",
  "/(en|fr)/dashboard(.*)",
  "/(en|fr)/app(.*)",
  "/(en|fr)/settings(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // 1) Auth runs first — but only protected routes are gated. Public pages and procedures stay open.
  if (isProtected(req)) await auth.protect();

  // 2) API/tRPC must not be locale-rewritten; hand them straight back. They aren't gated here —
  //    tRPC authorizes per procedure (publicProcedure stays open, protectedProcedure checks auth).
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api") || pathname.startsWith("/trpc")) return;

  // 3) Page routes get the locale rewrite/redirect from the intl middleware.
  return intlMiddleware(req);
});

export const config = {
  // One matcher for the whole chain: skip _next and static files, cover api/trpc explicitly.
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
```

Key points:

- **Auth before locale.** The `auth.protect()` gate runs before any `intlMiddleware` return, so
  locale handling can never short-circuit authorization on a protected route. The intl rewrite
  happens after the auth decision.
- **Protect by exception, not deny-by-default.** Gate only the protected areas (`isProtected`);
  public pages and `/api/trpc` stay open so first-class `publicProcedure` keeps working. A
  deny-by-default `if (!isPublic(req))` would force auth on every public page and break
  `publicProcedure` — that is the bug this fixes.
- **One `config.matcher`.** It is the *union* of what Clerk needs (`/(api|trpc)(.*)`) and what
  intl needs (all pages except `_next`/static). Do not ship two matchers.
- **API/tRPC bypass the rewrite, and auth is per-procedure.** `/api` and `/trpc` are not localized
  URLs, so they return before `intlMiddleware`. They are inside the matcher but not blanket-gated:
  tRPC enforces auth per procedure, so `publicProcedure` is reachable and `protectedProcedure`
  checks `ctx.auth` itself (compare `clerk-auth-flows`: the matcher must cover `/(api|trpc)(.*)`).
- **Protected matcher accounts for the prefix.** Clerk sees the pre-rewrite path, so list both the
  prefixed (`/(en|fr)/dashboard`) and unprefixed forms of protected routes.

## Verifying coexistence

After wiring, sanity-check the two failure modes:

1. Hit a protected route under a non-default locale (`/fr/dashboard`) while signed out → you must
   be redirected to sign-in, **not** served the page. If you get the page, the protected matcher
   is missing the locale-prefixed form.
2. Hit a public page and a `publicProcedure` over `/trpc/...` while signed out → both must remain
   reachable (no forced sign-in), and the page must still be locale-rewritten; `protectedProcedure`
   stays gated by its own `ctx.auth` check.

`clerk-auth-flows` owns the matcher-coverage rule; this file owns the composition order. If you
later add a `verify-matcher.mjs` (reserved there), extend it to assert a single default export.
