Purpose: the shared upload-metadata Zod schema, the uploads table + orphan sweep + cascade
delete, and the RHF file field wired with the shared schema and its four states.

# Lifecycle and form

## The shared upload-metadata schema (one copy, Rule 8)

One schema in `src/schemas/upload.ts`, imported by the presign `.input()` AND the client
pre-check. It validates *metadata*, not the bytes (the bytes go direct to storage).

```ts
// src/schemas/upload.ts
import { z } from "zod";

export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export const avatarUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_IMAGE_TYPES),   // allowlist, not a free string
  size: z.number().int().positive().max(MAX_AVATAR_BYTES),
});
export type AvatarUpload = z.infer<typeof avatarUploadSchema>;
```

The same symbol is the tRPC `presign.input()` and the form's pre-check. Do not author a second
`File` schema on the client and a base64 schema on the server (the baseline's drift) — derive
the client check from this one. The bytes themselves are validated by the server sniff at
confirm (`validation-and-safety.md`), not by the form.

## The uploads table (owned, with status)

```ts
// src/db/schema/uploads.ts
import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";

export const uploads = pgTable("uploads", {
  id: uuid("id").primaryKey(),                          // UUIDv7 — see uuidv7-ids
  ownerId: text("owner_id").notNull(),                  // ctx.auth.userId — Rule 2
  key: text("key").notNull().unique(),
  url: text("url"),
  status: text("status").notNull().default("pending"),  // pending | ready | quarantined
  contentType: text("content_type"),                    // the SNIFFED type, set at confirm
  size: integer("size"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), // Rule 6
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```

`withTimezone: true` is mandatory (Rule 6 — the baseline dropped it). Index `ownerId` and
`(status, createdAt)` so both the ownership filter and the sweep query are cheap
(`index-strategy`).

## Orphan sweep + cascade delete

A presigned-but-never-confirmed upload leaves a `pending` row and possibly an object. Two jobs:

```ts
// scheduled (cron) — delete pending rows + objects older than the TTL
const stale = await db.query.uploads.findMany({
  where: and(eq(uploads.status, "pending"), lt(uploads.createdAt, minutesAgo(60))),
});
for (const row of stale) {                 // delete the OBJECT then the row
  await deleteObject(row.key);
  await db.delete(uploads).where(eq(uploads.id, row.id));
}
```

- **On entity delete**, delete the object too — re-checking `ownerId === ctx.auth.userId`
  first (Rule 2). A row delete that leaves the object is a storage + privacy leak.
- **Soft delete** (`soft-delete-pattern`): a soft-deleted owning row still needs a real object
  sweep on a retention schedule; the object is not soft-deletable.

## The RHF file field with four states (Rule 4)

The `<input type="file">` is uncontrolled — register it, read the `File` off the `FileList`,
pre-validate against the shared schema's shape for UX, then run the direct-upload flow. Map
server errors per `rhf-advanced`. Render all four states, not just success:

```tsx
"use client";
const form = useForm<{ file?: FileList }>({ defaultValues: { file: undefined } });
const [phase, setPhase] = useState<"idle" | "uploading" | "error" | "success">("idle");

const onSubmit = form.handleSubmit(async ({ file }) => {
  const f = file?.[0];
  if (!f) return form.setError("file", { message: "Choose a file." });
  // client pre-check derived from the SHARED schema (UX only; server re-checks)
  const pre = avatarUploadSchema.safeParse({ filename: f.name, contentType: f.type, size: f.size });
  if (!pre.success) return form.setError("file", { message: pre.error.issues[0]!.message });

  try {
    setPhase("uploading");
    await uploadDirect(f);          // Blob upload() or presign→PUT→confirm (upload-flow.md)
    setPhase("success");
  } catch (e) {
    setPhase("error");
    form.setError("root.serverError", { message: messageFrom(e) });  // not just a toast (Rule 4)
  }
});
```

```tsx
{phase === "idle"      && <input type="file" accept="image/png,image/jpeg,image/webp" {...form.register("file")} />}
{phase === "uploading" && <Progress />}
{phase === "error"     && <p role="alert">{form.formState.errors.root?.serverError?.message}</p>}
{phase === "success"   && <Avatar src={url} />}
```

The accept attribute and the `safeParse` are convenience; the server's mint-time cap and the
confirm-time sniff are the real gate.
