---
name: api-docs-from-trpc
description: >
  Generate an API reference from the tRPC routers and their shared Zod schemas: per-procedure
  inputs, outputs, auth level, and error codes, derived from the code rather than hand-written
  so the reference cannot drift from what ships. Roots input docs in the same Zod schema the
  procedure validates with, marks each procedure public vs protected (and notes the ownership
  check Rule 2 requires), enumerates the TRPCError codes a procedure can throw, and wires a CI
  drift check so a router change that outruns its docs fails the build. The reference is a
  projection of the code, never a parallel copy of it.
  Use when: "api docs", "document the api", "reference docs", "document the endpoints".
  Do NOT use for: prose guides, tutorials, or conceptual walkthroughs (use technical-writing),
  or authoring/altering the Zod schemas themselves (use zod-schema-library).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the drifting-docs failure class: hand-written API reference
    that lies about inputs, auth, and errors the moment a procedure changes.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# api-docs-from-trpc

Project an API reference out of the tRPC routers and their shared Zod schemas, so inputs,
outputs, auth, and errors are read from the code instead of retyped. See `../../CLAUDE.md` for
the spine (thin procedures, one shared Zod schema per operation) — this skill documents that
contract; it does not change it. The failure it prevents is a reference that drifts: docs that
still claim an old input shape, the wrong auth level, or errors the procedure no longer throws.

## When to Use

- You need a reference for the existing tRPC surface: routers, procedures, inputs, outputs,
  auth, and error codes.
- A router changed (a procedure added, an input field added, an error code introduced) and the
  reference must catch up.
- You want a CI gate that fails when the routers and the published reference disagree.
- You need an OpenAPI/JSON artifact for an external consumer of the tRPC API.

## When NOT to Use

- Writing prose guides, quickstarts, or conceptual docs: use **technical-writing**; this skill
  emits structured per-procedure reference, not narrative.
- Authoring or refining the Zod schemas an input is built from: use **zod-schema-library**;
  this skill consumes those schemas, it does not write them.
- Composing or splitting the routers themselves: use **trpc-router-compose**.
- Documenting a Next.js Server Action surface (not tRPC): use **technical-writing** with
  **nextjs-server-actions** for the underlying shape.

## Procedure

1. **Enumerate the procedures from the router, not from memory (low).** Walk `appRouter._def`
   (tRPC v11: `appRouter._def.procedures` is a flat `path -> procedure` map) or import each
   sub-router. The procedure list is generated; never typed by hand. See `references/extraction.md`.
2. **Derive each input from its actual Zod schema (medium).** Read the schema passed to
   `.input(...)` — the same shared schema `zod-schema-library` owns (Rule 8). Render its fields,
   types, optionality, and constraints; do not paraphrase. `zod-to-json-schema` gives a stable,
   machine-readable shape. See `references/extraction.md`.
3. **Capture the output shape from the inferred return type (medium).** Outputs trace back to
   Drizzle inference (Rule 1). Use `inferRouterOutputs<AppRouter>` to name the return type, or a
   declared `.output()` schema where one exists. Note money as minor units (Rule 5) and
   timestamps as UTC ISO strings (Rule 6) so consumers parse them right.
4. **State auth level and the ownership contract (high — wrong here misleads integrators).**
   Mark each procedure `public` or `protected` from its builder. For a `protectedProcedure` over
   a user-owned row, document that it is scoped to the caller (Rule 2) and returns `NOT_FOUND`
   (not `FORBIDDEN`) for another user's row — do not invent an auth story the code does not back.
   See `references/extraction.md`.
5. **Enumerate the error codes each procedure can throw (medium).** Grep the procedure's plain
   function for `TRPCError({ code })` and the framework codes (`UNAUTHORIZED` from
   `protectedProcedure`, `BAD_REQUEST` from input validation). List the canonical `TRPC_ERROR_CODE`
   set; never document an error the code cannot raise. See `references/extraction.md`.
6. **Redact, never expose, server-only detail (high).** The reference is publishable surface:
   no secrets, no `NEXT_PUBLIC_`-vs-server confusion, no internal env names or connection strings
   (Rule 9). Document the request contract, not the implementation. See `references/openapi.md`.
