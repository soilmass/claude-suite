Purpose: raw-body access in an edge route handler, why not tRPC, the per-provider signature schemes (Stripe / Svix / GitHub HMAC), constant-time comparison, the replay-window check, and the server-only signing secret (Rules 8/9/2).

# Verify before parse: raw body + signature at the edge

The order is **verify → parse → act**, and verification needs the *exact bytes* the provider
signed. Both facts shape where the handler lives and how it reads the body.

## Why a route handler, not tRPC

tRPC consumes and JSON-parses the request body. Once it does, the raw bytes are gone and any
HMAC you recompute will mismatch (whitespace/key-order differ after re-serialization). A webhook
therefore lives in a Web `Request` route handler where you control the read:

```ts
// src/app/api/webhooks/<provider>/route.ts
export async function POST(req: Request) {
  const raw = await req.text(); // the signed bytes — read ONCE, before any JSON.parse
  // ... verify(raw, signatureHeader) ... then JSON.parse / Zod
}
```

`req.text()` (or `req.arrayBuffer()` for binary schemes) returns the unmodified body. The stream
is consumable once: capture `raw`, verify against it, and only then `JSON.parse(raw)` for Zod.

## The env-boundary secret (Rules 8/9)

The signing secret is server-only and Zod-validated so a missing secret fails at boot:

```ts
// src/env.ts (server object)
STRIPE_WEBHOOK_SECRET: z.string().min(1),   // "whsec_..."
GITHUB_WEBHOOK_SECRET: z.string().min(1),
```

Never `NEXT_PUBLIC_*`, never `process.env.X as string` at the call site — import from the
validated `env`. (See `env-validation`.)

## Per-provider signature schemes

All three are HMAC-SHA256 over a documented signed payload; only the framing differs.

**Stripe** — let the SDK do the constant-time verify + replay window. On the edge runtime you MUST
use the **async** verifier with a Web-Crypto provider; the synchronous `constructEvent` relies on
Node's `crypto` and throws at the edge:

```ts
import Stripe from "stripe";
import { env } from "~/env";
const stripe = new Stripe(env.STRIPE_SECRET_KEY);
const cryptoProvider = Stripe.createSubtleCryptoProvider(); // Web Crypto — required at the edge

const sig = req.headers.get("stripe-signature");
if (!sig) return new Response("missing signature", { status: 400 });
let event: Stripe.Event;
try {
  event = await stripe.webhooks.constructEventAsync(
    raw, sig, env.STRIPE_WEBHOOK_SECRET, undefined, cryptoProvider,
  );
} catch {
  return new Response("invalid signature", { status: 400 }); // never 2xx unverified
}
// `event` is still provider-typed, not yours — Zod-parse before persisting (see other ref)
```

**Svix (Clerk, Resend, others)** — `new Webhook(secret).verify(raw, svixHeaders)`; see
`clerk-auth-flows`' `references/webhooks.md` for the Clerk instance.

**GitHub (or any "do it yourself" provider)** — recompute the HMAC with Web Crypto and compare
in constant time:

```ts
// Pure-JS constant-time compare — runs on any edge runtime (no node:crypto dependency).
function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false; // signatures are fixed-length hex; length is not secret
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function verifyGithub(raw: string, header: string | null, secret: string) {
  if (!header) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(raw));
  // Buffer isn't guaranteed at the edge — hex-encode the bytes with Web APIs only.
  const expected = "sha256=" + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return constantTimeEqual(expected, header); // never `expected === header`
}
```

Constant-time comparison matters: a plain `===` short-circuits on the first differing byte and
leaks the signature one character at a time under timing analysis. The loop above XORs every
character regardless, so its timing is independent of where the mismatch is. Where `node:crypto` is
available (Cloudflare `nodejs_compat`, recent Vercel Edge), `timingSafeEqual(a, b)` on equal-length
buffers is the drop-in equivalent.

## Replay window

A captured-and-replayed request carries a valid signature. Stripe's `constructEvent` enforces a
default tolerance on the `t=` timestamp; for hand-rolled schemes, parse the provider's signed
timestamp and reject anything older than ~5 minutes before trusting it. Combined with the event-id
dedup (see the other reference) this closes both replay and duplicate delivery.

## Status codes

- Missing/invalid signature, missing required headers → **4xx**, no side effects.
- Verified but unhandled/malformed event type → clean **4xx** (or 2xx-ignore) — not a 500 that
  makes the provider retry forever.
- Verified + handled (or already-seen) → **2xx**, only after the event is durably recorded.
