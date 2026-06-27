Purpose: the edge-safe structured logger — field schema, Zod-validated level/sample env, level gating, UTC time, trace-id correlation, and the Sentry error path.

# Edge-safe structured logger

The edge runtime (Vercel Edge / Cloudflare Workers class) has **no filesystem and no Node
`stream` transports**. The only sink is `console`, which the platform forwards to its log
drain. So the logger's entire job is: build one well-shaped JSON object, gate it by level,
sample it, redact it, and `console`-emit it. Do not reach for pino file transports, `winston`,
or anything that opens a stream — they fail or no-op at the edge. (pino works only in its
browser/edge `write` mode, which is just `console` under the hood; a hand-rolled logger is
clearer and smaller.)

## 1. The field schema — one shape for every line

A consistent key set is what makes the drain queryable. Free-text messages are not.

```ts
// src/lib/log/fields.ts
import { z } from "zod";

export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

// `ctx` is scalars only — the redactor (see redaction-and-sampling.md) enforces this.
export type LogContext = Record<string, string | number | boolean | null>;

export interface LogLine {
  level: LogLevel;
  time: string;        // UTC ISO 8601 — Rule 6
  event: string;       // stable dotted name, e.g. "order.placed" — NOT a sentence
  traceId?: string;    // joins this line to its OTel trace
  ctx?: LogContext;    // redacted scalar fields only
}
```

`event` is a finite vocabulary (`http.request`, `order.placed`, `webhook.failed`). Sentences
("Order was placed for user...") defeat grouping and smuggle PII into the message.

## 2. Env: validated level + sample rates (Rule 8)

`LOG_LEVEL` and the sample rates are parsed once, server-side, by the project's env module
(this skill consumes `env-validation`). Never read `process.env.LOG_LEVEL` ad hoc.

```ts
// add to src/env.ts (server section) — Zod-validated, Rule 8
LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
LOG_SAMPLE_INFO: z.coerce.number().min(0).max(1).default(1),
LOG_SAMPLE_DEBUG: z.coerce.number().min(0).max(1).default(1),
```

Recommended prod values: `LOG_LEVEL=info`, `LOG_SAMPLE_INFO=0.05`, debug off. Dev:
`LOG_LEVEL=debug`, both rates `1`. These are env, not literals, so they tune without a deploy.

## 3. Level gating + emit

```ts
// src/lib/log/index.ts
import { env } from "~/env";
import { LOG_LEVELS, type LogLevel, type LogContext, type LogLine } from "./fields";
import { redact } from "./redact";          // redaction-and-sampling.md
import { keep } from "./sample";            // redaction-and-sampling.md
import { activeTraceId } from "./trace";

const rank = (l: LogLevel) => LOG_LEVELS.indexOf(l);
const MIN = rank(env.LOG_LEVEL);

function emit(level: LogLevel, event: string, ctx?: LogContext) {
  if (rank(level) < MIN) return;            // below threshold: drop, no work
  if (!keep(level, activeTraceId())) return; // sampled out (warn+ always kept)

  const line: LogLine = {
    level,
    time: new Date().toISOString(),         // UTC — Rule 6
    event,
    traceId: activeTraceId(),
    ctx: ctx ? redact(ctx) : undefined,     // allowlist redaction — Rule 9
  };
  // One JSON object per line: the drain parses this into structured fields.
  const sink = level === "error" || level === "fatal" ? console.error : console.log;
  sink(JSON.stringify(line));
}

export const log = {
  trace: (event: string, ctx?: LogContext) => emit("trace", event, ctx),
  debug: (event: string, ctx?: LogContext) => emit("debug", event, ctx),
  info: (event: string, ctx?: LogContext) => emit("info", event, ctx),
  warn: (event: string, ctx?: LogContext) => emit("warn", event, ctx),
  error: (event: string, ctx?: LogContext) => emit("error", event, ctx),
  fatal: (event: string, ctx?: LogContext) => emit("fatal", event, ctx),
};
```

This is a **server-only** module (it reads server env). Importing it into a Client Component
would pull server env client-side — Rule 9. Keep logging on the server (procedures, route
handlers, server actions). Client errors go to Sentry's browser SDK, not this logger.

## 4. Trace-id correlation

Read the active OTel trace id so a log line joins its trace (the link to
`observability-setup`). If OTel is not yet wired, fall back to a per-request id.

```ts
// src/lib/log/trace.ts
import { trace } from "@opentelemetry/api";

export function activeTraceId(): string | undefined {
  return trace.getActiveSpan()?.spanContext().traceId;
}
```

For background jobs/crons with no inbound trace, mint a correlation id at job start and thread
it as `ctx.jobRunId` (or set it as the span). Never leave grouped work uncorrelated.

## 5. The error path — Sentry once, not twice

An exception is captured by Sentry (`@sentry/nextjs`, edge-compatible) on the throw path. The
log line records *that* it failed with scalar context; it does not re-serialize the stack into
the drain (double cost, double PII surface).

```ts
try {
  await placeOrder(input);
} catch (err) {
  Sentry.captureException(err);                       // full exception → Sentry
  log.error("order.place_failed", { orderId, code: errorCode(err) }); // scalar context only
  throw err;
}
```

## 6. Where to log

Log at **boundaries**: procedure entry/exit for meaningful events, external-call results,
state transitions, failures. Do **not** log inside a `.map()`/loop over rows (Rule 7) — emit
one summary line with a count. Do not log normal control flow at `info`; that is `debug`.
