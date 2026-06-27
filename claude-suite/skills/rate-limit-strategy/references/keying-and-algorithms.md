Purpose: how to choose the rate-limit key (per-user vs per-IP vs composite, all validated per Rule 8) and the algorithm/window (sliding-window vs token-bucket vs fixed-window).

# Keying and algorithms

Two decisions, made per tier: *what string do you count against*, and *how does the counter
behave over time*. Both are configured into `trpc-middleware`'s limiter — this file is the
reasoning, not the wiring.

## Part 1 — the key

The key is the identity the limit is enforced against. Pick it wrong and you either throttle a
crowd that shares an identity or let an attacker rotate past the limit.

### Protected routes → `ctx.auth.userId`

After the auth gate has narrowed `ctx.auth.userId` to `string` (Rule 2's foundation, built in
`trpc-middleware`), key on it. Add `:path` for a *per-endpoint* budget so one hot endpoint
does not consume a user's whole allowance:

```ts
await ratelimit.limit(`${ctx.auth.userId}:${path}`);
```

Never key a protected route on IP — a user behind a roaming connection would be limited
incoherently, and an attacker with a stolen session would not be limited per-account at all.

### Public routes → a validated IP, best-effort

No userId exists, so key on the client IP — but the IP is a **spoofable boundary** (Rule 8).
Parse it from a trusted, platform-provided header and validate the shape before using it:

```ts
const ip = z.string().ip().catch("anon").parse(ctx.headers.get("x-real-ip"));
```

Treat this as best-effort fairness, not authentication — `x-forwarded-for` is attacker-set;
only the platform's own injected header (e.g. `x-real-ip` on the edge host) is trustworthy.
Document the chosen header in `DECISIONS.md`.

### Auth / pre-auth routes → a validated composite

This is the case the naive approach gets wrong. At sign-in there is no userId, and IP alone
is defeated by a botnet spreading guesses across thousands of IPs (credential stuffing). Key
on **both** axes so each is independently capped:

```ts
const ip = z.string().ip().catch("anon").parse(ctx.headers.get("x-real-ip"));
const idHash = sha256(submittedEmail.toLowerCase().trim()); // never store/log the raw email
// Two SEPARATE limiters with DIFFERENT caps: the IP axis (stops one host hammering many
// accounts) runs a more generous cap; the identifier axis (stops a botnet hammering one
// account from many hosts) runs a strict cap.
const perIp = await authIpLimiter.limit(`auth:ip:${ip}`);      // e.g. 30 / 5m
const perId = await authIdLimiter.limit(`auth:id:${idHash}`);  // e.g. 5 / 15m
```

Both must pass. They are distinct limiter instances because the axes carry different caps — a
shared NAT legitimately produces many IP-axis attempts, while a single account should tolerate
very few. The submitted identifier is hashed so the limiter key (and any log of it) never
carries a raw email (Rules 8, 9). See `auth-endpoint-protection.md` for the backoff on top.

## Part 2 — the algorithm

`@upstash/ratelimit` offers fixed-window, sliding-window, and token-bucket. The choice is
about *burst behavior over the window boundary*.

### Sliding-window — the default

Counts over a rolling window, so it has no fixed-window boundary burst. Smooth and predictable;
use it for reads, mutations, and auth unless a reason below applies.

```ts
Ratelimit.slidingWindow(20, "1m"); // 20 per rolling minute
```

### Token-bucket — for bursty-but-bounded traffic

A bucket of `N` tokens refilling at `R`/interval. Allows a short legitimate burst (a page that
fires several requests, a batch import) while capping the *sustained* rate. Use it for
expensive/AI/export tiers and any endpoint with legitimate spikes.

```ts
Ratelimit.tokenBucket(5, "1m", 10); // refill 5/min, burst capacity 10
```

### Fixed-window — narrow use only

Cheapest, but a caller can fire the full limit at the end of one window and again at the start
of the next — up to 2× the intended rate across the boundary. Only acceptable where that burst
is harmless (e.g. a coarse, generous public cap). Never use it for the auth tier.

## Choosing, in one pass

1. Bursty legitimate traffic (imports, multi-request page loads, expensive batch)? →
   token-bucket with an explicit burst capacity.
2. Otherwise → sliding-window.
3. Fixed-window only when you can state why a boundary burst is acceptable, and record it.

Record any non-default algorithm choice and its window/burst sizing in `DECISIONS.md`.
