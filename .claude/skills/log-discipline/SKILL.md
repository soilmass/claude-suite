---
name: log-discipline
description: >
  Establish application logging on the edge stack that is structured (JSON to the platform
  drain), leveled (a single env-validated minimum level), and sampled (keep all warn/error,
  thin out info/debug) — and that never emits a request/response body or PII. Covers the
  edge-safe JSON logger, the canonical field schema, env-validated LOG_LEVEL and sample
  rates, the redaction allowlist, trace-id correlation, and replacing scattered `console.*`.
  Use when: "logging", "structured logs", "log levels", "too many logs", "logging cost".
  Do NOT use for: tracing/metrics instrumentation — spans, OTel, Sentry setup
  (use observability-setup); setting the project spend cap (use spend-cap).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the indiscriminate-logging failure class: unleveled,
    unsampled `console.log` of full request bodies and PII that becomes the top edge-cost
    line item. Baseline section is the encoded failure class; replace with an observed
    transcript.
---

# log-discipline

Makes logs a deliberate, bounded signal instead of an unmetered firehose. On the edge runtime
every line is ingested and billed by the platform drain, so indiscriminate logging is the top
edge cost driver (see `../../CLAUDE.md` → Observability & cost). This skill produces a
structured, leveled, sampled logger plus a redaction discipline so the logs you keep are
searchable, cheap, and free of PII. It leans hardest on Rule 9 (no secrets/PII in output),
Rule 8 (level and sample rates are Zod-validated env), Rule 6 (UTC), and Rule 7 (no logging
inside per-row loops).

---

## Non-Negotiable Rules

Logging defects ship invisibly: the code compiles, the logs look helpful in dev, and the bill
plus the PII exposure only surface in production. Hard lines:

- **Never log a request body, response body, or full row.** A stable event name plus a few
  scalar fields only. Bodies are unbounded, contain PII, and are the largest ingest cost
  (Rule 9).
- **Never log PII or secrets.** No email, name, address, token, API key, full headers, or
  raw `ctx.auth`. Identify a user by an opaque/hashed id (Rule 9). Redact via an allowlist,
  not a denylist.
- **Never emit an unleveled, unsampled log.** Every line goes through the shared logger with
  an explicit level; high-volume info/debug is sampled. Scattered `console.log` is drift.
- **Never log per row inside a loop or `.map()`.** Aggregate to one summary line; a log per
  row is the N+1 anti-pattern (Rule 7) and multiplies ingest cost.

Refuse these rationalizations: "log the whole body, we'll need it for debugging"; "just
`console.log` it, we'll clean it up later"; "email is fine, it's only in the logs"; "log
every request, storage is cheap" (it is not, at the edge, at p99 traffic).

---

## When to Use

- A new project or feature needs an application logging convention wired in.
- Logging cost has spiked, or the drain is dominated by per-request noise.
- You are replacing scattered `console.log` calls with a structured, leveled logger.
- You need a redaction policy before logs touch user data.

## When NOT to Use

- You need traces, spans, or metrics (latency, throughput) → `observability-setup` owns the
  OTel/Sentry instrumentation; this skill is the log signal only.
- You need a durable who-did-what record → `audit-log-pattern` (audit entries are never
  sampled or dropped; logs are).
- You are setting the project's overall spend ceiling/alerts → `spend-cap`.
- You are validating env vars in general → `env-validation` (this skill consumes it for
  `LOG_LEVEL`).

---

## Procedure

1. **Adopt an edge-safe logger that writes JSON to stdout (low).** The edge runtime has no
   filesystem and no Node transports — the platform ingests `console` output. A tiny logger
   (or pino in edge mode) serializing one JSON object per call is the whole mechanism. See
   `references/structured-logger.md`.

2. **Validate `LOG_LEVEL` and sample rates from env with Zod (low).** A single minimum level
   and per-level sample rates come from the Zod-parsed env module, not scattered literals
   (Rule 8). Default `info` in prod, `debug` in dev. Consumes `env-validation`.

3. **Fix the canonical field schema (medium).** Every line carries the same keys: `level`,
   `time` (UTC, Rule 6), `event` (a stable dotted name, not a sentence), `traceId`, and a
   typed scalar `ctx`. A consistent shape is what makes the drain queryable. See
   `references/structured-logger.md`.

4. **Build the redaction allowlist before logging anything user-derived (high).** Allow an
   exact set of scalar fields in `ctx`; everything else is dropped, not denylisted. Strip
   tokens/secrets/PII, truncate strings (Rule 9) — wrong here is a breach. See
   `references/redaction-and-sampling.md`; record the allowed-field policy in `DECISIONS.md`.

