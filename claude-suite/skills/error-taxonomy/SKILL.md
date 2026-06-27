---
name: error-taxonomy
description: >
  Define how a tRPC API fails on the decided edge stack: a canonical `TRPCError` code taxonomy
  (BAD_REQUEST / UNAUTHORIZED / FORBIDDEN / NOT_FOUND / CONFLICT / TOO_MANY_REQUESTS /
  INTERNAL_SERVER_ERROR), a domain-failure → code mapping table applied uniformly across every
  router, an `error.data` shape that is structured-but-safe, and the client mapping that lands
  field errors on the right form field. Its spine is no information disclosure — stack traces,
  internal messages, SQL, PII never reach the client (Rule-9-adjacent); failures are typed codes,
  not a bare `throw new Error`.
  Use when: "error codes", "trpc error handling", "error taxonomy", "what error code", "map
  server errors to the form".
  Do NOT use for: wiring the context/errorFormatter from scratch (use trpc-router-compose), the
  per-form field-mapping mechanics (use rhf-advanced), or generating the per-procedure error
  reference + CI drift gate (use api-docs-from-trpc).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the error-taxonomy failure class: bare `throw new Error` /
    opaque 500s, leaked stack traces and internal messages reaching the client, stringly-typed
    field errors via `error.message`, and NOT_FOUND vs FORBIDDEN applied inconsistently for
    not-owned rows. Baseline observed 2026-06-26 (narrowed: env-gated disclosure, no correlation id).
---

# error-taxonomy

The policy layer for how the tRPC surface signals failure: which `TRPCError` code each domain
failure maps to, how `error.data` is shaped so the client gets structured-but-safe information,
and how that shape is consumed onto a form. The spine and nine rules live in `../../CLAUDE.md`;
this skill is the concrete discipline behind Rule 9 at the error boundary (no internal detail
leaks), leaning on Rule 2 (not-owned → `NOT_FOUND`, not `FORBIDDEN`) and Rule 8 (the `BAD_REQUEST`
Zod flatten is the only field-error channel). It exists because generated handlers fail plausibly:
a bare `throw new Error` becomes an opaque 500 that leaks its message, and ad-hoc codes drift.

---

## Non-Negotiable Rules

These ship green and look correct, then leak or mislead in production:

- **Never let internal error detail reach the client.** An `INTERNAL_SERVER_ERROR` (and any
  non-`TRPCError` that bubbles up) surfaces a generic message plus a correlation id — never the
  stack, `cause`, SQL, or a raw provider message (Rule 9). The detail is *logged* server-side, and
  stripping is unconditional, not gated on `NODE_ENV`.
- **Never throw a bare `Error` or string from a procedure path.** Every expected failure is a typed
  `TRPCError` with a deliberate code from the canonical set; an untyped throw becomes an opaque 500
  the client cannot narrow and whose message may disclose internals.
- **Never overload `error.message` as a structured-data channel.** Field errors travel in the typed
  `error.data` shape (the `zodError` flatten the formatter exposes), consumed by RHF — never a
  `"field:message"` string the client `.split(":")`s back apart (Rule 1, Rule 8).
- **Never apply `NOT_FOUND` / `FORBIDDEN` inconsistently for not-owned rows.** Decide once —
  default `NOT_FOUND` so the API never confirms a resource the caller can't see exists (Rule 2) —
  and apply it across every router.

Refuse these rationalizations: "just `throw new Error(msg)`, tRPC handles it"; "send the stack in
dev, who'll see it in prod"; "stuff the field name into the message and split it client-side";
"`FORBIDDEN` here, `NOT_FOUND` there — same thing to the user."

---

## When to Use

- Standardizing how failure is signaled across the tRPC routers, or starting a new API surface.
- Deciding which `TRPCError` code a domain failure maps to (authn vs authz, missing vs not-owned,
  uniqueness, rate limit, unexpected).
- Shaping the error formatter's `error.data` so clients get structured, safe error info.
- Wiring a server error to surface correctly on a form or UI (the consume side, with rhf-advanced).

## When NOT to Use

- Building the request context and the single `initTRPC` errorFormatter from scratch →
  `trpc-router-compose` owns that wiring; this skill decides *what it exposes and strips*.
- The per-form `setError`/`root.serverError` mechanics for one form → `rhf-advanced` (this skill
  defines the shape it consumes; that skill applies it at the leaf).
- Enumerating each procedure's error codes into a reference + the CI drift gate → `api-docs-from-trpc`
  (it reads codes from the code; this skill is the policy it documents against).
