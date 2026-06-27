Purpose: edge-safe capture transport (client + server), the publishable-vs-private key split
through the Zod env boundary, consent + DNT gating, server-side funnel capture, sampling, and
the explicit boundary against `observability-setup`.

# The boundary against ops observability (read this first)

Product analytics and ops observability are two signals that must not be wired into one pipe:

| | Product analytics (this skill) | Ops observability (`observability-setup`) |
|---|---|---|
| Question | What did the user *do*? | Did the request *error / how slow*? |
| Examples | `user.signed_up`, `order.completed` | exceptions, traces, spans, latency |
| Destination | PostHog-class warehouse | Sentry + OTel |
| On failure | best-effort, sampled, droppable | must capture every error |

Do not `capture` an exception as a product event, and do not route analytics through the trace
exporter. An error is not a funnel step.

# Edge-safe transport

The edge runtime has no long-lived process, no background timers you can rely on across requests,
and no persistent in-memory queue. So:

- **Client** — `posthog-js`. Runs in the browser; not an edge concern.
- **Server** — capture over plain HTTP/fetch. Either `posthog-node` configured to flush
  immediately (`flushAt: 1`, `flushInterval: 0`) and `await`ed, or a direct `fetch` to the
  `/capture` endpoint. Never a Node SDK that batches behind a timer you assume will fire — at the
  edge the context can be frozen or torn down before it does, dropping the event.

```ts
// src/lib/analytics/posthog-server.ts — direct fetch, fully edge-safe
import { env } from "~/env";
import { type AnalyticsEvent } from "./events"; // the taxonomy is the only event type

export async function captureServer(distinctId: string, event: AnalyticsEvent) {
  await fetch(`${env.POSTHOG_HOST}/capture/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: env.NEXT_PUBLIC_POSTHOG_KEY, // publishable ingestion key — write-only
      distinct_id: distinctId,
      event: event.name,
      properties: { ...event.props, $source: "server" },
      timestamp: new Date().toISOString(), // UTC, Rule 6
    }),
  }).catch(() => {
    // analytics must never break the business transaction; log the event, not the raw error
    console.error("analytics.capture_failed", { event: event.name });
  });
}
```

The capture is awaited (so the edge function doesn't return before the request is sent) but its
failure is swallowed — a dropped event is never worth failing a signup or a sale.

# The key split — publishable vs private (Rule 9)

PostHog has two kinds of credential, and conflating them is the leak:

- **Project / ingestion key** (`phc_…`) — write-only, designed to be public, like a Sentry DSN.
  It may be `NEXT_PUBLIC_POSTHOG_KEY`. It can send events; it cannot read your data.
- **Personal / project API key** (`phx_…`) — can read events, manage the project, export data. It
  is a **secret**: server-only, never `NEXT_PUBLIC_*`, never in a Client Component (Rule 9). You
  need it only for the management/query API, not for capture.

Both go through the Zod env schema (`env-validation`, Rule 8) so a missing or misplaced key fails
the build, not production:

```ts
// src/env.ts (consumed from env-validation)
server: {
  POSTHOG_HOST: z.string().url(),
  POSTHOG_PERSONAL_API_KEY: z.string().min(1).optional(), // secret, server-only
},
client: {
  NEXT_PUBLIC_POSTHOG_KEY: z.string().startsWith("phc_"), // publishable ingestion key
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url(),
},
```

If a `phx_`/personal key ever appears under a `NEXT_PUBLIC_` name, that is a Rule 9 violation the
candidate `scripts/` check greps for.

# Consent + Do-Not-Track gating

No event is captured until consent is satisfied and DNT is honored. The gate lives in the capture
seam so no call site can skip it.

```ts
// src/lib/analytics/consent.ts (client)
export function captureAllowed(): boolean {
  if (typeof navigator !== "undefined" && navigator.doNotTrack === "1") return false;
  return getStoredConsent() === "granted"; // your banner writes this; default below
}
```

- Where opt-in is legally required (EU/UK), `getStoredConsent()` defaults to **not** `"granted"` —
  capture is OFF until the user accepts. Initialize `posthog-js` with `opt_out_capturing_by_default`
  and call `posthog.opt_in_capturing()` only after consent.
- `navigator.doNotTrack === "1"` is honored regardless of jurisdiction.
- A blocked capture is a silent no-op — never throw, never queue PII for later.

Record the consent model (opt-in vs opt-out, what the banner persists) in `DECISIONS.md`.

# Server-side funnel capture (trust + ad-blockers)

Ad-blockers block a large share of browser analytics, so the conversion events that matter most
must not depend on the client. Fire them server-side, after the DB write, validated through the
taxonomy:

- **`user.signed_up`** — from the Clerk webhook (`user.created`), Svix-verified and Zod-parsed
  (`clerk-auth-flows`, `webhook-handler`). Fires for every signup method, can't be spoofed.
- **`order.completed`** — from the Stripe webhook / order mutation, *after* the order row commits,
  idempotent on the event id (`idempotency-keys`). Revenue is never trusted from the browser.

The client still captures *intent* (`checkout.started`) so you can measure drop-off between intent
and completion — but the source-of-truth conversion is the server event.

# Sampling — never the funnel

Capture is the same edge-cost driver `log-discipline` bounds. Keep **100%** of funnel/conversion
events (`user.signed_up`, `checkout.started`, `order.completed`); sample high-volume noise
(`page.viewed`, scroll, heartbeat) by hashing the distinct id so a sampled user is captured
*coherently* end to end rather than at random. Record the sampling policy in `DECISIONS.md`.
