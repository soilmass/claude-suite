---
name: rate-limit-strategy
description: >
  Decide the rate-limiting *strategy* over the edge stack's existing rate-limit mechanism:
  which limit applies to which endpoint (cost/sensitivity tiers), whether to key per-user or
  per-IP or a composite, sliding-window vs token-bucket vs fixed-window and client backoff,
  hardening auth endpoints against brute-force and credential-stuffing, the fail-open vs
  fail-closed call when the limiter store is down, and a layered DDoS posture — all configured
  through `trpc-middleware`'s Upstash limiter, never re-wired here.
  Use when: "rate limit strategy", "which endpoints to limit", "protect login from brute force",
  "per-user vs per-IP limit", "ddos protection", "credential stuffing".
  Do NOT use for: wiring the rate-limit middleware / Upstash client / rateLimitedProcedure
  builder (use trpc-middleware), wiring sign-in/webhooks (use clerk-auth-flows), or the
  per-row ownership check (use vertical-slice).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Baseline observed 2026-06-26: a capable base model already tiers,
    dual-keys login, uses sliding-window, and refuses to call the limiter DDoS defense, so the
    confirmed (narrowed) failure class is the residue — a flat lockout instead of progressive
    backoff, no fail-open/closed decision for a limiter-store outage, and an unvalidated IP key
    (Rule 8). This skill targets exactly those gaps.
---

# rate-limit-strategy

The strategy layer above the rate-limit *mechanism*. `trpc-middleware` already builds the
edge-compatible Upstash limiter and the `rateLimitedProcedure` builder; this skill decides
*which limits go where and why* — the per-endpoint tiers, the key (user vs IP vs composite),
the algorithm and window, the hardening auth endpoints need against brute-force and
credential-stuffing, the fail-open/fail-closed call, and where a real DDoS is actually
absorbed. A single global limit demos fine, then throttles legitimate readers or leaves login
wide open to a credential-stuffing botnet.

The spine and nine inviolable rules live in `../../CLAUDE.md`; this skill leans on Rule 8 (the
IP/identifier you key on is a validated boundary, never raw), Rule 2 (protected-route identity
is `ctx.auth.userId`), and Rule 9 (the Upstash token is server-only). It never re-documents the
middleware wiring — that is `trpc-middleware`.

---

## Non-Negotiable Rules

A wrong rate-limit strategy fails in one of two invisible directions — too tight (legit users
blocked) or too loose (abuse sails through) — and both demo fine:

- **Never apply one global limit to every endpoint.** Tier by cost × sensitivity: a public
  read, an authenticated write, a login attempt, and an expensive export need different caps —
  one number is simultaneously too loose for auth and too tight for reads.
- **Never key an auth endpoint on `ctx.auth.userId`, and never on IP alone.** Sign-in, reset,
  and OTP run *before* identity exists (no userId to key on), and IP alone is bypassed by a
  distributed credential-stuffing botnet. Use a validated composite (IP + submitted identifier)
  with progressive backoff.
- **Never treat the application-layer limiter as DDoS defense.** `ratelimit.limit()` runs
  *inside* your edge function, after the request arrived and on your dime — per-identity
  fairness, not volume control. Volumetric and crude L7 floods are absorbed at the platform
  edge / WAF *before* your code.
- **Never fail silently when the limiter store is unreachable.** Decide per tier — auth and
  mutations fail *closed* (deny), low-risk reads fail *open* (allow + alert) — and record it.
  A silent fail-open turns a Redis outage into an open door on your riskiest routes.

Refuse these rationalizations: "one limit for the whole API is simpler"; "login is just
another mutation, key it on the user"; "Upstash will absorb a DDoS"; "if the store is down
just let everything through, it's only rate limiting."

---

## When to Use

- Deciding which limit (and key, and algorithm) applies to which endpoint across the API.
- Hardening login / signup / password-reset / OTP against brute-force or credential-stuffing.
- Setting an abuse + DDoS posture for an edge deployment (what each defensive layer catches).
- Choosing sliding-window vs token-bucket vs fixed-window and the client backoff contract.

## When NOT to Use

- Wiring the rate-limit middleware, the Upstash client, or composing `rateLimitedProcedure`
  → `trpc-middleware` owns the mechanism this skill configures.
- Standing up `clerkMiddleware`, sign-in pages, or webhooks → `clerk-auth-flows` (this skill
  hardens the auth surface it wires, it does not build it).
