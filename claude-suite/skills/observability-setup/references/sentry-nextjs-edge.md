Purpose: the Sentry-for-Next.js wiring on the edge stack — per-runtime init, error capture,
release + source maps, and the secret/public env split (Rules 8 & 9).

# Install

```bash
pnpm add @sentry/nextjs @vercel/otel
```

`@sentry/nextjs` bundles OTel-compatible tracing; `@vercel/otel` is the edge-safe registrar
used in `instrumentation.ts` (see `otel-tracing.md`).

# The three runtimes, three inits

App Router code runs in **browser**, **Node server**, and **edge** runtimes. Each needs its
own `Sentry.init`. The server and edge inits are imported from `instrumentation.ts` gated on
`process.env.NEXT_RUNTIME`; the client init lives in `instrumentation-client.ts` (Next 15+;
older projects use `sentry.client.config.ts`).

## `sentry.server.config.ts`

```ts
import * as Sentry from "@sentry/nextjs";
import { env } from "@/env"; // the Zod-validated env (Rule 8)

Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  environment: env.SENTRY_ENVIRONMENT,
  release: env.VERCEL_GIT_COMMIT_SHA, // Zod-validated, attributable to a deploy
  tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE, // env-driven, NEVER hardcoded 1.0
  sendDefaultPii: false, // do not capture bodies / user data — see log-discipline
});
```

## `sentry.edge.config.ts`

Identical shape, but this one runs in the edge runtime — it must not pull in any Node-only
dependency. The Sentry edge SDK is edge-safe; do not add the OTel Node SDK here.

```ts
import * as Sentry from "@sentry/nextjs";
import { env } from "@/env";

Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  environment: env.SENTRY_ENVIRONMENT,
  release: env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
  sendDefaultPii: false,
});
```

## `instrumentation-client.ts`

Same `init`, plus client-only integrations (e.g. `Sentry.replayIntegration()` if Replay is
budgeted — that's a `spend-cap` call). Without this init the browser captures nothing and the
end-to-end trace loses its client leg. Then export `onRouterTransitionStart` for navigation
spans:

```ts
import * as Sentry from "@sentry/nextjs";
import { env } from "@/env";

Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  environment: env.SENTRY_ENVIRONMENT,
  release: env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
  sendDefaultPii: false,
  integrations: [Sentry.replayIntegration()], // client-only; budget via spend-cap
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```

# Capturing server & edge errors: `onRequestError`

Next.js calls the `onRequestError` hook for every error thrown in a server/edge request.
Without it, only client errors report. Export it from `instrumentation.ts`:

```ts
export const onRequestError = Sentry.captureRequestError;
```

This gives each captured error its request context (route, headers metadata) automatically.

# Release tracking + source maps: `withSentryConfig`

Wrap `next.config` so the build stamps the release and uploads source maps. Stack traces stay
minified without this.

```ts
// next.config.ts
import { withSentryConfig } from "@sentry/nextjs";
import { env } from "@/env"; // same Zod-validated env the inits read

const nextConfig = {/* ... */};

export default withSentryConfig(nextConfig, {
  org: env.SENTRY_ORG,
  project: env.SENTRY_PROJECT,
  authToken: env.SENTRY_AUTH_TOKEN, // SERVER-ONLY SECRET — Rule 9. Build-time only.
  release: { name: env.VERCEL_GIT_COMMIT_SHA }, // same validated source as Sentry.init's release
  tunnelRoute: "/monitoring", // relay events past ad-blockers through your domain
  widenClientFileUpload: true,
  disableLogger: true, // tree-shakes the Sentry logger from the client bundle
});
```

# The Rule 9 split — what is public vs secret

| Var | Scope | Why |
| --- | --- | --- |
| `NEXT_PUBLIC_SENTRY_DSN` | public (client OK) | A DSN only *ingests* events; it cannot read your project. Safe in the bundle. |
| `SENTRY_AUTH_TOKEN` | **server / build only** | Project-scoped read/write token. NEVER `NEXT_PUBLIC_*`, never in a Client Component. |
| `SENTRY_ORG` / `SENTRY_PROJECT` | server / build | Build-time upload config. |
| `SENTRY_ENVIRONMENT` | both | Tags events (`production` / `preview`). |
| `SENTRY_TRACES_SAMPLE_RATE` | both | Fractional, env-driven. `spend-cap` owns the value. |

The single most common defect: prefixing the auth token `NEXT_PUBLIC_` "so the build sees it."
The build is server-side and already sees `SENTRY_AUTH_TOKEN` — the prefix only leaks it.

# Add to the Zod env boundary (Rule 8)

Hand the mechanics to `env-validation`; the keys to add:

```ts
// server schema
SENTRY_AUTH_TOKEN: z.string().min(1),
SENTRY_ORG: z.string().min(1),
SENTRY_PROJECT: z.string().min(1),
SENTRY_ENVIRONMENT: z.enum(["production", "preview", "development"]),
SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1),
VERCEL_GIT_COMMIT_SHA: z.string().min(1), // the release identity — every init reads it from here
// client schema
NEXT_PUBLIC_SENTRY_DSN: z.string().url(),
```

`VERCEL_GIT_COMMIT_SHA` is set by Vercel on deploy; validate it so a build with no release SHA
fails loudly rather than silently shipping `release: undefined` (which breaks source-map upload
and release attribution — the exact failure SKILL.md forbids). For local builds outside Vercel,
inject it (e.g. `VERCEL_GIT_COMMIT_SHA=$(git rev-parse HEAD)`). All three Sentry inits and
`withSentryConfig` must read this one validated source so the uploaded maps key to the same
release. A missing DSN, a missing release, or a misplaced token now fails the build, not production.
