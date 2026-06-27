---
name: feature-flags
description: >
  Wire feature flags for gradual rollout and kill switches on the edge stack: a typed flag
  registry rooted in the type chain, edge-safe evaluation (middleware / RSC / tRPC) against
  an edge KV with a fail-safe default, deterministic per-user bucketing for canaries, and
  resolved booleans (never provider tokens) handed to the client. Decouples release from
  deploy so a risky feature ships dark and flips on — or off — without a redeploy.
  Use when: "feature flag", "gradual rollout", "kill switch", "toggle a feature", "canary".
  Do NOT use for: deploy/promote mechanics (use deploy-edge), experiment design and A/B
  statistics (foundation optimization-loop).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the "flag that breaks the edge, flickers, or leaks" failure
    class: untyped string lookups, Math.random rollout, no fail-safe default, provider token
    in the client bundle.
    Baseline observed (clean-room capture).
---

# feature-flags

A flag decouples *release* from *deploy*: ship the code dark, then flip it on for a cohort or
kill it instantly without touching the build. On this stack (`../../CLAUDE.md`) that flip
happens at the **edge** — in `clerkMiddleware`, in RSCs, in tRPC procedures — so evaluation
must be Web-API-only, typed end to end, and fail to a safe state when the flag source is
unreachable. This skill encodes the failure class where a toggle silently breaks the edge,
re-buckets a user on every request, or leaks its provider key into the client bundle.

---

## Non-Negotiable Rules
- **Never resolve a flag by a bare string literal.** Every flag is a key in the typed registry
  with a typed default; lookups go through `evaluate(key, ctx)`, so a renamed or deleted flag
  is a compile error, not a silent `undefined` (Rule 1).
- **Never gate a rollout on `Math.random()` or per-request randomness.** Bucket
  deterministically by a stable identifier (Clerk `userId`) hashed with the flag key, so a
  user stays in the same cohort across requests instead of flickering in and out.
- **Never read the flag source without a Zod-parsed payload and a fail-safe default.** The KV
  read is an external boundary (Rule 8); a store outage or malformed value must resolve to the
  safe default (kill switches default OFF / to the pre-feature path), never throw or 500.
- **Never expose a flag-provider write token or SDK secret to the client.** Evaluate
  server-side and pass only the resolved boolean down; no provider key in `NEXT_PUBLIC_*` or a
  Client Component (Rule 9).

Refuse these rationalizations: "just read `process.env.FEATURE_X`" · "`Math.random() < 0.1` is
fine for a 10% canary" · "if the config store is down just let it throw" · "expose the flags
client-side, they're only booleans" (the provider token is the leak).

## When to Use
- Wrapping a new or risky feature in a toggle so it ships dark and flips on later.
- Rolling a feature out gradually (1% → 10% → 100%) or to a named canary cohort.
- Adding a kill switch to a feature that can fail in production, flippable without a deploy.
- Evaluating flags inside edge middleware, a Server Component, or a tRPC procedure.

## When NOT to Use
- Deploying, promoting a build, env-var scoping at the platform → `deploy-edge`.
- Designing the experiment, choosing metrics, or running the A/B statistics → `optimization-loop`.
- A Node-API-at-edge build failure in the evaluation path → `edge-runtime-constraints`.
- Validating the app's env surface in general → `env-validation` (this consumes its schema).

---

## Procedure

1. **Define the flag in the typed registry first (low cost).** Add an entry with a typed
   `default`, an owner, a created date, and a one-line sunset condition. `FlagKey` derives from
   the registry as `keyof typeof flags`, so every downstream lookup is type-checked (Rule 1).
   See `references/edge-evaluation.md`.

2. **Pick an edge-safe flag source and wire it through env validation (medium cost).** Vercel
   Edge Config (read-optimized, near-zero latency) or an HTTP KV (Upstash Redis REST). No Node
   SDK, no TCP client — those die at the edge (that diagnosis is `edge-runtime-constraints`).
   The connection token goes through the Zod env schema (Rule 8). Record the source choice in
   `DECISIONS.md`. See `references/edge-evaluation.md`.

3. **Evaluate fail-safe: Zod-parse the payload, fall back to the default (high cost — an outage
   here is a site outage).** Wrap the KV read so any miss, parse failure, or thrown error
   resolves to the registry default. A kill switch's default is the *safe* state (feature off /
   the pre-feature code path). See `references/edge-evaluation.md`.

4. **Bucket deterministically for rollout and canary (high cost — non-determinism re-buckets
   users every request).** Hash `flagKey + userId` with Web Crypto (`crypto.subtle`, edge-native)
   to a stable `0–99`; compare against the rollout percentage. Same user, same answer, every
   time. See `references/rollout-patterns.md`.

5. **Apply override precedence in one place (medium cost).** Resolve in fixed order: global
   kill switch → explicit targeting (allow/deny list, plan, tenant) → percentage rollout →
   default. If a per-user override is persisted, scope it to `ctx.auth.userId` (Rule 2). See
   `references/rollout-patterns.md`.

6. **Keep evaluation server-side; hand the client only resolved booleans (high cost — Rule 9).**
   Evaluate in middleware / RSC / tRPC and pass the resolved flag down as a plain boolean (prop,
   loader, or a `publicProcedure` that returns the evaluated set). The provider token never
   crosses to the client. See `references/edge-evaluation.md`.

