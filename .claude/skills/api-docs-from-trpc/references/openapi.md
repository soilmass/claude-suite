Purpose: turn the extracted facts into published artifacts (OpenAPI + human reference), keep them from drifting via a CI sync gate, and redact server-only detail before anything ships.

# Emitting OpenAPI with trpc-to-openapi

`trpc-to-openapi` (the maintained successor to `trpc-openapi`) generates an OpenAPI 3 document
from procedures that carry `.meta({ openapi: ... })`. Attach the metadata at definition time so
the spec is generated, not maintained:

```ts
export const create = protectedProcedure
  .meta({ openapi: { method: "POST", path: "/posts", protect: true,
                     summary: "Create a post", tags: ["post"] } })
  .input(postCreateSchema)        // the shared Zod schema (zod-schema-library)
  .output(postSchema)             // declared output -> precise response schema
  .mutation(({ ctx, input }) => createPost(ctx, input));
```

```ts
import { generateOpenApiDocument } from "trpc-to-openapi";
import { appRouter } from "@/server/api/root";

export const openApiDocument = generateOpenApiDocument(appRouter, {
  title: "API reference",
  version: process.env.npm_package_version ?? "0.0.0",
  baseUrl: "https://example.com/api",
});
```

Edge note: the OpenAPI document is a build-time artifact, not a runtime route. Generate it in a
Node script during CI; do not add a heavy generation route to the edge runtime. If you also
expose REST handlers via the adapter, mount them deliberately — the tRPC client does not need
them. Record the decision to expose REST (or not) in `DECISIONS.md`.

Money/time in the spec: integer minor-unit fields use `type: integer, format: int64` with a
description naming the unit (Rule 5); timestamps use `type: string, format: date-time` and state
UTC (Rule 6). These flow automatically if the Zod schema is typed correctly upstream.

# Rendering the human reference

Render one section per procedure from the extracted facts:

```
### post.create   (mutation · protected)
Scoped to the authenticated caller (ctx.auth.userId). Rule 2: creating attaches the row to the
caller; reads/updates of another user's row return NOT_FOUND.

Input  — postCreateSchema
  title    string   1..200, required
  body     string   required
  tags     string[] optional, each 1..32

Output — inferRouterOutputs<AppRouter>["post"]["create"]  (the inserted row)

Errors — UNAUTHORIZED (not signed in) · BAD_REQUEST (input invalid) · CONFLICT (duplicate slug)
```

Keep public vs protected on the heading, the ownership note on protected user-owned procedures,
the input rendered from the schema, the output named from inference, and the error list limited
to codes the code path raises. Group by router; order procedures stably (alphabetical by path).

# CI sync gate (docs cannot drift)

Generate the reference and OpenAPI into committed files, then diff in CI. A stale artifact fails
the build — this is the mechanism that makes "kept in sync with code" true rather than aspirational.

```jsonc
// package.json
"scripts": {
  "docs:api": "tsx scripts/gen-api-docs.ts",        // writes docs/api/reference.md + openapi.json
  "docs:api:check": "tsx scripts/gen-api-docs.ts && git diff --exit-code docs/api"
}
```

```yaml
# CI step
- run: pnpm docs:api:check   # non-zero exit when generated output != committed output
```

The generator should exit non-zero when output differs from committed (per the suite convention:
exit code = number of stale files). This is the deterministic counterpart to the human reference
review; it catches the field-added-to-schema-but-not-docs case mechanically.

# Redaction checklist (Rule 9 — runs before publish)

The reference is publishable surface. Before it ships, confirm:

- No secret, API key, or token in any example payload or response.
- No server-only env var name, connection string, or internal host.
- No internal-only table or column name that is not part of the request/response contract.
- Example values are synthetic — never copied from a real ctx, real user, or real DB row.
- Error messages shown are the client-facing ones, not internal stack/SQL detail.
- `protectedProcedure`s that return another user's data on purpose (a public profile) are
  labeled as such, so the doc is not mistaken for a Rule 2 leak.

Hand the published artifact to `security-pass` for a second look before it goes external.