- The per-row ownership check inside a procedure (Rule 2) → `vertical-slice`.
- Threat-modeling the whole feature, header verification, dependency scan → `security-pass`.
- Logging limit events (structured, sampled, PII-safe) → `log-discipline`.

---

## Procedure

1. **Inventory and tier every endpoint by cost × sensitivity (medium — the tiering *is* the
   strategy).** Public reads (generous), authenticated reads, mutations (tighter),
   auth/credential (strict + backoff), expensive/AI/export (very tight, burst-bounded).
   Produce the tier table and record it in `DECISIONS.md`. See `references/endpoint-tiers.md`.
2. **Choose the key per tier (high — the wrong key is a DoS hole or an open door).** Protected
   routes key on `ctx.auth.userId` (+`:path` for per-endpoint budgets); auth/pre-auth on a
   validated **composite** (IP + submitted-identifier hash); public on a validated IP only,
   best-effort. Validate every IP/identifier boundary (Rule 8). See `references/keying-and-algorithms.md`.
3. **Choose the algorithm and window per tier (medium).** Default **sliding-window** (no
   boundary burst); **token-bucket** for bursty-but-bounded traffic (expensive APIs, imports);
   fixed-window only where a boundary burst is acceptable. See `references/keying-and-algorithms.md`.
4. **Harden auth endpoints against brute-force and credential-stuffing (high — highest cost of
   wrong).** Composite key, low caps, **progressive backoff** (escalating lockout per
   consecutive failure), failures vs successes counted differently (a correct login resets),
   an enumeration-safe response, and a CAPTCHA/step-up hook — layered *on top of*
   `clerk-auth-flows`. See `references/auth-endpoint-protection.md`.
5. **Decide the failure mode per tier and record it (high).** Store unreachable → auth and
   mutations fail **closed** (a brief outage beats an open brute-force window), low-risk reads
   fail **open** (allow + alert). Never silent; record it in `DECISIONS.md`. See
   `references/endpoint-tiers.md`.
6. **Set the DDoS / abuse posture as explicit layers (medium).** Platform edge / WAF / CDN
   absorbs volumetric + crude L7 floods *before* your function; the Upstash limiter enforces
   per-identity fairness; a global circuit-breaker is the backstop. Record the edge protection
   in `DECISIONS.md`. See `references/ddos-posture.md`.
7. **Signal limits honestly and hand the wiring back (low).** On deny return
   `TOO_MANY_REQUESTS` with `Retry-After` / reset and `RateLimit-*` headers (client backs off
   exponentially); keep auth responses uniform so a 429 never reveals account existence. Then
   hand the tier table to `trpc-middleware` to configure the limiter.

---

## Composes With

- **Builds on:** `trpc-middleware` — it owns the mechanism (the Upstash limiter, the
  `rateLimitedProcedure` builder, the Zod-validated env); this skill decides the tiers, keys,
  algorithms, and failure modes it is configured with, never re-wiring the middleware.
- **Layers on:** `clerk-auth-flows` — the brute-force/credential-stuffing hardening wraps the
  sign-in / password-reset surface that skill wires; it does not stand up auth itself.
- **Pairs with:** `security-pass` (the threat model that justifies the tiers and DDoS posture),
  `log-discipline` (limit-event logging — structured, sampled, no PII).
- **Hands off:** the limiter wiring → `trpc-middleware`; the tier table, failure modes, and
  edge-protection posture → `DECISIONS.md`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose edge-stack dev told to
> design + implement rate limiting for the tRPC API and login, no project conventions). The
> imagined catastrophe — one global limit, login keyed on userId/IP alone, fixed-window
> bursts, the limiter sold as DDoS defense — did **not** occur. A capable base model is well
> past that. A **narrower** failure class was confirmed.

**Observed run.** The agent produced a genuinely strong design: three tiers (IP/public,
per-user, sensitive-action) plus a **dedicated login tier dual-keyed on `ip+identifier` and a
second IP-wide axis**, sliding-window throughout, token-bucket for expensive mutations,
enumeration-safe errors, `Retry-After`, failure-metering with refund-on-success, and a correct
layered answer that the app-layer limiter is **not** DDoS defense (edge/WAF + spend cap). Three
of this skill's load-bearing disciplines were still missing:

```ts
login: new Ratelimit({ limiter: Ratelimit.slidingWindow(5, "300 s") }), // flat, no escalation
await ratelimiters.loginByIp.limit(getClientIp(headers)); // no try/catch: store down → throws/500
function getClientIp(h){ return h.get("x-forwarded-for")?.split(",")[0] ?? "0.0.0.0"; } // unvalidated
```

