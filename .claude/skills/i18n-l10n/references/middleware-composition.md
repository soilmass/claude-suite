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

// Public routes are matched on the *locale-stripped* path so /fr/sign-in works too.
const isPublic = createRouteMatcher([
  "/",
  "/(en|fr)",
  "/(en|fr)/sign-in(.*)",
  "/(en|fr)/sign-up(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // 1) Auth runs first, for every matched request — protected routes are still protected.
  if (!isPublic(req)) await auth.protect();

  // 2) API/tRPC must not be locale-rewritten; hand them straight back (still authed above).
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

- **Auth before locale.** `auth.protect()` runs before any `intlMiddleware` return, so locale
  handling can never short-circuit authorization. The intl rewrite happens on an already-authed
  request.
- **One `config.matcher`.** It is the *union* of what Clerk needs (`/(api|trpc)(.*)`) and what
  intl needs (all pages except `_next`/static). Do not ship two matchers.
- **API/tRPC bypass the rewrite, not the auth.** `/api` and `/trpc` are not localized URLs, so
  they return before `intlMiddleware`, but they are still inside the `clerkMiddleware` callback
  and inside the matcher — so they are still authenticated (compare `clerk-auth-flows`: the
  matcher must cover `/(api|trpc)(.*)`).
- **Public matcher accounts for the prefix.** Clerk sees the pre-rewrite path, so list both the
  prefixed (`/(en|fr)/sign-in`) and unprefixed forms of public routes.

## Verifying coexistence

After wiring, sanity-check the two failure modes:

1. Hit a protected route under a non-default locale (`/fr/dashboard`) while signed out → you must
   be redirected to sign-in, **not** served the page. If you get the page, locale handling is
   short-circuiting auth.
2. Hit `/trpc/...` → it must still require auth and must **not** be locale-rewritten.

`clerk-auth-flows` owns the matcher-coverage rule; this file owns the composition order. If you
later add a `verify-matcher.mjs` (reserved there), extend it to assert a single default export.
