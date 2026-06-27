---
name: deploy-edge
description: >
  Drive a Vercel deploy of the edge-stack app: open a preview deploy on a branch, wire
  environment variables to the right scope (Production / Preview / Development), confirm the
  per-route edge runtime and region config survives the build, and promote a vetted build to
  production. Covers the platform mechanics — git-integration deploys, the CLI, env scoping,
  build/runtime config, and instant promotion — not the code that runs inside.
  Use when: "deploy", "deploy to vercel", "preview deploy", "ship to production".
  Do NOT use for: runtime errors / Node-API-at-edge failures (use edge-runtime-constraints),
  ordering a schema change against a deploy (use migration-deploy-coordination).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the "deploy config leaks or breaks production" failure
    class: a secret promoted into the client bundle, env vars wired to the wrong scope, or a
    build promoted ahead of its migration.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# deploy-edge

The mechanics of getting a build onto Vercel without leaking a secret, mis-scoping an env
var, or promoting code ahead of its schema. The spine (`../../CLAUDE.md`) commits the app to
the **edge runtime**; deploy is where that commitment gets verified at the platform boundary
and where Rule 9 (no client-side secrets) and Rule 8 (validated env) are won or lost in
config rather than code.

---

## Non-Negotiable Rules
- **Never put a secret in a `NEXT_PUBLIC_*` var or any client-reachable env.** `NEXT_PUBLIC_`
  values are inlined into the client bundle at build time — promoting one ships it to every
  visitor (Rule 9). Secrets are server-scoped, marked Sensitive in Vercel.
- **Never promote a code build that reads a schema the database doesn't have yet.** Migration
  ordering is expand-contract and is owned by `migration-deploy-coordination`; deploy waits on it.
- **Never set an env var without choosing its scope** (Production / Preview / Development).
  An unscoped or all-scopes secret leaks production credentials into every preview URL.
- **Never promote a build that hasn't passed the gates** (`rule-audit`, `a11y-gate`,
  `security-pass`, CI perf budget). Preview is for vetting; production is for vetted.

Refuse these rationalizations: "it's just a preview, reuse the prod keys" · "prefix it
`NEXT_PUBLIC_` so the client can read it" · "promote now, run the migration after" · "skip
the gate, it's a tiny change."

## When to Use
- Opening a preview deploy for a branch/PR to vet a change on real infrastructure.
- Wiring or auditing environment variables and their scopes for a Vercel project.
- Confirming per-route `runtime`/`preferredRegion` and build settings before shipping.
- Promoting a vetted preview build to production (or doing an instant rollback-by-promotion).

## When NOT to Use
- A build/runtime error that a Node API doesn't exist at the edge → `edge-runtime-constraints`.
- Sequencing a Drizzle migration around the deploy (expand-contract) → `migration-deploy-coordination`.
- Executing a rollback after a bad production deploy → `rollback-runbook`.
- Choosing/wiring the Neon or Turso HTTP driver itself → `neon-turso-driver`.

---

## Procedure

1. **Confirm the deploy trigger and target (low cost, do first).** Vercel's git integration
   makes every push to a non-production branch a **Preview Deployment** and every push/merge
   to the production branch a **Production Deployment**. Know which you are doing before you
   push; for ad-hoc deploys use `vercel` (preview) vs `vercel --prod`. See
   `references/vercel-deploy-flow.md`.

2. **Audit env vars and their scope before the build (high cost — this is the Rule 9/8
   boundary).** For each var decide: which environment(s) (Production / Preview / Development),
   and is it a secret (server-only, mark Sensitive) or a public config value. Preview must use
   its own non-production credentials, never the prod keys. Validate the full set against the
   Zod env schema (Rule 8). The scoping table and the `NEXT_PUBLIC_` rule are in
   `references/env-wiring.md`.

3. **Verify edge runtime and region config carries into the build (medium cost).** Confirm
   the routes that must run at the edge declare `export const runtime = 'edge'`, that
   middleware stays edge-pure, and that `preferredRegion` / `vercel.json` function config is
   set. A green local build does not prove edge-validity — see `references/vercel-deploy-flow.md`.
   If the build dies on a Node API, hand to `edge-runtime-constraints`.

4. **Open the preview deploy and run the gates against it (medium cost).** Push the branch or
   run `vercel`; get the preview URL. Run `rule-audit`, `a11y-gate`, `security-pass` and let
   CI run the perf budget against the deployed preview, not just localhost. Preview is the
   vetting surface — a build that hasn't passed here is not promotable.

5. **Coordinate the migration before promotion (high cost — wrong order breaks prod).** If
   the change touches the schema, the expand step must be deployed and applied before the code
   that reads it is promoted; the contract step comes after. Do not improvise this — hand the
   sequencing to `migration-deploy-coordination` and wait for its go-ahead.

