Purpose: which operations must be idempotent, the Idempotency-Key envelope, and how to fingerprint the request body at the boundary so a key reused with a different payload is a 409.

# When an operation needs a key, and the envelope that carries it

## Which operations MUST be idempotent

The test is not "is this a mutation" — it is "if this runs twice, does the world change
twice?" Retries are not exceptional: the serverless HTTP driver, the client's fetch wrapper,
the queue, and the payment provider's webhook layer all deliver **at least once**.

| Operation | Idempotent already? | Needs a key? |
| --- | --- | --- |
| Charge / refund / payout / any money move | No — runs twice = double effect | **Yes** (and forward the key to the provider) |
| State transition (order → shipped, plan upgraded, invite accepted) | No — second run re-fires hooks | **Yes** |
| Send email / push / SMS / external provisioning | No — duplicate notification | **Yes** |
| Webhook processing | No — provider redelivers on any non-2xx | **Yes** (key = provider event id) |
| Create a row that must be unique per request | No — duplicate rows | **Yes** (per-table unique key, see dedup-store.md) |
| Full-overwrite update (`set X = Y` by id) | Yes — last write wins, same result | No |
| Delete by id | Yes — second delete is a no-op | No |
| Pure read / query | Yes — no effect | No |

Rule of thumb: a `POST`-shaped effect with a side effect outside the current transaction (an
external API, a notification, money) always needs a key. Don't add the ceremony to a write
that is already idempotent — that is noise, not safety.

## The Idempotency-Key envelope

The key is a caller-chosen opaque string (a UUIDv4/v7 the client generates per *logical*
operation and reuses across its own retries). The server never invents it on the fly per
attempt — that would defeat dedup. Carry it as a header on the HTTP boundary (`Idempotency-Key`)
or as an explicit field on the tRPC input.

```ts
// src/server/idempotency/envelope.ts
import { z } from "zod";

// Validate the key at the boundary (Rule 8). Opaque but bounded — reject the absurd.
export const idempotencyKey = z
  .string()
  .min(8, "Idempotency-Key too short")
  .max(255, "Idempotency-Key too long");

export type IdempotencyKey = z.infer<typeof idempotencyKey>;
```

For a tRPC procedure, the cleanest shape is to read the key from `ctx` (set by middleware that
pulled the header) and keep the business input separate, so the same shared Zod schema still
backs the form and the procedure (per `../../CLAUDE.md`). See `trpc-middleware` for the builder.

## Fingerprinting the request body

A key alone is not enough: a buggy client could reuse a key for a *different* request. The
fingerprint is a hash of the canonical request body, stored beside the key. On a replay we
compare fingerprints — a mismatch means "same key, different body," which is a 409 Conflict,
not a replay. Never serve the old result for a new body, and never overwrite.

Use **Web Crypto** (`crypto.subtle`), which exists on the edge runtime — Node's `crypto` module
is not guaranteed at the edge (edge constraint, `../../CLAUDE.md`).

```ts
// src/server/idempotency/fingerprint.ts
// Canonicalize first: stable key ordering so { a, b } and { b, a } hash equal. A shallow
// sort is shown; for nested bodies use a deterministic serializer (deep-sorted keys).
function canonicalize(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

export async function fingerprint(body: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalize(body));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

Notes:
- **Fingerprint the *validated* input**, not the raw bytes — parse with the shared Zod schema
  first (Rule 8), then fingerprint, so two equivalent bodies that normalize the same don't
  read as a conflict.
- **The fingerprint is not a security control.** It detects accidental key reuse; ownership
  (Rule 2) and auth still gate the operation independently.
- **Scope the key per caller.** The dedup store keys on `(scope_id, idempotency_key)` where
  `scope_id` is `ctx.auth.userId` or the org id — so one user's key can never collide with or
  read another's stored result (Rule 2). See `dedup-store.md`.