5. **Apply level-aware sampling (medium).** Keep 100% of `warn`/`error`/`fatal`; sample
   `info`/`debug` head-based on the trace id (a sampled request logs coherently end to end).
   This is the lever that bounds cost without blinding you to failures. See
   `references/redaction-and-sampling.md`.

6. **Correlate with the trace id; route errors to Sentry (low).** Read the active OTel trace
   id into every line so a log joins its trace. Errors go to Sentry once (the exception
   path), not duplicated as a logged stack. Pairs with `observability-setup`.

7. **Audit and replace existing log sites (medium).** Grep for `console.`; replace each with
   a leveled, redacted call; pull any log out of a row loop into one summary (Rule 7). Then
   hand the diff to `security-pass` / `secret-scan`.

---

## Composes With

- **Consumes:** `env-validation` — `LOG_LEVEL` and sample-rate vars are Zod-parsed there
  (Rule 8); this skill reads the typed values.
- **Pairs with:** `observability-setup` — traces/metrics and logs are sibling signals sharing
  the trace id; that skill owns spans/Sentry, this owns the log line.
- **Pairs with:** `spend-cap` — sampling is the per-line cost lever; the spend cap is the
  ceiling and alert. Tune sampling to live under it.
- **Runs against:** `secret-scan` / `security-pass` — they verify no secret or PII reaches
  the drain after redaction.
- **Hands off:** durable change history is not a log → `audit-log-pattern`.

---

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> This is the encoded failure class, not a captured transcript. Replace it after running the
> task without the skill and recording what the agent actually does.

**Failure class encoded:** Asked to "add logging to the checkout flow," the agent sprinkles
`console.log("request", req)` and `console.log(JSON.stringify(input))` through the tRPC
procedures and route handlers — emitting the full request body, the customer's email and
address, and the Clerk session token into the drain on every request (Rule 9). No levels
(everything is `console.log`, so prod cannot be quieted), no sampling (every request logs, so
a spike multiplies ingest 1:1 and tops the bill), a `console.log(row)` inside a `.map()` over
the cart (Rule 7), and timestamps in the server's local zone (Rule 6). It "works" in dev;
weeks later logging is the largest invoice line while a PII exposure sits in the drain.

---

## Examples

**Input:** "Log that an order was placed."
**Output:** `log.info("order.placed", { orderId, userId: await hashUserId(ctx.auth.userId), totalCents })`
— stable event name, scalars only, money as integer minor units, hashed user id (Rule 9; `hashUserId`
is async — it uses edge-safe Web Crypto `crypto.subtle`, not `node:crypto`, see
`references/redaction-and-sampling.md`), `time` UTC (Rule 6), sampled per the info rate.

**Input:** "We log every incoming request and the bill exploded."
**Output:** Re-level to `log.debug("http.request", { route, method, status, ms })` (no body, no
headers), set prod `LOG_LEVEL=info` so it is off by default, and head-sample `info`/`debug` at
~5% by trace id; keep `warn`/`error` at 100%. See `references/redaction-and-sampling.md`.

**Input:** "Log the webhook payload so we can debug failures."
**Output:** Log `webhook.received` with `{ type, id, traceId }` only; on failure
`webhook.failed` with the error code, never the raw body. A needed body sample is gated behind
`log.debug` + redaction + sampling.

---

## Edge Cases

- **A genuinely needed payload for debugging** → log it at `debug` (off in prod), through the
  redactor, sampled — never at `info` and never raw.
- **An error carries useful context** → log the error event with scalar context and let
  Sentry capture the exception once; do not also dump the full stack to the drain twice.
- **Background job / cron with no trace context** → generate a correlation id at job start and
  attach it as `traceId` so its lines group; do not leave it null.
- **A high-cardinality field (raw URL with query string, ids of every row)** → bucket or omit
  it; high-cardinality keys blow up index cost and often smuggle PII in query params.

## References

- `references/structured-logger.md` — the edge-safe JSON logger: the `LogFields` schema, the
  Zod-validated `LOG_LEVEL`/sample env, level gating, UTC `time`, trace-id read, and the
  Sentry error path. Real Next.js App Router + edge idioms.
- `references/redaction-and-sampling.md` — the allowlist redactor (scalar-only `ctx`, string
  truncation, secret/PII stripping), the head-based level-aware sampler keyed on trace id,
  the never-log checklist, and the edge cost rationale.

## Scripts

`scripts/` is reserved. A signal that would justify one: a static check that greps the diff
for `console.log`/`console.info` outside the logger module, or for logging a whole `input`/
`req`/`body`/`row` object — i.e. catching unleveled or body-dumping log calls mechanically.
Until that pattern recurs, this skill stays script-free.
