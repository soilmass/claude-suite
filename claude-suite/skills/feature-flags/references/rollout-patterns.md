Purpose: deterministic bucketing, gradual rollout, canary/targeting, override precedence, kill-switch semantics, and the flag lifecycle — the behavior layer of feature-flags.

# Deterministic bucketing (the core of a stable rollout)

A rollout percentage must map a user to the SAME answer on every request. Per-request
randomness (`Math.random()`) re-buckets the user constantly — the UI flickers and analytics
are meaningless. Bucket by hashing `flagKey + stableId` with Web Crypto (`crypto.subtle` is
edge-native; no `node:crypto`).

```ts
// src/flags/rollout.ts
// Stable 0..99 bucket for (flag, user). Same inputs -> same bucket, forever.
async function bucketOf(flagKey: string, id: string): Promise<number> {
  const data = new TextEncoder().encode(`${flagKey}:${id}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new DataView(digest).getUint32(0) % 100;
}

export async function isInRollout(
  flagKey: string,
  id: string,
  percent: number,
): Promise<boolean> {
  if (percent <= 0) return false;
  if (percent >= 100) return true;
  return (await bucketOf(flagKey, id)) < percent;
}
```

Why include `flagKey` in the hash: it decorrelates flags. Without it, the same users always
land in the low buckets and would be in *every* low-percentage rollout at once.

Gradual rollout is then just raising the stored `rollout` number over time: 1 → 10 → 50 → 100.
Because bucketing is monotonic for a fixed flag key, raising the percentage only ever *adds*
users to the cohort — nobody who saw the feature loses it on the next bump.

# Canary / targeting

Two shapes, both resolved server-side before the percentage gate (see precedence below):

- **Allow-list canary** — explicit Clerk `userId`/`orgId`s (internal team, design partners) in
  the stored `allow` array. Checked against `ctx.auth.userId`.
- **Attribute targeting** — plan tier, tenant, region. Pull the attribute from the verified
  Clerk session or the tenant row (scoped to `ctx.auth.userId`, Rule 2), never from a
  client-supplied value.

```ts
// targeting attributes come from the trusted server context, not client input
if (cfg.allow?.includes(ctx.userId ?? "")) return true;
```

# Override precedence (resolve in one fixed order)

Evaluation order is decided, not incidental:

1. **Global kill switch** — `enabled === false` short-circuits everything. Nothing overrides a kill.
2. **Forced on** — `enabled === true` (e.g. a fully-launched flag pending cleanup).
3. **Targeting** — allow-list / attribute match.
4. **Percentage rollout** — deterministic bucket.
5. **Registry default** — the fail-safe value when none of the above apply or the store is unreachable.

This is implemented once in `evaluate()` (see `edge-evaluation.md`); never re-derive precedence
per call site.

# Kill-switch semantics

A kill switch is a flag whose **default is the safe state**, so it survives a store outage:

- Release toggle (`checkout-v2`): default `false` → an outage shows the old, known-good path.
- Feature with a risky dependency (`ai-summarizer`): default `true` where `true` means "the
  pre-AI behavior" → flipping the stored `enabled` to `false` instantly disables the AI path
  with no deploy, and an outage also leaves it in the safe behavior.

The flip itself is a config write (Edge Config / KV), not a code change — that is the whole
point: instant, deploy-free, auditable. If a kill *also* needs code reverted, pair with
`deploy-edge`.

# Anonymous users

No Clerk `userId` to bucket on → bucket on a stable anonymous id: a signed cookie or device
id minted once and reused. Never fall back to per-request random for anonymous traffic, or the
anonymous cohort flickers. Document the chosen anonymous id source in `DECISIONS.md`.

# Flag lifecycle — a flag is debt

Every flag is a live branch in the code plus a config entry. Track and retire them:

- The registry entry carries `owner`, `createdAt`, and a `sunset` condition.
- Log each rollout decision (when bumped, to what %) in `DECISIONS.md`.
- At 100% (or retirement): delete the flag from the registry, remove the dead branch, and
  delete the config entry — in that order, so a stray read can't resurrect it.
- A permanent kill switch is the exception: its `sunset` says "keep" and it stays.

Stale flags rot: a year-old `checkout-v1` branch nobody removed is a maintenance and security
liability. Removal is part of the rollout, not optional cleanup.

# Hands off

A flag answers "is this on for this user?" It does NOT answer "did the feature improve the
metric?" Experiment design, metric selection, and significance testing belong to
`optimization-loop`; this skill only delivers the deterministic, stable cohort it measures.
