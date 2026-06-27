Purpose: how to name cache tags/paths and wire `revalidateTag`/`revalidatePath` into tRPC mutations, Server Actions, and webhooks so reads are never stale after a write and never cross users.

# Tag naming — pair read tags to write tags deliberately

A tag is a contract between a read and the mutations that invalidate it. Name them so the
pairing is obvious and ownership (Rule 2) is encoded in the tag itself.

| Data | Read tag | Invalidated by |
| --- | --- | --- |
| One user's notes list | `notes:${userId}` | that user's create/update/delete note |
| A single note detail | `note:${noteId}` | update/delete of that note |
| Public pricing | `pricing` | admin price change, webhook |
| Org-shared resource | `org:${orgId}:projects` | any member's mutation in that org |

Rule: **per-user data gets a user-scoped tag, never a bare entity tag.** A bare `notes` tag on
a per-user read means any user's mutation revalidates everyone — and worse, a static cache
under it can serve one user's rows to another. That is Rule 2 failing at the cache layer.

# Wiring into a tRPC mutation

`revalidateTag`/`revalidatePath` are server-only and run after the write commits. Keep the
procedure thin (CLAUDE.md): validate (Rule 8) → authorize + ownership (Rule 2) → write →
revalidate.

```ts
import { revalidateTag } from "next/cache";
import { createNoteInput } from "@/lib/schemas/note"; // ONE shared Zod schema

export const noteRouter = createTRPCRouter({
  create: protectedProcedure
    .input(createNoteInput)                       // Rule 8
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.auth.userId;             // Rule 2 scope
      const [note] = await ctx.db
        .insert(notes)
        .values({ ...input, userId })
        .returning();
      revalidateTag(`notes:${userId}`);           // pair to the read tag
      return note;
    }),

  update: protectedProcedure
    .input(updateNoteInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.auth.userId;
      // ownership enforced in the WHERE, not just protectedProcedure (Rule 2)
      const [note] = await ctx.db
        .update(notes)
        .set(input.patch)
        .where(and(eq(notes.id, input.id), eq(notes.userId, userId)))
        .returning();
      if (!note) throw new TRPCError({ code: "NOT_FOUND" }); // ownership miss == not found
      revalidateTag(`notes:${userId}`);
      revalidateTag(`note:${input.id}`);
      return note;
    }),
});
```

# Wiring into a Server Action

```ts
"use server";
import { revalidatePath, revalidateTag } from "next/cache";

export async function deleteNote(formData: FormData) {
  const { userId } = auth();
  if (!userId) throw new Error("UNAUTHENTICATED");
  const id = deleteNoteInput.parse({ id: formData.get("id") }); // Rule 8
  await db.delete(notes).where(and(eq(notes.id, id.id), eq(notes.userId, userId))); // Rule 2
  revalidateTag(`notes:${userId}`);
  revalidatePath("/dashboard/notes");
}
```

`revalidatePath` is coarser (a whole route) and useful when you don't have a granular tag;
prefer tags for per-user data so you don't over-invalidate other users' cached routes.

# Webhook invalidation

A webhook changes data many users read. Validate the body first (Rule 8), then invalidate the
shared entity tag from the route handler:

```ts
// app/api/webhooks/price/route.ts
export async function POST(req: Request) {
  const event = priceWebhookSchema.parse(await req.json()); // Rule 8 + verify signature first
  await applyPriceChange(event);
  revalidateTag("pricing");
  return NextResponse.json({ ok: true });
}
```

# Common mistakes

- Calling `revalidateTag` *before* the write commits — invalidates, then the stale read can
  repopulate the cache. Always revalidate after the write resolves.
- Tagging the read but forgetting to tag-match in the mutation — read never refreshes.
- A bare entity tag on per-user data — over-invalidation and a Rule 2 leak risk.
- Revalidating from a Client Component — these APIs are server-only; call them in the
  server action / procedure / route handler.
