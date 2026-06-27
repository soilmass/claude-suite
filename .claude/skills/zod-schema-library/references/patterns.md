Purpose: the core Zod patterns for shared schemas — refinements, transforms/coercion, branded types, money/time, the input-vs-parsed split, and the share-both-ends export. Cite rule numbers from ../../CLAUDE.md; never restate rule text.

## One module, one symbol, two consumers

Put one file per entity under `src/schemas/`. Each operation gets one exported schema and one
exported inferred type. The procedure and the form import the **same** symbol.

```ts
// src/schemas/product.ts
import { z } from "zod";

export const productCreateSchema = z.object({
  name: z.string().min(1).max(120),
  priceCents: z.number().int().nonnegative(), // Rule 5: minor units, never float dollars
  salePriceCents: z.number().int().nonnegative().optional(),
}).superRefine((v, ctx) => {
  if (v.salePriceCents !== undefined && v.salePriceCents >= v.priceCents) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Sale price must be below price",
      path: ["salePriceCents"], // RHF maps this to the field, not a form-level error
    });
  }
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>; // Rule 1: inferred, not hand-typed
```

```ts
// procedure side — src/server/api/routers/product.ts
.input(productCreateSchema) // same symbol
```

```ts
// form side — feature component
const form = useForm<ProductCreateInput>({ resolver: zodResolver(productCreateSchema) });
```

## Subset, not a parallel schema

When the form needs fewer fields than the procedure, derive — do not re-author.

```ts
export const productNameOnlySchema = productCreateSchema.pick({ name: true });
```

## Refinements

- `.refine` for a single-field predicate; `.superRefine` for cross-field or multiple issues.
- Always set `path` so React Hook Form attributes the message to the right field.
- Keep refinements **synchronous** at the edge. Uniqueness / existence checks that need the
  DB belong in the procedure's plain function and surface as a `TRPCError`, not an async
  `.refine` (an async refinement adds a round trip per validation on the edge runtime).

## Coercion at the boundary (Rule 8)

Every external input is parsed before use — not just tRPC inputs. Route params, `searchParams`,
webhook bodies, and env vars all get a schema.

```ts
// src/schemas/product.ts
export const productListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  status: z.enum(["draft", "active", "archived"]).optional(),
});

// server component
const { page, status } = productListQuerySchema.parse({
  page: searchParams.page,
  status: searchParams.status,
});
```

```ts
// env — parse once at module load, export the typed object (Rule 8 + Rule 9)
export const env = z.object({
  DATABASE_URL: z.string().url(),
  CLERK_SECRET_KEY: z.string().min(1), // server-only; never NEXT_PUBLIC_*
}).parse(process.env);
```

## Transforms and the input-vs-parsed split

A `.transform()` changes the inferred **output** type. If the form must render the input
shape but the server wants a transformed shape, export two symbols from the same module
instead of forking files.

```ts
export const emailInputSchema = z.object({ email: z.string().email() });
export const emailParsedSchema = emailInputSchema.transform((v) => ({
  email: v.email.trim().toLowerCase(),
}));

export type EmailInput = z.infer<typeof emailInputSchema>;   // form/wire shape
export type EmailParsed = z.infer<typeof emailParsedSchema>; // server-normalized shape
```

Do not cast a transform's result with `as` to satisfy the form — that breaks Rule 1.

## Branded types (Rule 1 reinforcement)

Brand IDs and money so a raw `string`/`number` can't be passed where a typed one is required.

```ts
export const userId = z.string().uuid().brand<"UserId">();
export const orgId = z.string().uuid().brand<"OrgId">();
export type UserId = z.infer<typeof userId>;

// downstream signatures take the branded type
function loadFor(id: UserId) { /* an OrgId or raw string won't type-check */ }
```

Record a branding convention you introduce in `DECISIONS.md`.

## Money and time

- Money: `z.number().int().nonnegative()` minor units, or `z.number().int().brand<"Cents">()`.
  Never `z.number()` for dollars (Rule 5).
- Time across the wire: accept an ISO string, coerce to `Date`, store UTC `timestamptz`,
  convert at display only (Rule 6).

```ts
occurredAt: z.coerce.date(), // accepts ISO string, yields Date; stored as timestamptz UTC
```
