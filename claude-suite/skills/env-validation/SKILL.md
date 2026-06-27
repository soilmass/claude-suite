---
name: env-validation
description: >
  Build the Zod-validated environment boundary (t3-env / `@t3-oss/env-nextjs` style): a
  single typed `env` object with a strict server-vs-`NEXT_PUBLIC_` split, parsed once at the
  module boundary so a missing or malformed variable fails the build, not a production
  request. Enforces Rule 8 (every external input Zod-parsed — env is external input) and
  Rule 9 (no secret ever crosses into the client bundle). Replaces scattered raw
  `process.env.FOO!` access with one importable, inference-typed source.
  Use when: "validate env", "environment variables", "t3-env", "env schema", "NEXT_PUBLIC".
  Do NOT use for: scanning a repo for leaked/committed secrets (use secret-scan), or the
  feature-level abuse/threat review (use security-pass).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the "unvalidated env that crashes in production / leaks a
    secret to the client" failure class.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# env-validation

Environment variables are an external boundary like any tRPC input or webhook body, and at
the edge a bad one surfaces as a runtime crash in someone's request rather than a failed
build. This skill stands up the single `env` module (t3-env `createEnv`) that Zod-parses
every variable once, splits server secrets from `NEXT_PUBLIC_` client values, and is imported
into `next.config` so the validation runs at build time. It is the concrete enforcement of
Rules 8 and 9 from `../../CLAUDE.md`; it does not restate them.

## Non-Negotiable Rules
- **Never** read `process.env.X` directly in app code — import from the validated `env`
  module. The raw object is `string | undefined` and untyped (breaks Rules 1 and 8).
- **Never** put a secret in the `client` block or behind a `NEXT_PUBLIC_` prefix. Anything
  client-side is shipped to the browser bundle in plaintext (Rule 9).
- **Never** use `!` (`process.env.X!`) or `as string` to silence a missing-var type error —
  that asserts away the exact boundary check this skill exists to make.
- **Never** disable validation (`SKIP_ENV_VALIDATION`) on a real deploy; it is a Docker
  build-layer escape hatch only, recorded in `DECISIONS.md` if used in CI.

Refuse these rationalizations: "it's just a feature flag so NEXT_PUBLIC is fine", "the var is
always set in prod so the `!` is safe", "I'll Zod-parse it later", "skipping validation makes
the build faster".

## When to Use
- Standing up the env layer in a new project, or a variable is read with raw `process.env`.
- Adding any new variable (API key, DB URL, public flag) — it must enter the schema.
- Deciding whether a value is a server secret or a `NEXT_PUBLIC_` client value.
- A deploy crashes on a missing/empty variable that should have failed the build.

## When NOT to Use
- Detecting secrets accidentally committed to git or printed in logs → `secret-scan`.
- The "how would this be abused" threat-model and header review → `security-pass`.
- Validating request/route/webhook inputs (not env) → `zod-schema-library` + `trpc-middleware`.
- Scaffolding the whole project where this layer is one step → `t3-genesis` (it calls this).

## Procedure

1. **Inventory every variable and classify server vs client (high cost — misclass, leaks a
   secret).** List each var; for each ask "does the browser need this at runtime?" If no, it
   is a `server` var with no prefix. If yes, it MUST be `NEXT_PUBLIC_`-prefixed and contain
   nothing sensitive (Rule 9). When unsure, it is a server var. See the server/client
   classification checklist in `references/env-patterns.md`.

2. **Author the Zod shape per variable (medium cost).** Strings get `z.string().min(1)` or
   `.url()`; ports/numbers use `z.coerce.number()` (env is always strings); `NODE_ENV` is a
   `z.enum`. Validate the *meaning*, not just presence — a malformed URL should fail too
   (Rule 8). Patterns in `references/env-patterns.md`.

3. **Build the single `env.ts` with `createEnv` (medium cost).** Define `server`, `client`,
   and `runtimeEnv` mapping; set `clientPrefix: "NEXT_PUBLIC_"` and
   `emptyStringAsUndefined: true` so a blank var is treated as missing. This module is the
   only thing app code imports for config. Full config in `references/t3-env-setup.md`.

4. **Wire validation into the build (high cost — this is what makes it fail-fast).** Import
   `./src/env` at the top of `next.config.ts` (via `jiti` or `await import`) so `next build`
   evaluates the schema and aborts on a bad value, instead of deferring the crash to an edge
   request. See `references/t3-env-setup.md`.

5. **Replace every raw `process.env` access (medium cost).** Grep the codebase; swap each to
   `import { env } from "@/env"`. Confirm no server key is imported into a Client Component or
   anything `NEXT_PUBLIC_`-shaped (Rule 9). Document `.env.example` with every key, no values.