7. **Wire the sync gate so docs cannot silently drift (medium).** Regenerate into a committed
   artifact and diff it in CI; a stale reference fails the build. Optionally emit OpenAPI via
   `trpc-to-openapi` for external consumers. Record the chosen pipeline in `DECISIONS.md`. See
   `references/openapi.md`.

## Composes With

- **Consumes:** `zod-schema-library` (the input schemas every procedure doc is derived from),
  `trpc-router-compose` (the router tree being enumerated).
- **Pairs with:** `technical-writing` (the prose guides that sit alongside the generated reference).
- **Runs against:** the `appRouter` and `src/schemas/`.
- **Hands off:** `security-pass` to confirm the published reference leaks no server-only detail
  (Rule 9), and `perishable-refresh` when documented tool/spec versions date.

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> This is the encoded failure *class*, not a captured transcript. Replace it with a real
> transcript once one is observed.

**Failure class encoded:** Without this skill, a hand-written API reference tends to ship with:

- an input section retyped from memory that omits a field added to the Zod schema last week, so
  integrators send payloads the procedure rejects (drift from the shared schema, Rule 8).
- every endpoint labeled "requires auth" with no distinction between `publicProcedure` and
  `protectedProcedure`, and no mention that a protected, user-owned read returns `NOT_FOUND`
  for someone else's row (Rule 2).
- an error table copied from another API listing codes the procedure never throws, and missing
  the `BAD_REQUEST` that input validation actually raises.
- money documented as a decimal "price" and timestamps as "date" with no timezone, so consumers
  mis-handle cents and local time (Rules 5, 6).
- a server-only env var or internal table name pasted into an example payload (Rule 9).
- no regeneration step, so the reference is correct the day it is written and wrong by the next
  router change.

## Examples

**Input:** "Document the `post` router." → **Output:** a per-procedure reference: `post.create`
(protected, input = `postCreateSchema` rendered field-by-field from the shared schema, output =
`inferRouterOutputs<AppRouter>["post"]["create"]`, errors = `UNAUTHORIZED | BAD_REQUEST`),
`post.byId` (protected, scoped to caller, errors include `NOT_FOUND` for another user's row per
Rule 2), `post.list` (public, cursor input documented), each marked public/protected from its
builder — the procedure list generated from `appRouter._def.procedures`, not hand-listed.

**Input:** "We added a `tags: string[]` field to create a post; update the docs." → **Output:**
re-derive `post.create`'s input from the now-changed `postCreateSchema`; the regenerated artifact
diffs against the committed one, the CI sync gate flags the stale reference, and the new `tags`
field appears with its Zod constraints — no manual edit to the input table.

**Input:** "An external partner needs a machine-readable spec." → **Output:** annotate the
procedures with `trpc-to-openapi` metadata and emit an OpenAPI 3 document; money fields carry
`format: int64` minor-units notes (Rule 5), timestamps `format: date-time` UTC (Rule 6), and the
spec is generated in CI alongside the human reference from the same router.

## Edge Cases

- When a procedure uses `.input()` with an inline `z.object(...)` instead of a shared schema →
  document it, but flag it to `zod-schema-library` to extract; inline input is drift waiting to
  happen.
- When the output type is a deep Drizzle relational result → document the relation shape from the
  inferred type, not a flattened guess; link the relevant `drizzle-relational-queries` doc rather
  than restating every joined column.
- When a `protectedProcedure` legitimately returns another user's data (a public profile) → say so
  explicitly and note why it is not a Rule 2 violation, so the doc does not look like a leak.
- When money or time fields appear → always document unit and timezone (minor units, UTC ISO);
  a bare "amount" or "date" is the defect Rules 5 and 6 exist to stop.

## References

- `references/extraction.md` — introspecting `appRouter._def.procedures`, deriving inputs from
  Zod via `zod-to-json-schema`, naming outputs with `inferRouterOutputs`, reading auth from the
  builder, and enumerating `TRPCError` codes — with code.
- `references/openapi.md` — emitting OpenAPI with `trpc-to-openapi`, rendering the human
  reference, the CI drift/sync gate, and the Rule 9 redaction checklist.

## Scripts

Reserved; empty for now. A generator that walks `appRouter._def.procedures` and writes the
reference + OpenAPI artifact would justify one once the router export path is fixed across
projects (it would exit non-zero when the committed artifact is stale, feeding the CI gate).
