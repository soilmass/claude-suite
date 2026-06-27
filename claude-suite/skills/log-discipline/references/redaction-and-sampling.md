Purpose: the allowlist redactor, the head-based level-aware sampler, the never-log checklist, and why each log line costs money at the edge.

# Redaction and sampling

These two controls are what separate a disciplined log from a liability. Redaction keeps PII
and secrets out (Rule 9). Sampling keeps the volume — and therefore the bill — bounded.

## 1. Allowlist redaction (not denylist)

A denylist ("strip `password`, `token`") fails the moment a new sensitive field appears. Use
an **allowlist**: only known-safe scalar keys survive; everything else is dropped. Truncate
strings so a single field can never balloon a line.

```ts
// src/lib/log/redact.ts
import type { LogContext } from "./fields";

// The ONLY ctx keys allowed into the drain. Record this set in DECISIONS.md.
const ALLOWED = new Set([
  "orderId", "userId" /* hashed/opaque, never raw */, "route", "method",
  "status", "ms", "code", "count", "totalCents", "jobRunId", "type", "id",
]);

const MAX_STR = 256;

export function redact(ctx: LogContext): LogContext {
  const out: LogContext = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (!ALLOWED.has(k)) continue;                 // not allowlisted: drop silently
    if (typeof v === "string") {
      out[k] = v.length > MAX_STR ? v.slice(0, MAX_STR) + "…" : v;
    } else {
      out[k] = v;                                  // number | boolean | null pass as-is
    }
  }
  return out;
}

// Identify users without exposing them. NEVER log raw email/name/userId.
// Edge runtime has no `node:crypto` — use Web Crypto (`crypto.subtle`), a Web-standard
// global available at the edge. Hashing is async; await it (or precompute once per request).
import { env } from "~/env";
export async function hashUserId(id: string): Promise<string> {
  const data = new TextEncoder().encode(id + env.LOG_SALT);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}
```

The redactor only accepts scalars by type, so a stray object/array (a row, a body) cannot be
logged even if its key were allowlisted — the type system and the redactor both refuse it.

## 2. The never-log checklist (Rule 9 + cost)

Never put any of these into a log line, at any level:

- Request bodies, response bodies, form payloads, webhook payloads (raw).
- Full rows / `$inferSelect` objects, whole `input` objects, whole `req`/`Request`.
- Email, name, phone, address, IP-as-identity, or any direct identifier — hash or omit.
- `Authorization` headers, cookies, the Clerk session/JWT, the raw `ctx.auth` object.
- API keys, DB URLs, signing secrets, any `process.env.*` secret value.
- High-cardinality blobs: full URLs with query strings, stack traces (those go to Sentry).

If you think you need one of these to debug, gate it behind `debug` + redaction + sampling so
it is off in prod and bounded when on.

## 3. Level-aware head sampling

Keep every line that signals a problem; thin the routine chatter. Sampling is **head-based on
the trace id** so that if a request is sampled in, *all* of its lines are kept — you get a
coherent trace, not random orphan lines.

```ts
// src/lib/log/sample.ts
import { env } from "~/env";
import type { LogLevel } from "./fields";

const RATE: Partial<Record<LogLevel, number>> = {
  trace: env.LOG_SAMPLE_DEBUG,
  debug: env.LOG_SAMPLE_DEBUG,
  info: env.LOG_SAMPLE_INFO,
  // warn/error/fatal intentionally absent → always kept (rate 1).
};

// Deterministic per-trace decision: same traceId → same keep/drop across the request.
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = (h ^ s.charCodeAt(i)) * 16777619;
  return ((h >>> 0) % 10000) / 10000; // 0..1
}

export function keep(level: LogLevel, traceId?: string): boolean {
  const rate = RATE[level];
  if (rate === undefined) return true;             // warn+ always kept
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  return hash01(traceId ?? Math.random().toString()) < rate;
}
```

Tuning: start prod at `info` 5%, `debug` 0% (off). Raise `info` only if a specific
investigation needs more, then lower it again. `warn`/`error` are never sampled — you must see
every failure. Coordinate the rate with `spend-cap`: sampling is the lever, the cap is the
ceiling.

## 4. Why each line costs money at the edge

Edge platforms bill log ingest by volume (lines × bytes), often separately from compute. At
p99 traffic, an unsampled `info` line per request scales 1:1 with requests, and a body-dump
multiplies bytes per line. This is why `../../CLAUDE.md` names indiscriminate logging the top
edge cost driver. The math that bounds it:

> cost ≈ requests/day × lines/request × sample_rate × avg_bytes/line

Every factor is something this skill controls: fewer lines (boundaries, not loops — Rule 7),
lower sample rate, smaller lines (scalar `ctx`, truncated strings, no bodies). Halving any one
roughly halves the bill.

## 5. Quick audit when cost spikes

1. Group the drain by `event`; the top one or two events are almost always the culprit.
2. Is it logging a body or a per-row line? Fix the call site first (biggest win).
3. Is it at `info` when it should be `debug`? Re-level it.
4. Still high? Lower that level's sample rate via env — no deploy needed.
5. Confirm no PII slipped through with `secret-scan` / `security-pass` over the diff.
