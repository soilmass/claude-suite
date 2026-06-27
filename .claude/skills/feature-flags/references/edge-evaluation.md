Purpose: the typed flag registry, an edge-safe flag source, and the fail-safe Zod-parsed evaluation function — the spine of feature-flags evaluation on the edge stack.

# Typed flag registry (Rule 1 — root of the chain)

One registry module is the source of truth for every flag. `FlagKey` derives from it, so a
lookup of a renamed or deleted flag is a compile error, not a silent `undefined`.

```ts
// src/flags/registry.ts
import { z } from "zod";

const flagDef = z.object({
  default: z.boolean(),          // resolved value on any miss/outage — kill switch -> safe state
  description: z.string(),
  owner: z.string(),             // who flips it
  createdAt: z.string(),         // ISO date — flags are dated debt
  sunset: z.string(),            // condition to remove: "remove at 100%", "remove after Q3"
});
export type FlagDef = z.infer<typeof flagDef>;

export const flags = {
  "checkout-v2": {
    default: false,
    description: "New edge checkout flow",
    owner: "payments",
    createdAt: "2026-06-26",
    sunset: "remove the v1 branch once at 100%",
  },
  "ai-summarizer": {
    default: true,               // SAFE state = the non-AI path; flip to false to kill
    description: "AI summary on the detail page; kill switch",
    owner: "ml",
    createdAt: "2026-06-26",
    sunset: "permanent kill switch — keep",
  },
} as const satisfies Record<string, FlagDef>;

export type FlagKey = keyof typeof flags;
```

Key idea for the kill switch: its `default` is the **safe** value. `ai-summarizer` defaults to
`true` because `true` means "behave as before the AI feature shipped" — so a store outage keeps
the app working. A pure release toggle (`checkout-v2`) defaults to `false` (old path).

# Edge-safe flag source

Evaluation runs at the edge (middleware, RSC, tRPC on the edge runtime). The source must be
Web-API-only — no Node KV SDK, no TCP. Two valid choices; record which in `DECISIONS.md`:

- **Vercel Edge Config** — read-optimized, single-digit-ms reads at the edge, ideal for flags.
  Reads via `@vercel/edge-config` (`fetch`-based) or the raw HTTP endpoint.
- **HTTP KV (Upstash Redis REST)** — `fetch`-based REST, edge-safe, when you also need writes
  from the edge or already run Upstash.

The connection string / token is a **server secret**: it enters through the Zod env schema
(Rule 8) and never wears a `NEXT_PUBLIC_` prefix (Rule 9). See `env-validation`.

```ts
// src/env.ts (excerpt) — the flag source token is validated, server-only
EDGE_CONFIG: z.string().url(),                 // never NEXT_PUBLIC_*
```

# Fail-safe evaluation (Rules 1, 8)

The KV read is an external boundary: Zod-parse it, and on ANY failure resolve to the registry
default. Evaluation must never throw — a flag outage is not a site outage.

```ts
// src/flags/evaluate.ts
import { get } from "@vercel/edge-config";
import { z } from "zod";
import { flags, type FlagKey } from "./registry";
import { isInRollout } from "./rollout";

// Stored shape per flag in Edge Config — external input, so it is parsed.
const stored = z.object({
  enabled: z.boolean().optional(),       // hard on/off (kill switch / targeting result)
  rollout: z.number().int().min(0).max(100).optional(),  // percentage
  allow: z.array(z.string()).optional(), // userId/orgId allow-list
});

export async function evaluate(
  key: FlagKey,
  ctx: { userId: string | null },
): Promise<boolean> {
  const def = flags[key].default;
  try {
    const raw = await get(key);                 // fetch-based, edge-safe
    const cfg = stored.safeParse(raw);          // Rule 8 — parse the boundary
    if (!cfg.success) return def;               // malformed -> safe default
    const { enabled, rollout, allow } = cfg.data;

    if (enabled === false) return false;        // kill switch wins
    if (enabled === true) return true;          // forced on
    if (allow && ctx.userId && allow.includes(ctx.userId)) return true; // targeting
    if (rollout != null && ctx.userId) return isInRollout(key, ctx.userId, rollout);
    return def;
  } catch {
    return def;                                 // outage -> safe default, never throw
  }
}
```

Precedence (kill switch → targeting → rollout → default) lives here, in one place, so
evaluation order is never incidental. The bucketing in `isInRollout` is in
`rollout-patterns.md`.

# Server-side evaluation, client gets only the boolean (Rule 9)

Evaluate where the secret already is — the server — and pass the resolved boolean down. The
provider token never crosses to the client.

```ts
// RSC: resolve and branch on the boolean
const showV2 = await evaluate("checkout-v2", { userId: auth().userId });
return showV2 ? <CheckoutV2 /> : <CheckoutV1 />;
```

```ts
// tRPC: expose the resolved set to Client Components without leaking the token
export const flagsRouter = createTRPCRouter({
  resolved: publicProcedure.query(async ({ ctx }) => ({
    checkoutV2: await evaluate("checkout-v2", { userId: ctx.auth.userId }),
  })),
});
```

In middleware (always edge), call `evaluate` with the Web-API reader only — never a Node SDK —
and keep `clerkMiddleware` edge-pure (see `edge-runtime-constraints`).

# Anti-patterns this prevents

- `process.env.FEATURE_X === "true"` — a stringly-typed toggle flippable only by redeploy; it
  is not a kill switch and breaks Rule 1.
- A KV read with no parse and no default — one blip and the route 500s.
- The Node `ioredis`/`@upstash/redis` (non-REST) client at the edge — opens a TCP socket the
  edge isolate can't grant.
- The Edge Config token in `NEXT_PUBLIC_*` to "evaluate on the client."
