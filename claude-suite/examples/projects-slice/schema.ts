import { pgTable, uuid, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { z } from "zod";

// Root of the type chain (Rule 1): Drizzle inference.
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(), // UUIDv7 in practice
    ownerId: varchar("owner_id", { length: 64 }).notNull(), // Clerk userId
    name: varchar("name", { length: 120 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index("projects_owner_id_idx").on(t.ownerId), // Rule 7 / index every filtered FK
  }),
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

// One shared Zod schema per operation (Rule 8), imported by both procedure and form.
export const createProjectSchema = z.object({
  name: z.string().min(1).max(120).trim(),
});
export const renameProjectSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(120).trim(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type RenameProjectInput = z.infer<typeof renameProjectSchema>;