6. **Promote the vetted build to production (high cost — user-facing).** Promote the exact
   preview build (`vercel promote <deployment-url>` or the dashboard "Promote to Production");
   promotion reuses the existing build artifact, so production runs the bytes you vetted — no
   rebuild, no drift. Record any non-obvious platform choice (region, a `nodejs` route
   exception, a sensitive-var decision) in `DECISIONS.md`.

7. **Confirm health, keep the rollback path ready (medium cost).** Watch error rate / logs
   post-promotion. Because promotion is pointer-based, the previous production build is still
   built and one promote away — that instant rollback path is `rollback-runbook`'s job; know
   it exists before you promote.

---

## Composes With
- **Consumes:** `edge-runtime-constraints` (resolves a Node-API-at-edge build failure before
  the deploy can proceed).
- **Pairs with:** `migration-deploy-coordination` (sequences a schema change against the
  promotion), `rollback-runbook` (the instant-promote-back path if production regresses).
- **Runs against:** the deployed preview URL — `rule-audit`, `a11y-gate`, `security-pass`,
  and the CI perf budget vet the preview before promotion.
- **Consumes:** `env-validation` / the Zod env schema for the Rule 8 boundary check.

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)
> Encoded failure class, not a captured transcript; replace once observed in the wild.

**Failure class encoded:** Asked to "deploy to vercel," the agent wires env vars and ships
with no thought to scope or ordering. Concrete defects that ship: (1) a Clerk/DB secret given
the `NEXT_PUBLIC_` prefix "so the client can read it," inlining it into the public bundle
(Rule 9); (2) production database/Clerk keys reused for the Preview scope, so every preview URL
talks to prod; (3) env vars added with no scope (all environments), leaking prod creds into
previews; (4) `vercel --prod` run straight off a branch with no preview vetting and no gate
run; (5) the build promoted before its expand migration is applied, so production code queries
a column that doesn't exist yet; (6) no awareness that the prior build is one promote away,
so a regression turns into a panicked rebuild instead of an instant rollback.

---

## Examples

**Input:** "Deploy this branch so the team can review it."
**Output:** Pushes the branch → Vercel git integration produces a Preview Deployment URL.
Confirms Preview-scoped env vars point at non-prod Clerk + a preview database, not prod keys.
Runs `rule-audit` / `a11y-gate` / `security-pass` and the CI perf budget against the preview
URL. Returns the URL; does not promote.

**Input:** "Add the Resend API key and ship to production."
**Output:** Adds `RESEND_API_KEY` as a server-scoped **Sensitive** var (Production + Preview
get distinct keys), explicitly NOT `NEXT_PUBLIC_` (Rule 9); adds it to the Zod env schema so
the build fails fast if missing (Rule 8). Vets on preview, then `vercel promote` the vetted
build. Records nothing new in `DECISIONS.md` (no fork).

**Input:** "Ship the feature that adds an `archived_at` column."
**Output:** Holds promotion. Hands schema sequencing to `migration-deploy-coordination`
(expand: add nullable column + deploy/apply first). Only once expand is live does it promote
the code that writes `archived_at`; contract (if any) is a later, separate deploy.

## Edge Cases
- **Preview and Production need different third-party keys (Clerk instance, DB branch)** →
  scope each var per environment; never reuse the prod secret in Preview. See `references/env-wiring.md`.
- **A new env var was added but the build "can't find it"** → it was set after the build, or
  in the wrong scope; env vars bind at build time per environment — redeploy after setting,
  in the matching scope.
- **One route genuinely needs the Node runtime** → that decision belongs to
  `edge-runtime-constraints`; deploy only confirms the per-route `runtime` flag and any
  `vercel.json` config carried into the build, and that it's logged in `DECISIONS.md`.
- **Production regressed right after promotion** → do not rebuild under pressure; the prior
  build is still live-able — promote it back via `rollback-runbook`.

---

## References
- `references/vercel-deploy-flow.md` — git-integration vs CLI deploys, preview→production
  promotion (pointer-based, no rebuild), edge runtime/region/`vercel.json` config, and the
  pre-promotion checklist.
- `references/env-wiring.md` — the env-scope matrix (Production / Preview / Development),
  the `NEXT_PUBLIC_` inlining rule (Rule 9), Sensitive vars, `vercel env pull`, and the Zod
  env-validation boundary (Rule 8) with the stack's expected keys.

## Scripts
`scripts/` reserved. A checker that diffs the declared Zod env schema against
`vercel env ls` per scope (flagging missing keys and any secret wearing a `NEXT_PUBLIC_`
prefix) would justify one once the env-key set stabilizes across projects. Empty for now.
