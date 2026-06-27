# Type chain: Drizzle → Zod → tRPC → RHF → component

The whole point of the stack is that types flow from one root so a change at the root
surfaces everywhere. The root is **Drizzle's inferred types**. Never re-declare a shape
by hand that you could infer.

## 1. Root: Drizzle inference

```ts
// src/db/schema/projects.ts
import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),       // UUIDv7 in practice; see CLAUDE.md IDs
  ownerId: uuid("owner_id").notNull(),               // FK -> users.id, indexed
  name: varchar("name", { length: 120 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Project = typeof projects.$inferSelect;       // read shape
export type NewProject = typeof projects.$inferInsert;     // write shape
```

`Project` / `NewProject` are the root. Everything else derives from or agrees with them.

## 2. Shared Zod schema (one object, both sides)

Author the operation schema once. Keep it in a shared module imported by BOTH the tRPC
input and the form resolver — never two copies.

```ts
// src/features/projects/schema.ts
import { z } from "zod";

export const renameProjectSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(120),
});
export type RenameProjectInput = z.infer<typeof renameProjectSchema>;
```

If you want the Zod shape to track the Drizzle columns automatically, use
`drizzle-zod`'s `createInsertSchema(projects)` and refine, rather than hand-writing
fields that can drift from the table.

## 3. tRPC procedure consumes the shared schema

```ts
// thin: validate -> authorize (ownership) -> call function -> return
export const projectsRouter = createTRPCRouter({
  rename: protectedProcedure
    .input(renameProjectSchema)
    .mutation(async ({ ctx, input }) => {
      await assertOwnsProject(ctx, input.projectId); // ownership check — REQUIRED
      return renameProject(input);                   // logic lives in the function
    }),
});
```

## 4. Form consumes the SAME schema

```ts
const form = useForm<RenameProjectInput>({
  resolver: zodResolver(renameProjectSchema),         // identical object, no second copy
});
```

## 5. Component reads inferred output types

The component's data types come from the tRPC router's inferred output
(`inferRouterOutputs`), not from hand-written interfaces. A change at the Drizzle root
now propagates: column rename → `$inferSelect` changes → router output type changes →
component fails to compile at the exact site that needs updating. That compiler signal is
the spine `refactor` relies on; do not sever it with `any`.