- Logging/sampling the masked internal detail (levels, Sentry, no PII) → `log-discipline`.
- Catching a missing ownership check that should have produced `NOT_FOUND` → `rule-audit` (Rule 2).

---

## Procedure

1. **Adopt the canonical code set; do not invent codes (low).** Use tRPC's `TRPC_ERROR_CODE_KEY`
   set, centered on the seven primaries (`BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
   `CONFLICT`, `TOO_MANY_REQUESTS`, `INTERNAL_SERVER_ERROR`). Custom string codes break the
   HTTP-status mapping and client narrowing. See `references/code-taxonomy.md`.

2. **Map each domain failure to one code via the table (medium — a wrong code misleads clients).**
   Distinguish authn from authz (`UNAUTHORIZED` = not signed in, `FORBIDDEN` = signed in but not
   permitted), uniqueness (`CONFLICT`), rate limit (`TOO_MANY_REQUESTS`); record non-obvious calls
   in `DECISIONS.md`. See `references/code-taxonomy.md`.

3. **Decide the not-owned-row policy once and apply it uniformly (high — security-relevant,
   Rule 2 / Rule 9).** Default to `NOT_FOUND` so the API never confirms a resource the caller may
   not see; reserve `FORBIDDEN` for the visible-but-denied case. Record it in `DECISIONS.md`. See
   `references/code-taxonomy.md`.

4. **Throw the typed `TRPCError` from the plain function (medium).** It throws
   `new TRPCError({ code, message, cause })`: `message` is a safe user-facing summary, `cause`
   carries the internal error for logging *only*. No `throw new Error` on a procedure path (per
   `../../CLAUDE.md`, logic lives in the function). See `references/code-taxonomy.md`.

5. **Shape `error.data` in the formatter — structured and safe (high — the Rule-9 leak point).**
   The single `errorFormatter` (owned by `trpc-router-compose`) exposes the `zodError` flatten and
   the `code`, strips `stack`/`cause`/raw SQL *unconditionally* (not only in prod), and masks
   `INTERNAL_SERVER_ERROR` to a generic message + correlation id. See `references/error-shape-and-client.md`.

6. **Consume the shape on the client deliberately (medium).** Narrow `TRPCClientError<AppRouter>`,
   read `data.zodError.fieldErrors` → RHF `setError` per field, route code-level errors to
   `root.serverError` — never parse the message string. Field mechanics hand off to `rhf-advanced`.
   See `references/error-shape-and-client.md`.

7. **Document the taxonomy alongside the generated reference (low).** `api-docs-from-trpc`
   enumerates each procedure's thrown codes from the code; keep this taxonomy (policy + table) as
   its prose companion so a code means the same thing in every router. See
   `references/error-shape-and-client.md`.

---

## Composes With

- **Consumes:** `trpc-router-compose` — it owns the one `initTRPC` errorFormatter; this skill
  decides what that formatter exposes (`zodError`, `code`) and what it strips (`stack`, `cause`).
- **Pairs with:** `rhf-advanced` — it maps the shaped `error.data` onto form fields and
  `root.serverError` at the leaf; this skill defines the shape it consumes.
- **Feeds:** `api-docs-from-trpc` — it reads each procedure's `TRPCError` codes from the code and
  wires the CI drift gate; this skill is the canonical policy that reference documents against.
- **Hands off:** `log-discipline` (the masked detail + correlation id is logged here, sampled, no
  PII), `security-pass` (confirm no information disclosure, Rule 9), `rule-audit` (Rule 2 ownership
  → `NOT_FOUND`, Rule 8 boundaries).

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions): "design the error handling for our tRPC API on this edge stack — codes, the error
> shape, and how the client/forms consume them." The imagined catastrophe (bare `throw new Error`,
> `"field:message"` smuggling, `FORBIDDEN`-leaks-existence) did NOT occur. A **narrower** failure
> class was confirmed.

**Observed run.** The agent produced a competent design: the canonical code set in a consistent
table, the `NOT_FOUND`-over-`FORBIDDEN` privacy call made correctly, one shared Zod schema on both
sides, uniqueness caught on the DB insert (no race), an explicit ownership check, and `setError`
field-mapping with a `root.serverError` banner. But its information-disclosure guard was gated on
the environment, and its invented parallel code layer mislabeled:

```ts
// scrubbing ONLY in production — preview/staging ship the raw message AND stack to the browser
const safeMessage = isInternal && process.env.NODE_ENV === "production" ? "…" : shape.message;
data: { stack: isInternal && process.env.NODE_ENV === "production" ? null : shape.data.stack, … }
// masks the 500 but emits NO correlation id; Sentry capture + errorId "deferred, out of scope"
case "CONFLICT": return APP_ERROR.SLUG_TAKEN; // EVERY conflict mislabeled as a slug collision
```

**Failure class (confirmed, narrowed).** Not "produces garbage" — "produces a plausible taxonomy
and then leaks or mislabels the parts that need rigor." The base model strips internals *only when
`NODE_ENV==="production"`*, so every network-reachable non-prod deploy returns the stack and raw
message (Rule 9); it masks the 500 with no correlation id and defers all server-side capture, so a
masked error is untraceable; and its bolted-on `appCode` layer collapses distinct meanings
(`CONFLICT` → `SLUG_TAKEN` unconditionally). This skill makes disclosure-stripping unconditional,
pairs the masked 500 with a logged correlation id, and keeps one canonical code set documented
against what the routers throw (`api-docs-from-trpc`).

---

## Examples

**Input:** "A user requests an invoice that belongs to someone else."
**Output:** The business function loads the row and checks `row.userId === ctx.auth.userId`; on a
mismatch *or* a missing row it throws `new TRPCError({ code: "NOT_FOUND", message: "Invoice not
found" })` — never `FORBIDDEN`, so existence is not disclosed (Rule 2). The formatter ships only
`{ code: "NOT_FOUND", message: "Invoice not found" }`; no SQL, no stack.

**Input:** "Creating a workspace whose slug is already taken."
**Output:** Catch the unique-constraint violation on insert (the DB index is the source of truth —
no racy pre-check) and throw `new TRPCError({ code: "CONFLICT", message: "That slug is taken",
cause: dbError })`. The `cause` is logged server-side only; the client narrows
`err.data?.code === "CONFLICT"` and maps the message to the `slug` field via `rhf-advanced`.

**Input:** "A downstream DB call throws unexpectedly mid-mutation."
**Output:** It surfaces as `INTERNAL_SERVER_ERROR`; the formatter masks the message to "Something
went wrong" plus a `correlationId`, and the real stack is logged server-side via `log-discipline`.
The client renders the generic message and the id (so support can trace it), never the trace (Rule 9).

---

## Edge Cases

- **A webhook (Clerk/Stripe) handler, not a tRPC procedure** → it returns HTTP status codes
  directly, not a `TRPCError`, and is outside the formatter; still Zod-parse the body (Rule 8) and
  mask internals. Map equivalently (401/404/409) but do not force it through the tRPC shape.
- **The user is authenticated and the resource is visibly theirs, but the action is denied**
  (e.g. a read-only collaborator editing) → `FORBIDDEN` is correct here; `NOT_FOUND` is reserved
  for the not-owned / invisible case. Document which resources are "visible-but-denied".
- **An upstream third party fails** (payment provider 5xx) → never pass its raw error through;
  translate to a deliberate code (a 5xx like `BAD_GATEWAY`/`SERVICE_UNAVAILABLE` where your tRPC
  version exposes it, else `INTERNAL_SERVER_ERROR`; their `429` → `TOO_MANY_REQUESTS`) with a safe
  message, and log the upstream detail.

---

## References

- `references/code-taxonomy.md` — the canonical `TRPC_ERROR_CODE_KEY` set + HTTP-status mapping,
  when each primary code applies, the domain-failure → code mapping table, the not-owned-row
  (`NOT_FOUND` vs `FORBIDDEN`) policy, and throwing a typed `TRPCError` (`message` safe, `cause`
  internal) from the plain function.
- `references/error-shape-and-client.md` — shaping `error.data` in the single errorFormatter
  (expose `zodError` + `code`, strip `stack`/`cause`, mask `INTERNAL_SERVER_ERROR` with a
  correlation id), client narrowing of `TRPCClientError<AppRouter>` onto fields / `root.serverError`,
  and keeping the taxonomy documented next to `api-docs-from-trpc`.

## Scripts

`scripts/` is reserved. A signal that would justify one: a static check grepping `src/server` for
a `throw new Error(` / `throw "` on a procedure path (should be a `TRPCError`) and for an
errorFormatter that forwards `stack`/`cause` into the client shape — catching information
disclosure mechanically. The complementary *thrown-vs-documented* code drift check is owned by
`api-docs-from-trpc`'s CI gate, not duplicated here. Until the disclosure check recurs, script-free.