The lockout is **flat** (a constant 5 / 5 min), so an attacker still grinds ~1 guess/min per
account forever — no **progressive backoff** escalating per consecutive failure. The design
**never considers the limiter store being unreachable**, so an Upstash outage throws on the
very auth path that most needs to **fail closed**. And the keyed IP is read from raw headers
with a `"0.0.0.0"` fallback, never `z.string().ip()`-validated (Rule 8) — the spoofing risk is
flagged in prose but not closed in code.

**Failure class (confirmed, narrowed).** Not "produces one naive global limiter" — "produces a
strong tiered, dual-keyed strategy and then leaves three gaps that only bite under attack or
outage": a flat lockout instead of progressive backoff, no fail-open/closed decision for a
limiter-store outage, and an unvalidated IP key. This skill adds exactly those — progressive
backoff (`auth-endpoint-protection.md`), the per-tier failure-mode call (`endpoint-tiers.md`),
and Rule 8 IP validation (`keying-and-algorithms.md`).

---

## Examples

**Input:** "Rate limit our tRPC API."
**Output:** A tier table, not one number: public reads `slidingWindow(60, "1m")` IP-keyed; auth
reads `slidingWindow(120, "1m")` on `userId`; mutations `slidingWindow(20, "1m")` on
`userId:path`; export/AI `tokenBucket(5, "1m", 10)`. Reads fail-open, mutations fail-closed.
Hands the table to `trpc-middleware`; records tiers + failure modes in `DECISIONS.md`.

**Input:** "Protect our login from brute force."
**Output:** A dedicated auth tier keyed on a validated composite (IP + sha-256 of the submitted
email), low cap (5 / 15 min) with **progressive backoff** escalating per consecutive failure
and resetting on success, a uniform enumeration-safe error, a step-up/CAPTCHA hook past a
threshold, and **fail-closed** if the store is down. Layered on the `clerk-auth-flows` sign-in
surface.

**Input:** "Are we protected against DDoS?"
**Output:** Separates the layers: the platform edge / WAF absorbs volumetric and crude L7
floods before the function runs; the Upstash limiter handles per-identity abuse; a global
circuit-breaker is the backstop. States plainly that `ratelimit.limit()` is *not* volumetric
DDoS defense (it runs and bills after arrival), and records the edge posture in `DECISIONS.md`.

---

## Edge Cases

- **A pre-auth endpoint has no `userId` to key on** → key on a validated composite (IP +
  submitted identifier); never assume a userId — that is the auth tier, not a protected route.
- **Shared NAT / corporate proxy makes IP-keying lock out a whole office** → raise the IP cap,
  prefer identifier/account keys once authenticated, never let one egress IP hard-lock everyone.
- **A legitimate burst trips the limit** (batch import, webhook fan-in) → give that route a
  token-bucket with an explicit burst allowance or an allow-listed service key — do not raise
  the global limit.
- **A client hammers retries on `429`** → return `Retry-After` and require exponential backoff;
  a tight retry loop amplifies load and is itself the abuse the limiter must absorb.

---

## References

- `references/endpoint-tiers.md` — the tier taxonomy (public read / auth read / mutation /
  auth-credential / expensive), example caps, and the fail-open vs fail-closed call per tier.
- `references/keying-and-algorithms.md` — per-user vs per-IP vs composite keying with Rule 8
  boundary validation, and sliding-window vs token-bucket vs fixed-window selection + sizing.
- `references/auth-endpoint-protection.md` — brute-force / credential-stuffing defense:
  composite keying, progressive backoff, success-vs-failure counting, enumeration-safe
  responses, and CAPTCHA / step-up escalation, layered over `clerk-auth-flows`.
- `references/ddos-posture.md` — the layered model (platform edge / WAF vs app-layer limiter vs
  circuit-breaker), what each catches, and why the in-function limiter is not DDoS defense.

## Scripts

- Reserved (`scripts/.gitkeep`). A script would be justified if a mechanical check could flag
  an auth-named procedure (`signIn`/`login`/`reset`/`verify`/`otp`) not built on a rate-limited
  variant with backoff, or a limiter keyed on a raw (unvalidated) header on a protected route —
  both AST-detectable. Until then the tier/keying judgment stays a `security-pass` + `rule-audit`
  (Rule 8) concern.