7. **Record the flag's lifecycle and schedule its removal (low cost).** A flag is debt: a live
   branch in the code and a config entry. Note its sunset condition in the registry and log the
   rollout decision in `DECISIONS.md`; remove the flag and the dead branch once it reaches 100%
   or is retired. See `references/rollout-patterns.md`.

---

## Composes With
- **Pairs with:** `deploy-edge` — a flag decouples release from deploy; ship the build dark via
  `deploy-edge`, then flip the flag without a rebuild.
- **Consumes:** `env-validation` — the flag-source token/URL enters through the Zod env schema
  (Rule 8); `edge-runtime-constraints` — confirms the chosen source is edge-safe.
- **Runs against:** `rule-audit` (typed lookups, fail-safe default, no client secret),
  `security-pass` (the targeting/override surface as an abuse case).
- **Hands off:** experiment design, metric selection, and significance testing to
  `optimization-loop`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked to put a beta feature behind a flag with an allowlist, percentage
rollout, and a kill switch, the agent produced a `lib/feature-flags.ts` that reads everything
from `NEXT_PUBLIC_*` env vars and gates with a single shared helper evaluated on both client and
server. The kill switch and rollout are env-only — flipping either requires a redeploy, so it is
not a runtime toggle at all — and the `NEXT_PUBLIC_` prefix ships the user-ID allowlist and
rollout config into the client bundle, where the gate is also bypassable (the server tRPC check
was left as a comment, not wired). Env inputs were read raw with no Zod parse or bounds, and
bucketing used a hand-rolled non-cryptographic hash.

```ts
export const BETA_ENABLED = process.env.NEXT_PUBLIC_BETA_ENABLED !== "false";
const BETA_USER_IDS = (process.env.NEXT_PUBLIC_BETA_USER_IDS ?? "").split(",")...
const BETA_ROLLOUT_PCT = Number(process.env.NEXT_PUBLIC_BETA_ROLLOUT_PCT ?? "0");
```

**Failure class (confirmed).** Flags read from `NEXT_PUBLIC_*` env are deploy-time, not runtime:
the kill switch can't kill without a redeploy, and the prefix leaks the allowlist and rollout
config (Rule 9) while making the gate client-bypassable. Without a typed registry, a fail-safe
Zod-parsed source read (Rule 8), and a single server-side evaluation handing the client only a
resolved boolean, the flag breaks the spine the moment it leaves `next dev`.

---

## Examples

**Input:** "Put the new checkout flow behind a flag and roll it out to 10%."
**Output:** Adds `"checkout-v2": { default: false, owner, createdAt, sunset: "remove at 100%" }`
to the registry. Evaluation reads Edge Config, Zod-parses, defaults to `false` on any error.
Bucketing: `sha256("checkout-v2:" + userId) % 100 < 10`. The RSC renders v2 or v1 from the
resolved boolean; the client never sees the Edge Config token. Logs the rollout in `DECISIONS.md`.

**Input:** "We need a kill switch on the AI summarizer in case it melts down."
**Output:** Adds `"ai-summarizer": { default: true }` where the *safe* fallback is the
non-AI path; flipping the Edge Config value to `false` disables it instantly with no deploy. The
read fails safe — a store outage resolves to the default and the summarizer keeps its normal
behavior — and the flip is auditable. Pairs with `deploy-edge` only if a code change ships too.

**Input:** "Show the beta dashboard to our internal team only."
**Output:** Targeting override before rollout: an allow-list of Clerk org/user IDs checked
server-side in the tRPC procedure, scoped to `ctx.auth.userId` (Rule 2). Returns the resolved
boolean to the client; the list and its precedence live in `references/rollout-patterns.md`.

## Edge Cases
- **Flag needed in `middleware.ts`** → middleware is always edge; evaluate with the Web-API
  reader only, never a Node SDK, and keep `clerkMiddleware` edge-pure (see `edge-runtime-constraints`).
- **Anonymous user, no `userId` to bucket on** → bucket on a stable anonymous id (a signed
  cookie / device id), never per-request random; document the fallback in the rollout reference.
- **Flag must be readable before hydration in a Client Component** → resolve it server-side and
  pass it as a prop or via a `publicProcedure`; do not ship the provider token to evaluate client-side.
- **Two flags interact (one gates the other)** → resolve precedence explicitly in the registry/
  evaluator; never let evaluation order be incidental. A flag is not an experiment — hand
  interaction analysis to `optimization-loop`.

---

## References
- `references/edge-evaluation.md` — the typed flag registry, edge-safe source choice (Edge
  Config vs HTTP KV), the fail-safe Zod-parsed `evaluate()` function, and the server-side →
  client boolean handoff.
- `references/rollout-patterns.md` — deterministic Web-Crypto bucketing, percentage rollout,
  canary/targeting allow-lists, override precedence, kill-switch semantics, and flag lifecycle/cleanup.

## Scripts
`scripts/` reserved. A scanner that flags `Math.random()` inside an evaluation path, bare
`process.env.FEATURE_*` toggles, and any `NEXT_PUBLIC_*` matching the flag-provider token would
justify one once the registry shape stabilizes across projects. Empty for now.
