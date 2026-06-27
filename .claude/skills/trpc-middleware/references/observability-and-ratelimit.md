Purpose: PII-safe timing/structured-logging middleware and an edge-compatible rate-limit middleware keyed on `ctx.auth.userId`, plus composition examples.

# Observability + rate-limit middleware

Both are cross-cutting middleware in `src/server/api/trpc.ts`. Neither touches feature data.

## 1. Timing + structured logging (PII-safe)

Emit exactly one structured, leveled line per call. Log path, type, duration, userId,
outcome — never `rawInput`, never headers carrying tokens (log discipline is the top edge
cost driver, and `rawInput` is a PII/leak vector).

```ts
const timingLogger = t.middleware(async ({ ctx, path, type, next }) => {
  const start = Date.now();
  const result = await next();
  const durationMs = Date.now() - start;
  // Structured + leveled. Sampled in prod (see note). No rawInput, no PII.
  logger.info({
    msg: "trpc",
    path,                       // e.g. "invoice.getById"
    type,                       // "query" | "mutation" | "subscription"
    durationMs,
    userId: ctx.auth.userId ?? null,
    ok: result.ok,
    code: result.ok ? undefined : result.error.code,
  });
  return result;
});
```

Rules honored:
- **No PII / no bodies** — `rawInput` is deliberately absent. If a specific field is needed to
  debug, log a redacted, allow-listed projection, not the whole input.
- **Sample in prod** — gate `logger.info` behind a sample rate; always log on `!result.ok`.
- **`result.ok` form** — calling `next()` and inspecting `result` (vs try/catch) lets you log
  both success and the tRPC error code without swallowing the error.

`logger` is your structured logger (e.g. pino), wired to OTel/Sentry at genesis. Do not
`console.log` raw objects at the edge.

## 2. Rate limiting (edge-compatible, keyed on identity)

An in-memory `Map` does NOT work at the edge: each isolate has its own memory and is
ephemeral, so counters never aggregate and reset unpredictably. Use an external store with an
HTTP/REST API (Upstash Ratelimit over Redis REST is the common edge choice).

```ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { z } from "zod";

// Rule 8: validate the config boundary, don't read process.env raw.
const env = z
  .object({
    UPSTASH_REDIS_REST_URL: z.string().url(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  })
  .parse(process.env);

const ratelimit = new Ratelimit({
  redis: new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }),
  limiter: Ratelimit.slidingWindow(10, "10 s"),
  prefix: "trpc",
});

// Keyed on userId — only valid after the auth gate has narrowed it to `string`.
const rateLimit = t.middleware(async ({ ctx, path, next }) => {
  if (!ctx.auth.userId) throw new TRPCError({ code: "UNAUTHORIZED" }); // belt-and-suspenders
  const { success, reset } = await ratelimit.limit(`${ctx.auth.userId}:${path}`);
  if (!success) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Rate limit exceeded. Try again at ${new Date(reset).toISOString()}.`,
    });
  }
  return next();
});

export const rateLimitedProcedure = protectedProcedure.use(rateLimit);
```

### Identity to key on

- **Protected routes:** key on `ctx.auth.userId`. Never on a header — `x-forwarded-for` is
  spoofable (Rule 8: do not trust an unvalidated boundary as identity).
- **Public routes:** there is no userId; key on a validated IP and treat it as best-effort,
  not authentication. Parse the IP from a trusted edge header (e.g. platform-provided), and
  document the limitation in `DECISIONS.md`.

```ts
// Public + rate-limited (best-effort, IP-keyed):
export const publicRateLimitedProcedure = publicProcedure.use(({ ctx, next }) => {
  const ip = z.string().ip().catch("anon").parse(ctx.headers.get("x-real-ip"));
  // ...ratelimit.limit(ip)...
  return next();
});
```

## 3. Composition map

- `publicProcedure` = `t.procedure.use(timingLogger)`
- `protectedProcedure` = `publicProcedure.use(authGate)` (see procedure-builders.md)
- `rateLimitedProcedure` = `protectedProcedure.use(rateLimit)`

Each variant extends the previous with `.use()`. Order matters: `timingLogger` first so it
measures the whole chain (including time spent in the limiter); the auth gate before
`rateLimit` so the limiter can key on a narrowed `userId`.

## Review checklist

- [ ] Logging middleware never references `rawInput` or token-bearing headers.
- [ ] Logs are structured, leveled, and sampled in prod (always log errors).
- [ ] Rate limiter uses an external edge store, not an in-memory Map.
- [ ] Protected limiter keys on `ctx.auth.userId`; public limiter on a validated IP only.
- [ ] Limiter env config is Zod-parsed (Rule 8); throws `TOO_MANY_REQUESTS` on deny.