6. **Mind the edge inlining constraint (medium cost).** Next inlines `process.env.NEXT_PUBLIC_*`
   at build by static analysis, so `runtimeEnv` must reference each one *literally*
   (`NEXT_PUBLIC_X: process.env.NEXT_PUBLIC_X`), never spread or computed. Edge routes cannot
   read a client var that wasn't statically present. Detailed in `references/t3-env-setup.md`.

## Composes With
- **Pairs with:** `secret-scan` (it finds leaked/committed secrets; this skill keeps secrets
  off the client at the boundary), `security-pass` (env review is part of the threat pass).
- **Feeds:** `t3-genesis` — genesis seeds the env layer this skill defines; new vars added by
  `vertical-slice` re-enter through here.
- **Pairs with:** `edge-runtime-constraints` for the edge env-inlining rule.

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent told to implement as
> a typical dev would, with no project conventions). The encoded failure class was confirmed.

**Observed run.** Prompt: "wire up the DB connection and a client-callable API base from env vars". With no skill the agent produced:

```ts
// src/db/index.ts
const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql);

// src/lib/api.ts
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL!;
export async function fetchThings() {
  const res = await fetch(`${API_BASE_URL}/things`);
  return res.json(); // : any
}
```

Its own note: *"Accessed both env vars directly via process.env with a non-null assertion, and exposed the public API base via a NEXT_PUBLIC_ var so it's available client-side."* — this violates Rule 8 (env is an external input, here read raw with no Zod validation or `createEnv`) and Rule 1 (the `!` assertion and the untyped `res.json()` both break the type chain), and it bites because a missing var surfaces as an opaque runtime crash on an edge request instead of a failed build.

**Failure class (confirmed).** Reaching for `process.env.X!` treats the environment as trusted and typed when it is neither, so misconfiguration is only caught when that code path runs in production rather than at build/startup. The same instinct skips validating the network-boundary response (`res.json()` as `any`), compounding the broken type chain. This skill replaces scattered raw access with one Zod-parsed `env` module validated once at the build boundary.

## Examples

**Input:** "Add `DATABASE_URL`, `CLERK_SECRET_KEY`, and `NEXT_PUBLIC_POSTHOG_KEY`."
**Output:** First two go in `server` (`z.string().url()` and `z.string().min(1)`); the PostHog
key goes in `client` under the `NEXT_PUBLIC_` prefix. `runtimeEnv` maps all three literally.
`env.ts` exports the typed object; routes import `env.DATABASE_URL`. `.env.example` updated.

**Input:** "The build passes but production throws `invalid connection string` at the edge."
**Output:** `DATABASE_URL` was read raw and never validated. Add it to the `server` schema as
`z.string().url()`, import `./src/env` in `next.config.ts`, and the malformed value now fails
`next build` (Rule 8 satisfied at the boundary, not the request).

**Input:** "We need a client-visible feature flag `ENABLE_BETA`."
**Output:** Rename to `NEXT_PUBLIC_ENABLE_BETA`, add to `client` as
`z.enum(["true","false"]).transform((v) => v === "true")`, map it literally in `runtimeEnv`.
Confirm no secret rides along (Rule 9).

## Edge Cases
- **Dockerfile builds before env is injected** → set `SKIP_ENV_VALIDATION=1` for that build
  layer only and record it in `DECISIONS.md`; never skip in the running container.
- **A var is needed in `middleware.ts` (always edge)** → it must be statically present at
  build; dynamic/computed `runtimeEnv` entries won't be inlined → see `edge-runtime-constraints`.
- **`T3_ENV` flag both server- and client-needed** → declare it twice (server name + a
  `NEXT_PUBLIC_` name); do not expose the server one to the client to "save a line" (Rule 9).
- **Empty string in `.env`** → `emptyStringAsUndefined: true` makes `FOO=` count as missing,
  so a `.min(1)` server var correctly fails rather than passing with `""`.

## References
- `references/t3-env-setup.md` — the full `createEnv` config, `runtimeEnv` mapping, the
  `next.config` build-time wiring, and the edge static-inlining constraint.
- `references/env-patterns.md` — per-type Zod patterns (coerce, url, enum, transform), the
  server/client classification checklist, and common mistakes.

## Scripts
`scripts/` reserved. A scanner that greps for raw `process.env.` outside the `env.ts` module
and flags any secret-looking key under a `NEXT_PUBLIC_` prefix would justify one once the
naming heuristics prove stable across real repos. Empty for now.
