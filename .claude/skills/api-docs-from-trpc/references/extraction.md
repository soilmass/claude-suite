Purpose: introspect the tRPC router and its shared Zod schemas to derive inputs, outputs, auth level, and error codes for each procedure — the generated facts the reference is built from.

# Enumerating procedures (tRPC v11)

`appRouter._def.procedures` is a flat map of dotted path -> procedure. It is the source of
truth for the procedure list; never hand-list procedures.

```ts
import { appRouter } from "@/server/api/root";
import type { AnyProcedure } from "@trpc/server";

const procedures = appRouter._def.procedures as Record<string, AnyProcedure>;

for (const [path, proc] of Object.entries(procedures)) {
  const def = proc._def;
  // def.type:    "query" | "mutation" | "subscription"
  // def.inputs:  ZodType[]   (one per chained .input(); merge for the effective shape)
  // def.output:  ZodType | undefined   (set only when .output(...) was declared)
  // def.meta:    your meta object (auth flags, openapi metadata) if you attach meta
}
```

Notes:
- `def.inputs` is an array because `.input()` can be chained; the effective input is the
  intersection/merge of them. In practice procedures use one shared schema (the
  `zod-schema-library` contract) — read `def.inputs[0]`.
- `def.type` maps to HTTP intent for OpenAPI: `query` -> GET, `mutation` -> POST.
- Subscriptions are not used on the edge HTTP stack; flag any you find.

# Auth level from the builder

The decided stack uses exactly two base procedures (`../../CLAUDE.md`): `publicProcedure` and
`protectedProcedure`. `protectedProcedure` adds a middleware that throws `UNAUTHORIZED` when
`ctx.auth.userId` is absent. Determine the level by which base builder a procedure was built
from. The cleanest signal is an explicit meta flag set at definition time:

```ts
// in the procedure builders
export const protectedProcedure = t.procedure
  .meta({ auth: "protected" })
  .use(enforceUserIsAuthed);
export const publicProcedure = t.procedure.meta({ auth: "public" });
```

Then read `proc._def.meta?.auth` per procedure. If meta is not used, fall back to inspecting
the middleware list (`def.middlewares`) for the auth middleware — but adding the meta flag is
the reliable, documentable approach; record it in `DECISIONS.md`.

## Documenting the ownership contract (Rule 2)

`protected` is necessary but not sufficient. For a procedure over a user-owned row, the doc
must state it is scoped to the caller (`ctx.auth.userId`) and that requesting another user's
row returns **`NOT_FOUND`**, not `FORBIDDEN` — returning `NOT_FOUND` avoids leaking that the
row exists. Read the procedure's plain function to confirm the ownership predicate before
writing this; do not assume it from the `protectedProcedure` label alone.

# Deriving the input shape from Zod

Render the input from the actual schema, not prose. `zod-to-json-schema` produces a stable,
publishable shape that captures types, optionality, enums, min/max, and descriptions:

```ts
import { zodToJsonSchema } from "zod-to-json-schema";

const inputSchema = proc._def.inputs[0];           // the shared Zod schema
const json = inputSchema
  ? zodToJsonSchema(inputSchema, { target: "openApi3" })
  : { note: "no input" };
```

Carry Zod `.describe("...")` text through to field docs — annotate the schema in
`zod-schema-library`, surface it here. For money fields, the schema is integer minor units
(Rule 5): document the unit ("amount in cents") explicitly. For timestamps, the wire type is
an ISO string in UTC (Rule 6): document `format: date-time, UTC`.

# Naming the output shape

Outputs trace to Drizzle inference (Rule 1). Prefer the inferred router output type so the doc
cannot diverge from what the procedure returns:

```ts
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";

type Outputs = inferRouterOutputs<AppRouter>;
type PostByIdOutput = Outputs["post"]["byId"]; // exact returned shape
```

For a machine-readable output schema, declare `.output(someZodSchema)` on procedures whose
consumers need it and render that with `zod-to-json-schema`. Where `.output()` is absent,
document the TypeScript type from `inferRouterOutputs` (it is the contract the client sees).

# Enumerating error codes

A procedure can surface errors from three sources; document all that apply, none that do not:

1. **Framework auth:** `protectedProcedure` throws `UNAUTHORIZED` when unauthenticated.
2. **Input validation:** a failed `.input()` parse throws `BAD_REQUEST` (Rule 8) — document it
   for every procedure that takes an input.
3. **Business logic:** grep the procedure's plain function for `new TRPCError({ code: ... })`.
   Common: `NOT_FOUND` (missing or not-owned row, Rule 2), `CONFLICT` (uniqueness),
   `FORBIDDEN` (explicit deny), `TOO_MANY_REQUESTS` (rate limit).

The canonical set is tRPC's `TRPC_ERROR_CODE_KEY`. Do not copy an error table from another API;
list only codes a given procedure's code path can raise.

```bash
# find thrown codes for a router's functions
grep -rEo "new TRPCError\(\{[^}]*code:\s*\"[A-Z_]+\"" src/server | sort -u
```
