Purpose: OpenTelemetry tracing on the edge runtime — the root `instrumentation.ts`, runtime
gating, trace propagation, and the tRPC span middleware.

# Why `@vercel/otel` and not the OTel Node SDK

The full `@opentelemetry/sdk-node` package depends on Node APIs (async_hooks, perf_hooks,
process internals) that do not exist in the edge runtime. Importing it into middleware or an
edge route breaks the build/runtime — that failure is `edge-runtime-constraints`' domain.
`@vercel/otel` (`registerOTel`) is the edge-safe registrar: it auto-instruments `fetch`,
propagates W3C `traceparent` headers across requests, and works in both Node and edge.

# The root `instrumentation.ts`

One file, called once on boot. It registers OTel and the runtime-appropriate Sentry config,
and exports `onRequestError`.

```ts
// instrumentation.ts (project root, or src/ if you use src)
import { registerOTel } from "@vercel/otel";
import * as Sentry from "@sentry/nextjs";

export async function register() {
  registerOTel({ serviceName: "app-edge" });

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Capture server- and edge-thrown errors with request context.
export const onRequestError = Sentry.captureRequestError;
```

The runtime gate matters: importing `sentry.server.config` (or anything Node-only) into the
edge runtime is the classic edge break. Gate every Node-only import on `NEXT_RUNTIME`.

In Next 15 the instrumentation hook is stable — no `experimental.instrumentationHook` flag
needed. On older versions, enable it in `next.config`.

# Trace propagation across edge requests

`@vercel/otel` reads and writes the W3C Trace Context (`traceparent`) header automatically.
An incoming request with a `traceparent` continues the same trace; an outbound `fetch` (e.g.
to the DB driver's HTTP endpoint, or another internal route) carries it forward. This is what
makes a trace span *across* the edge boundary instead of dying at it. Do not strip or rewrite
`traceparent` in middleware.

# Spans per tRPC procedure

Auto-instrumentation covers `fetch`; it does not name your procedures. Add a tRPC middleware
so each procedure is a named span — then a slow query or an N+1 (`n1-hunter`, Rule 7) shows
up as a labeled child span in the waterfall.

```ts
// src/server/api/trpc.ts
import { trace, SpanStatusCode } from "@opentelemetry/api"; // @opentelemetry/api is edge-safe (types/no-op without SDK)
import { t } from "./init";

const tracer = trace.getTracer("trpc");

export const tracedProcedure = t.procedure.use(async ({ path, type, next }) => {
  return tracer.startActiveSpan(`trpc.${type}.${path}`, async (span) => {
    try {
      const result = await next();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err; // let the error propagate; onRequestError / Sentry captures it
    } finally {
      span.end();
    }
  });
});
```

`@opentelemetry/api` is just the API surface (no Node SDK) — it is edge-safe and becomes a
no-op when no provider is registered, so it never breaks the build. Compose
`publicProcedure` / `protectedProcedure` on top of `tracedProcedure` so every procedure is
traced without per-procedure boilerplate.

Do not record request inputs or row data onto spans as attributes — that re-introduces the
PII / body-logging problem `log-discipline` governs. Record durations, counts, and IDs only.

# Sampling

`tracesSampleRate` (in the Sentry inits) controls trace ingestion. Drive it from
`SENTRY_TRACES_SAMPLE_RATE` env; default low (e.g. `0.1` in production). The *value* is a
cost/visibility tradeoff owned by `spend-cap` and `log-discipline` — wire the knob here,
record any non-default in `DECISIONS.md`, but never hardcode it to `1.0`.
