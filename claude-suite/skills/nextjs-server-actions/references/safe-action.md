Purpose: the safe Server Action template — guard order, FormData coercion, typed return shape, revalidation, and progressive-enhancement form wiring.

# Guard order (never reorder)

1. **Auth** — `const { userId } = await auth()`; bail if null.
2. **Parse the boundary** — Zod `safeParse` the FormData into a typed object (rule 8).
3. **Ownership** — load the target row, confirm it belongs to `userId` (rule 2).
4. **Mutate** — Drizzle write via a plain function; correct money/time types (rules 5, 6).
5. **Revalidate / redirect** — refresh the exact cache scope.
6. **Return typed state** — discriminated union the form renders (rule 4).

Parse before ownership so a malformed id never reaches the lookup; check ownership before
the mutation so an unauthorized caller never writes.

# The shared schema, coercing FormData

`FormData` values are `string | File`. Do not hand-read fields. Reuse the one shared schema
(CLAUDE.md: one schema per entity-operation) and coerce at the form edge:

```ts
// src/schemas/profile.ts — the ONE schema, imported by action AND any tRPC procedure/form
import { z } from "zod";

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(80),
  // FormData carries strings; coerce + bound rather than trusting the type
  age: z.coerce.number().int().min(13).max(120),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
```

# The action

```ts
"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { updateProfileSchema } from "@/schemas/profile";

export type ActionState =
  | { ok: true }
  | { ok: false; formError?: string; fieldErrors?: Record<string, string[]> };

export async function updateProfile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // 1. auth
  const { userId } = await auth();
  if (!userId) return { ok: false, formError: "Not signed in" };

  // 2. parse the untyped boundary (rule 8) — never throw past it
  const parsed = updateProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // 3. ownership (rule 2) — authentication is not authorization
  const row = await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
  });
  if (!row) return { ok: false, formError: "Profile not found" };

  // 4. mutate via a thin call (keep the action thin, like a tRPC procedure)
  await db
    .update(profiles)
    .set({ displayName: parsed.data.displayName, age: parsed.data.age, updatedAt: new Date() })
    .where(eq(profiles.userId, userId)); // scoped by owner, not just by id

  // 5. revalidate the exact scope the mutation changed
  revalidatePath("/settings");

  // 6. typed success
  return { ok: true };
}
```

Notes:
- `updatedAt: new Date()` is stored to a `timestamptz` column (rule 6); convert at display.
- For money, the schema coerces to integer minor units (rule 5); never read a float dollar.
- The `.where(eq(profiles.userId, userId))` double-scopes the write to the owner — even if
  an id were spoofed in FormData, the write cannot touch another user's row.
- Avoid N+1 (rule 7): if you must touch related rows, use a Drizzle relational query or
  join, not a loop of per-row writes.

# The form — progressive enhancement first

```tsx
"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateProfile, type ActionState } from "./actions";

const initial: ActionState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-primary-foreground">
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

export function ProfileForm({ defaultName }: { defaultName: string }) {
  const [state, action] = useActionState(updateProfile, initial);
  return (
    <form action={action} className="space-y-4">
      <input name="displayName" defaultValue={defaultName} className="..." />
      {/* error state (rule 4) */}
      {state.ok === false && state.fieldErrors?.displayName && (
        <p className="text-destructive">{state.fieldErrors.displayName[0]}</p>
      )}
      {state.ok === false && state.formError && <p className="text-destructive">{state.formError}</p>}
      {state.ok && <p className="text-success">Saved.</p>}
      <SubmitButton />
    </form>
  );
}
```

Why this shape:
- `<form action={action}>` submits **without client JS** — the progressive-enhancement
  payoff that justified choosing an action over tRPC. `useFormStatus`/`useActionState` add
  pending and error UI on top of a form that already works.
- The discriminated `ActionState` gives the form a real **error branch and success branch**
  (rule 4: loading via `pending`, error via `fieldErrors`/`formError`, success via `ok`,
  empty via the unsubmitted `defaultValue`). A `void` action that throws breaks the no-JS path.
- All styling resolves to tokens (rule 3) — `bg-primary`, `text-destructive`, spacing
  scale; no raw hex or arbitrary px.
- No secret appears in this client file (rule 9); the action runs server-side only.
