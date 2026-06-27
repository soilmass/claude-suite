Purpose: how to declare and choose the runtime per route in the App Router, the always-edge middleware rule, and a checklist for scanning a diff for edge violations.

# Runtime selection in the App Router

## The default and the opt-in

- App Router routes (`page.tsx`, `layout.tsx`, `route.ts`) default to **`runtime = 'nodejs'`**.
- The edge is opt-in **per route segment**:

  ```ts
  // app/api/token/route.ts
  export const runtime = "edge"; // or "nodejs"
  ```

- A green local build proves nothing about edge compatibility: most code runs on Node locally
  unless the route declares `edge`. Trust `next build` / the deploy, not `next dev` (dev can
  execute edge routes on Node).
- Per the spine in `../../CLAUDE.md`, the deployment target is the edge — so `edge` is the
  intended default for new routes, and a `nodejs` route is a logged deviation (`DECISIONS.md`).

## Middleware is always edge — no opt-out

`middleware.ts` runs on the **edge runtime regardless of any `runtime` export**. It therefore:

- Must never import a Node-only module (`fs`, `net`, `node:crypto`, native packages).
- Should stay light: auth, redirects, header/rewrite work — not DB-heavy logic.
- Uses Clerk's `clerkMiddleware`, chosen because it is edge-compatible:

  ```ts
  // middleware.ts
  import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

  const isProtected = createRouteMatcher(["/dashboard(.*)"]);

  export default clerkMiddleware((auth, req) => {
    if (isProtected(req)) auth().protect();
  });

  export const config = { matcher: ["/((?!_next|.*\\..*).*)"] };
  ```

If middleware needs something Node-shaped, push that work into a `nodejs` route handler the
middleware redirects/forwards to — do not try to make middleware Node.

> Note: Next.js has shipped experimental Node-runtime middleware in recent versions. Treat
> "middleware is always edge" as the safe default here; if a project adopts node middleware,
> record it in `DECISIONS.md` and let `perishable-refresh` track the version standing.

## Choosing edge vs nodejs for a route

1. Does the route (and its transitive deps) need a Node-only API with **no** edge-safe
   replacement? (see `edge-incompatibilities.md`)
   - **No** → keep `runtime = 'edge'`. This is the default intent.
   - **Yes** → set `runtime = 'nodejs'` on **that route only**, and record the reason in
     `DECISIONS.md`. Never flip the whole app to escape one dependency.
2. Is it latency-sensitive and globally distributed (auth check, personalization, redirects)?
   → strong reason to keep edge.
3. Is it a rare, heavy, Node-bound job (PDF/image generation, a Node-only SDK)?
   → acceptable `nodejs` route; isolate it.

## Diff-scan checklist (what to look for)

Run mentally (or with `rule-audit` adjacent) over any diff touching routes or middleware:

- [ ] New `import` of `fs`, `net`, `dns`, `tls`, `child_process`, `node:*`?
- [ ] `process.cwd()`, `__dirname`, `__filename`, or `process.X` beyond static `process.env`?
- [ ] `Buffer` reliance where `Uint8Array`/`TextEncoder` would do?
- [ ] A package known to be native or TCP-based: `bcrypt`, `sharp`, `pg`, `mysql2`,
      `nodemailer`, `better-sqlite3`, `jsonwebtoken`?
- [ ] `eval` / `new Function` (yours or transitive)?
- [ ] Does the file (or middleware) declare/imply `edge` while doing any of the above?
- [ ] Did a swap reopen the type chain (untyped `fetch`/`JSON.parse`, Rule 1) or skip
      Zod-parsing the new boundary (Rule 8)?
- [ ] Any new `runtime = 'nodejs'` without a matching `DECISIONS.md` entry?
