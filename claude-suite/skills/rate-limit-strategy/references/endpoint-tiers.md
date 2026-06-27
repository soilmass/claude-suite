Purpose: the endpoint tier taxonomy (cost × sensitivity), example caps per tier, and the fail-open vs fail-closed decision each tier carries.

# Endpoint tiers

Rate limiting is not one number — it is a *table*. Every procedure belongs to a tier, and the
tier fixes its cap, its key, its algorithm, and its failure mode. The wiring (the limiter, the
`rateLimitedProcedure` builder) is `trpc-middleware`'s; this file decides what goes in the
table the wiring reads.

## The five tiers

Tier by two axes: **cost** (compute/$, downstream load) and **sensitivity** (what abuse
buys an attacker). The product sorts almost every endpoint cleanly.

| Tier | Examples | Key | Algorithm | Example cap | Failure mode |
|------|----------|-----|-----------|-------------|--------------|
| Public read | marketing data, public listings | validated IP (best-effort) | sliding-window | 60 / min | fail-open |
| Authenticated read | dashboard, list views | `userId` | sliding-window | 120 / min | fail-open |
| Mutation / write | create/update/delete | `userId:path` | sliding-window | 20 / min | fail-closed |
| Auth / credential | sign-in, sign-up, reset, OTP | composite (IP + identifier) | sliding-window + progressive backoff | 5 / 15 min | **fail-closed** |
| Expensive / AI / export | LLM calls, CSV export, search | `userId` (or `userId:path`) | token-bucket | burst 10, refill 5 / min | fail-closed |

The numbers are starting points, not law — calibrate against real p95 legitimate usage and
record the chosen table in `DECISIONS.md`. The *structure* (distinct tiers, distinct keys,
distinct failure modes) is the non-negotiable part.

## Why per-tier and not one global limit

A single global cap is set by whichever endpoint screams loudest:

- Set it for reads (say 120/min) and an attacker gets 120 password guesses a minute — a
  trivial brute-force window.
- Set it for auth (say 5/min) and your own dashboard, which fires a dozen queries on load,
  throttles a legitimate user on their second page.

The two requirements are *contradictory*, which is the proof they belong in different tiers.

## Fail-open vs fail-closed (per tier)

When the limiter store (Upstash/Redis) is unreachable, `ratelimit.limit()` throws or times
out. You must have *already decided* what happens — silence is a defect (see the SKILL's
fourth Non-Negotiable Rule).

- **Fail-closed** (deny on limiter error): auth, mutations, expensive endpoints. A short
  outage that briefly rejects writes is far cheaper than an open, *unmetered* brute-force or
  cost-amplification window. Return `503`/`TOO_MANY_REQUESTS` and alert.
- **Fail-open** (allow on limiter error): low-risk public/authenticated reads, where blocking
  legitimate reads during a Redis blip is the bigger harm. Allow, but **emit an alert** so a
  prolonged fail-open is visible — never a silent `catch { /* allow */ }`.

Record the per-tier failure mode in `DECISIONS.md`; it is a security posture choice, not an
implementation detail. The limiter env (`UPSTASH_REDIS_REST_URL/TOKEN`) is Zod-validated and
server-only over in `trpc-middleware` (Rules 8, 9) — this file only decides behavior on a miss.

## Mapping a procedure to its tier

1. Is it pre-auth (no `userId` yet)? → Auth/credential tier (always, even a "read" like
   "does this email exist").
2. Does it cost real money per call (LLM, export, third-party API)? → Expensive tier.
3. Does it mutate? → Mutation tier.
4. Otherwise it is a read; public or authenticated by whether `protectedProcedure` gates it.

Record any endpoint whose tier is non-obvious (e.g. a read that triggers an expensive
recompute) in `DECISIONS.md` with the reasoning.
