Purpose: derive Zod schemas from Drizzle columns with drizzle-zod so the type chain stays rooted in inference (Rule 1) instead of restating columns by hand. Cite rule numbers from ../../CLAUDE.md; never restate rule text.

## Why derive instead of restate

Rule 1 says the type chain is rooted in Drizzle inference. Re-authoring a `z.object` that
restates table columns creates a second source of truth that drifts from the schema. Generate
the base schema from the table, then narrow to the operation's surface.

## createInsertSchema / createSelectSchema

```ts
// src/schemas/product.ts
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { products } from "@/db/schema/products";

// base, mirrors the table
const productInsert = createInsertSchema(products, {
  // override per-column where the DB type isn't the validation you want
  priceCents: (s) => s.int().nonnegative(),         // Rule 5
  name: (s) => s.min(1).max(120),
});

// narrow to the create surface: server fills these, the client must not send them
export const productCreateSchema = productInsert.omit({
  id: true,
  createdAt: true,   // Rule 6: server stamps timestamptz, not the client
  updatedAt: true,
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
```

```ts
// read-side shape for responses / typed client cache
export const productSelectSchema = createSelectSchema(products);
export type Product = z.infer<typeof productSelectSchema>;
```

## pick / omit / extend

- `.omit()` server-controlled columns (`id`, `createdAt`, `updatedAt`, `userId` set from
  `ctx.auth.userId` — never trust a client-supplied owner; ties to Rule 2 ownership).
- `.pick()` the subset a partial form needs.
- `.extend()` to add a non-column field (e.g. a confirm field, a captcha token) or to tighten
  a generated column rather than dropping to a hand-written object.

```ts
export const productUpdateSchema = productCreateSchema.partial().extend({
  id: z.string().uuid(), // the row to update; ownership re-checked in the procedure (Rule 2)
});
```

## Ownership note

Do not put `userId`/`orgId` in the **client-facing** create/update schema. The server sets
the owner from `ctx.auth.userId` and re-checks ownership on update/delete (Rule 2). A schema
that accepts a client-supplied owner invites an IDOR.

## When drizzle-zod's type fights you

If a custom column type (a `jsonb` shape, a custom enum) produces a `z.unknown()` or an
awkward inferred type, `.extend` the generated schema with a precise sub-schema rather than
abandoning generation for a hand-written `z.object` (which re-introduces drift and risks
Rule 1). Keep the generated base; refine the one field.

## Version note

drizzle-zod tracks Drizzle and Zod versions; the `(s) => s.method()` refinement callback
signature has shifted across releases. If the override callbacks don't type-check, verify the
installed drizzle-zod version and let `perishable-refresh` flag the standing.
