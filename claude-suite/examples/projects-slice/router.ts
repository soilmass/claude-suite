import { eq, desc, and, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  projects,
  createProjectSchema,
  renameProjectSchema,
  type Project,
} from "./schema";

type Ctx = { db: NodePgDatabase; auth: { userId: string } };

// Ownership check (Rule 2): the row must belong to the caller.
async function assertOwnsProject(ctx: Ctx, projectId: string) {
  const [row] = await ctx.db
    .select({ ownerId: projects.ownerId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row || row.ownerId !== ctx.auth.userId) {
    throw new TRPCError({ code: "NOT_FOUND" }); // do not leak existence
  }
}

export const projectRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }): Promise<Project[]> => {
    // Single query, scoped by owner (Rule 2 at collection level; no N+1 Rule 7).
    return ctx.db
      .select()
      .from(projects)
      .where(eq(projects.ownerId, ctx.auth.userId))
      .orderBy(desc(projects.createdAt));
  }),

  create: protectedProcedure
    .input(createProjectSchema)
    .mutation(async ({ ctx, input }): Promise<Project> => {
      const [row] = await ctx.db
        .insert(projects)
        .values({ name: input.name, ownerId: ctx.auth.userId }) // ownerId server-set, not from input
        .returning();
      return row;
    }),

  rename: protectedProcedure
    .input(renameProjectSchema)
    .mutation(async ({ ctx, input }): Promise<Project> => {
      await assertOwnsProject(ctx, input.projectId); // authorize before mutate
      const [row] = await ctx.db
        .update(projects)
        .set({ name: input.name, updatedAt: new Date() })
        .where(and(eq(projects.id, input.projectId), eq(projects.ownerId, ctx.auth.userId)))
        .returning();
      return row;
    }),
});

// Batch-load helper to demonstrate avoiding N+1 (Rule 7).
export async function projectsByIds(ctx: Ctx, ids: string[]) {
  return ctx.db.select().from(projects).where(inArray(projects.id, ids));
}
