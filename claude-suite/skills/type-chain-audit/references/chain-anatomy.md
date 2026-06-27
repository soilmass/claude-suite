Purpose: the canonical intact Drizzle → Zod → tRPC → RHF → component type chain shown end to end, with the parallel-chain anti-pattern at each hop so an auditor can see exactly where inference is meant to flow through versus around.

# The five hops

Inference must *flow through* each hop — the downstream type is **derived from** the upstream
one, never authored beside it. The root is always Drizzle inference (`../../CLAUDE.md`, spine).

```
src/db/schema/products.ts        →  Drizzle table (the root)
src/schemas/product.ts           →  Zod, derived via drizzle-zod
src/server/api/routers/product.ts→  tRPC .input() + return (inferred row)
src/trpc/react.ts (RouterOutputs)→  client-facing types, generated from the router
product-form.tsx / product-list.tsx → RHF resolver + component props
```

## Hop 1 — Drizzle table → Zod schema

Root the schema in the table; do not restate columns.

```ts
// src/db/schema/products.ts
export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),      // Rule 5: integer minor units
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), // Rule 6
});
export type Product = typeof products.$inferSelect;   // root of the chain

// src/schemas/product.ts
import { createInsertSchema } from "drizzle-zod";
export const productCreateSchema = createInsertSchema(products, {
  priceCents: (s) => s.int().nonnegative(),
}).omit({ id: true, createdAt: true });
export type ProductCreateInput = z.infer<typeof productCreateSchema>;
```

Break (parallel chain): `z.object({ name: z.string(), price: z.number() })` hand-written next
to the table — drifts the instant a column is added/renamed, and `price` floats money (Rule 5).

## Hop 2 — Zod schema → tRPC input/output

The procedure consumes the *same* schema symbol for `.input()` and returns the *inferred* row.

```ts
// src/server/api/routers/product.ts
create: protectedProcedure
  .input(productCreateSchema)                         // shared schema, not a copy
  .mutation(async ({ ctx, input }) => {
    const [row] = await ctx.db.insert(products)
      .values({ ...input, userId: ctx.auth.userId })  // Rule 2: ownership stamped
      .returning();
    return row;                                        // inferred Product, not a literal
  }),
byId: protectedProcedure
  .input(z.object({ id: z.string().uuid() }))
  .query(({ ctx, input }) => getOwnedProduct(ctx, input.id)), // Rule 2 in the fn
```

Break: `return { id: row.id, name: row.name } as Product` — an object literal asserted as the
row type. The output type now lies about what the data contains.

## Hop 3 — tRPC → client (RouterInputs / RouterOutputs)

The client derives its types from the router with tRPC's helpers; it declares nothing.

```ts
// src/trpc/react.ts
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
```

Break (the #1 silent break): a component declares `interface Product { id: string; name: string }`
that mirrors the row. Add a column → the router type updates, the interface does not → the new
field is `undefined` in the UI with zero compile error.

## Hop 4 — shared schema → React Hook Form

The form's generic and resolver both come from the same Zod schema.

```ts
const form = useForm<ProductCreateInput>({                 // z.infer type
  resolver: zodResolver(productCreateSchema),              // same schema
  defaultValues: { name: "", priceCents: 0 },
});
const create = api.product.create.useMutation();
const onSubmit = form.handleSubmit((values) => create.mutate(values)); // values already typed
```

Break: `create.mutate(values as ProductCreateInput)` — the cast absorbs any field the schema
renamed; the form keeps sending the stale shape.

## Hop 5 — query data → component props (all four states)

```tsx
const { data, isLoading, error } = api.product.byId.useQuery({ id });
if (isLoading) return <Skeleton />;        // Rule 4
if (error) return <ErrorState msg={error.message} />;
if (!data) return <EmptyState />;
return <ProductView product={data} />;     // data is Product, narrowed by the guards
```

Break: `const product = data!` — the non-null `!` erases the `undefined`/loading case the type
was protecting (Rule 1 break and a Rule 4 tell at once).

# The auditor's mental model

At every hop, point at the downstream type and ask: "does removing the upstream definition
cause this to fail to compile?" If yes, inference flows through — intact. If no, it is a
parallel chain that will drift — a break, even though today the shapes happen to match.
