Purpose: Vercel deploy mechanics for the edge stack — how preview and production deploys are triggered, how promotion works, how edge runtime/region/build config carries into the deployed artifact, and the checklist gating promotion.

# Deploy triggers

Two ways a deploy starts. Prefer git-integration; the CLI is for ad-hoc cases.

**Git integration (default).** Connect the repo once in the Vercel project.
- Push to a **non-production branch** (or open a PR) → a **Preview Deployment**. Each push
  gets its own immutable URL; PRs get a sticky preview comment.
- Push/merge to the **production branch** (usually `main`) → a **Production Deployment**.

**Vercel CLI (ad-hoc).**
- `vercel` → builds and deploys a **preview**.
- `vercel --prod` → deploys straight to **production**. Reserve this for emergencies; it
  bypasses the PR-preview vetting surface.
- `vercel pull` → pulls project settings + env into `.vercel/`.
- `vercel build` → runs the build locally producing `.vercel/output` (the Build Output API
  artifact) so you can inspect what will deploy.

# Promotion is pointer-based (no rebuild)

A production "deploy" is Vercel pointing the production domain at a built deployment. Two
consequences that matter:

- **Promote a vetted preview build instead of building again on `main`.** `vercel promote
  <deployment-url>` (or dashboard → deployment → **Promote to Production**) repoints production
  at an *existing* build artifact. Production then runs the exact bytes vetted on preview — no
  rebuild, no "works on preview, breaks on prod" drift from a re-run build.
- **Rollback is the same operation in reverse.** The previous production build is still built
  and addressable; promoting it back is instant. (Executing that is `rollback-runbook`'s job;
  deploy only needs to know the path exists and not panic-rebuild.)

Note: by default a push to the production branch auto-promotes. To separate "build on main"
from "go live," enable a manual-promotion / staged flow in the project's Git settings so the
production-branch build lands as a non-live deployment you then promote deliberately.

# Edge runtime / region / build config

A green local `next dev` proves nothing about the edge — `next dev` can run edge routes on
Node. Trust `next build` and the Vercel build log.

- **Per-route runtime:** `export const runtime = 'edge'` in a route/layout/page segment opts
  that segment into the edge runtime. Middleware is always edge (no opt-out). A route with no
  declaration runs on the default Node serverless runtime.
- **Region:** `export const preferredRegion = 'iad1'` (or an array) pins where edge/functions
  execute — put compute near the database region to cut latency. The serverless HTTP DB driver
  (Neon/Turso) is what makes edge data access viable (see `neon-turso-driver`).
- **`vercel.json`:** project-level function config (regions, memory/duration for non-edge
  functions, headers, redirects, rewrites, cron). Security headers verified by `security-pass`
  can live here.
- If the build fails with a "Node.js API not supported in the Edge Runtime" class error, that
  is `edge-runtime-constraints`, not a deploy problem — fix the code, then redeploy.

# Pre-promotion checklist

Run against the **deployed preview URL**, not localhost:

1. Env vars present and correctly scoped for the *target* environment (see `env-wiring.md`).
2. `next build` clean; no edge-incompatibility error in the build log.
3. Gates pass on the preview: `rule-audit`, `a11y-gate`, `security-pass`, `design-gate`, CI perf
   budget (LCP/INP/CLS p75).
4. If the change touches the schema, `migration-deploy-coordination` has confirmed the expand
   step is deployed and applied. Code that reads new columns never promotes ahead of them.
5. Any platform fork (region choice, a `nodejs`-runtime route exception, a sensitive-var call)
   recorded in `DECISIONS.md`.
6. Promote the vetted build (`vercel promote <url>`), then watch error rate / logs. Keep the
   prior build's URL handy for an instant promote-back.
