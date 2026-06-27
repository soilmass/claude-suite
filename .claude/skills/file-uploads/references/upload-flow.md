Purpose: the two direct-to-storage upload mechanisms on the edge stack (Vercel Blob client
upload, S3/R2 presigned PUT), why bytes must never cross the function, key namespacing by
owner, and the pending-row + confirm handshake.

# Upload flow

## Why bytes never cross the function (the edge constraint)

The deploy target is the **edge runtime**. Edge functions are not built to buffer large
request bodies — platform body limits (Vercel: ~4.5MB on a function request) and the lack of a
durable filesystem mean a multi-megabyte upload streamed *through* the function is the wrong
shape. The base64-through-tRPC pattern (see the baseline) buffers the whole file in function
memory and inflates the payload ~33%. The correct shape on every provider is the same:

```
client ──(1) ask for a credential──▶ server (protectedProcedure / handleUpload)
client ◀──(2) short-lived scoped token / presigned PUT URL──┘
client ──(3) PUT the bytes DIRECTLY──▶ storage (Blob / S3 / R2)
client ──(4) confirm──▶ server  ──re-validate, link to owning row, flip pending→ready
```

The function only ever sees *metadata* and a confirmation — never the bytes.

## Option A — Vercel Blob client upload

`@vercel/blob/client`'s `upload()` calls a route handler whose `handleUpload` mints the token.
Authentication and the type/size constraints live in `onBeforeGenerateToken`; persistence lives
in `onUploadCompleted`.

```ts
// src/app/api/avatar/upload/route.ts  — Node runtime if you sniff/re-encode here; edge if you only mint
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@clerk/nextjs/server";
import { uuidv7 } from "uuidv7";
import { env } from "~/env";                       // server-only creds (Rule 9)
import { db } from "~/db";
import { uploads } from "~/db/schema/uploads";

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  const jsonResponse = await handleUpload({
    body,
    request,
    token: env.BLOB_READ_WRITE_TOKEN,             // never NEXT_PUBLIC_
    onBeforeGenerateToken: async () => {
      const { userId } = await auth();
      if (!userId) throw new Error("Unauthorized");
      // insert the PENDING owned row HERE so an abandoned upload is sweepable (see the handshake)
      const [row] = await db.insert(uploads)
        .values({ id: uuidv7(), ownerId: userId, key: `users/${userId}/avatars/${uuidv7()}`, status: "pending" })
        .returning();
      // constrain BOTH type and size here — this is the server-side gate
      return {
        allowedContentTypes: ["image/png", "image/jpeg", "image/webp"],
        maximumSizeInBytes: 2 * 1024 * 1024,
        // tokenPayload travels to onUploadCompleted — carry the owner + the pending row id
        tokenPayload: JSON.stringify({ userId, uploadId: row.id }),
      };
    },
    onUploadCompleted: async ({ blob, tokenPayload }) => {
      const { userId, uploadId } = JSON.parse(tokenPayload!) as { userId: string; uploadId: string };
      // re-validate + link, then flip pending→ready (see validation-and-safety.md for the sniff/re-encode)
      await db.update(uploads)
        .set({ url: blob.url, status: "ready", contentType: blob.contentType })
        .where(and(eq(uploads.id, uploadId), eq(uploads.ownerId, userId)));   // Rule 2
    },
  });
  return Response.json(jsonResponse);
}
```

`pathname` passed to `upload()` is advisory; pin the real key in `tokenPayload` so the client
cannot choose another user's namespace.

## Option B — S3 / R2 presigned PUT (tRPC)

Sign the PUT in a `protectedProcedure`. Constrain size with a `content-length-range` condition
(presigned POST) or `ContentLength`/checked-on-confirm (presigned PUT), and pin the content-type.

```ts
// src/server/api/routers/upload.ts
export const uploadRouter = createTRPCRouter({
  presign: protectedProcedure
    .input(avatarUploadSchema)                     // shared schema — see lifecycle-and-form.md
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.auth.userId;
      const key = `users/${userId}/avatars/${uuidv7()}`;    // owner-namespaced, non-enumerable
      // pending owned row FIRST, so a never-confirmed upload is sweepable
      const [row] = await ctx.db.insert(uploads)
        .values({ ownerId: userId, key, status: "pending", declaredType: input.contentType })
        .returning();
      const url = await getSignedUrl(s3, new PutObjectCommand({
        Bucket: env.S3_BUCKET, Key: key, ContentType: input.contentType,
      }), { expiresIn: 60 });
      return { uploadId: row.id, url, key };
    }),

  confirm: protectedProcedure
    .input(z.object({ uploadId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.uploads.findFirst({ where: eq(uploads.id, input.uploadId) });
      if (!row || row.ownerId !== ctx.auth.userId) throw new TRPCError({ code: "NOT_FOUND" }); // Rule 2
      // HEAD + sniff + re-check size, then flip — see validation-and-safety.md
      await ctx.db.update(uploads).set({ status: "ready" }).where(eq(uploads.id, row.id));
      return { key: row.key };
    }),
});
```

## Ownership namespacing (Rule 2)

Two layers, both required:

1. **Key namespace.** Every object key starts with the owner: `users/${userId}/...`. With a
   UUIDv7 leaf the key is non-enumerable (`uuidv7-ids`).
2. **Owned row.** A `uploads` row records `ownerId = ctx.auth.userId`, the key/url, and a
   `status` (`pending` → `ready`). Every read and delete filters by `ownerId`. The key
   namespace alone is not authorization — the row is the checkable record.

## The pending-row + confirm handshake

Insert the row as `pending` *before* handing out the credential, flip to `ready` only after
`confirm` re-validates. This gives you (a) a record to re-check ownership against, and (b) a
sweepable marker for uploads that were presigned but never completed (see
`lifecycle-and-form.md`). Never write the URL straight to the owning entity before confirm —
that links an unvalidated object.
