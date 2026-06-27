Purpose: the edge-Clerk wiring — env validation, middleware/matcher, sign-in/up pages, provider, organizations, and the tRPC context handoff.

# Middleware & auth wiring (edge)

## 1. Env boundary (Rules 8/9)

The publishable key is public; everything else is server-only. Validate all of it with Zod so
a missing secret fails at boot, not at the first request.

```ts
// src/env.ts
import { z } from "zod";

const server = z.object({
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().min(1), // Svix "whsec_..." secret
});

const client = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().default("/sign-in"),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().default("/sign-up"),
});

export const env = {
  ...server.parse(process.env),       // never imported into a Client Component
  ...client.parse(process.env),
};
```

Rule 9 tell: any `NEXT_PUBLIC_CLERK_SECRET*` or `NEXT_PUBLIC_*_WEBHOOK_*` name is wrong — the
secret would be inlined into the client bundle.

## 2. middleware.ts (the line that leaks)

`clerkMiddleware` runs at the edge. Declare public routes explicitly and protect the rest. The
matcher MUST cover `/(api|trpc)(.*)` or your mutations run unauthenticated.

```ts
// src/middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)", // webhooks authenticate via Svix signature, not a session
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect(); // 404/redirect for unauthenticated; throws otherwise
  }
});

export const config = {
  matcher: [
    // Run on everything except Next internals and static files...
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // ...and ALWAYS on API/tRPC routes.
    "/(api|trpc)(.*)",
  ],
};
```

Note: the webhook path is public to the *session* matcher because it is authenticated by its
Svix signature instead (see `webhooks.md`). It is the one endpoint where "public route" is
correct.

## 3. Provider + catch-all sign-in/up pages

```tsx
// src/app/layout.tsx
import { ClerkProvider } from "@clerk/nextjs";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en"><body>{children}</body></html>
    </ClerkProvider>
  );
}
```

```tsx
// src/app/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from "@clerk/nextjs";
export default function Page() {
  return <SignIn />; // appearance themed via design-tokens, not inline hex (Rule 3)
}
```

The `[[...sign-in]]` optional-catch-all segment is required so Clerk can render its
multi-step sub-routes (factor-two, SSO callback). A plain `page.tsx` breaks those flows.

## 4. tRPC context handoff (Rule 2 enablement)

Read Clerk auth once in the context factory; procedures consume `ctx.auth`, never re-call
`auth()` ad hoc.

```ts
// src/server/trpc/context.ts
import { auth } from "@clerk/nextjs/server";

export async function createContext() {
  const session = await auth(); // { userId, orgId, orgRole, ... } | nulls
  return { auth: session, db };
}

// protectedProcedure (defined in trpc-middleware) asserts ctx.auth.userId is non-null.
// The per-row ownership check (row.userId === ctx.auth.userId) is vertical-slice's job — Rule 2.
```

## 5. Organizations (multi-tenant)

When the app is org-scoped, `auth()` exposes `orgId` and `orgRole`. Decide and record the
tenancy model in `DECISIONS.md` because it changes the shape of every ownership check:

- Resources keyed by `userId` → check `row.userId === ctx.auth.userId`.
- Resources keyed by `orgId` → check `row.orgId === ctx.auth.orgId` AND require a non-null
  `orgId` (reject personal-account access, or route it to a personal workspace — decide once).

```tsx
// header.tsx — let users switch active org; activeOrg drives ctx.auth.orgId
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
export function AppHeader() {
  return <header><OrganizationSwitcher /><UserButton /></header>;
}
```

Gate org-scoped procedures on `orgId` in `trpc-middleware`; do not scatter the null-org
fallback across routes.
