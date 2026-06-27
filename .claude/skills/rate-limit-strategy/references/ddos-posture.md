Purpose: the layered DDoS / abuse model — platform edge / WAF vs the app-layer limiter vs a circuit-breaker — what each layer catches, and why the in-function Upstash limiter is not volumetric DDoS defense.

# DDoS posture

The most common rate-limit mistake is believing the application-layer limiter *is* the DDoS
defense. It is not. Knowing what each layer catches — and where the request is when it is
caught — is the whole posture.

## Where the request is when each layer acts

```
client ──▶ [1] platform edge / CDN / WAF ──▶ [2] your edge function ──▶ [3] app-layer limiter
            (before your code runs)            (your code, billed)        (ratelimit.limit())
```

The critical fact: the Upstash limiter at **[3] runs inside your function**. By the time
`ratelimit.limit()` executes, the request has already reached your code, consumed an
invocation, and started billing. So [3] cannot defend against *volume* — it can only enforce
*fairness per identity* once volume is already through.

## The three layers

### Layer 1 — platform edge / WAF / CDN (volumetric + crude L7)

This is your actual DDoS defense, and it sits *before* your function:

- **Volumetric / L3–L4 floods** (SYN floods, UDP amplification) — absorbed by the platform's
  network, never reaching application code.
- **Crude L7 floods** (a million identical GETs) — blocked by the CDN/WAF via IP reputation,
  geo/ASN rules, challenge pages, and per-edge rate rules that run before billing.

Configure this at the platform (Cloudflare, Vercel, the CDN in front). Record which
edge-protection features are enabled in `DECISIONS.md` — it is part of the security posture,
even though it lives outside the codebase.

### Layer 2 — the app-layer limiter (per-identity abuse + fairness)

This is what this suite's `trpc-middleware` limiter does: enforce the per-tier caps from
`endpoint-tiers.md` against a real identity (userId / composite). It catches the abuse that
*looks legitimate* — one authenticated user scraping, one botnet account hammering login —
that the edge cannot distinguish from real traffic. It is fairness and abuse control, not
volume control.

### Layer 3 — a global circuit-breaker (last resort)

A coarse, global cap (total requests/sec across the app, or per-tenant) that trips a
fail-fast/shed-load mode when tripped. It is the backstop for when an attack slips past Layer 1
and would otherwise exhaust your function concurrency or downstream DB. Pair it with the
`spend-cap` so a sustained attack cannot run an unbounded bill.

## Stating the posture honestly

When asked "are we protected against DDoS," answer in layers, and do **not** claim the
app-layer limiter covers volume:

1. Volumetric / crude floods → Layer 1 (platform edge / WAF), before our code.
2. Per-identity abuse / credential-stuffing → Layer 2 (the app-layer limiter + auth tier).
3. Catastrophic overload backstop → Layer 3 (circuit-breaker + spend cap).

If Layer 1 is not configured, the honest answer is "not yet" — the limiter alone leaves you
paying for every flood request it rejects. Record the posture and any gaps in `DECISIONS.md`
and route the threat-model questions to `security-pass`.
