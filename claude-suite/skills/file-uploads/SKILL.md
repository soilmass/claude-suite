---
name: file-uploads
description: >
  Move files into blob storage from the edge stack without the runtime ever buffering the
  bytes: the client uploads direct-to-storage against a short-lived credential a
  protectedProcedure issues, the server constrains and re-validates type/size on BOTH ends,
  every stored object is owned by a row scoped to ctx.auth.userId, and abandoned uploads are
  swept. Covers Vercel Blob client-upload and S3/R2 presigned-PUT, magic-byte sniffing (never
  the client's content-type), and wiring the file field into the RHF + shared-Zod form.
  Use when: "file upload", "image upload", "avatar upload", "upload to s3/r2/blob",
  "presigned url", "direct-to-storage upload".
  Do NOT use for: standing up the env layer that holds the storage creds (use env-validation);
  authoring the upload-metadata Zod schema in isolation (use zod-schema-library); or building
  the whole feature slice around the upload (use vertical-slice).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the edge file-upload failure class: proxying bytes through
    the function, trusting the client's content-type/filename, validating size/type only on
    the client, storing objects with no owning row (Rule 2) or no orphan cleanup, and putting
    storage creds in NEXT_PUBLIC_ (Rule 9). Baseline replaced with an observed transcript
    (2026-06-26).
---

# file-uploads

File uploads on this stack are special because the deploy target is the **edge runtime**: it
cannot buffer a multi-megabyte request body, so the bytes must never flow through the
function — the client uploads *direct-to-storage* against a credential the server mints. This
skill is the concrete procedure for that flow on Vercel Blob (client `upload()`) or S3/R2
(presigned PUT): mint the credential in a `protectedProcedure`, constrain and then
*re-validate* type and size on both ends, own every object with a row scoped to
`ctx.auth.userId`, sniff the real content-type instead of trusting the client, and sweep
uploads that were started but never confirmed.

The spine and the nine rules live in `../../CLAUDE.md`; this skill obeys them — chiefly Rule 2
(ownership on every object), Rule 8 (validate the upload metadata), and Rule 9 (creds are
server-only) — and composes `zod-schema-library`, `rhf-advanced`, and `env-validation`.

---

## Non-Negotiable Rules

These ship green and demo fine; each is a real, exploitable upload defect:

- **Never trust the client's reported content-type or filename.** `file.type` and the
  filename are attacker-controlled strings. Determine the real type by **sniffing magic
  bytes** server-side and re-derive the extension from that — a `.jpg` can be an HTML or
  SVG-with-script payload, and `avatar.php.jpg` is a path-traversal/double-extension trap.
- **Never validate size or type on the client only.** Client checks are UX. The
  presign/token step MUST cap `maximumSizeInBytes` and an `allowedContentTypes` allowlist,
  and the confirm step MUST re-check the *actual* stored object's size and sniffed type
  (Rule 8). A client check is bypassed with one `curl`.
- **Never store an object without an owning row scoped to `ctx.auth.userId`.** Namespace the
  key by user, persist a row recording the owner, and re-check ownership on every read and
  delete (Rule 2). An unowned object is an enumerable, unauthorized-access bug.
- **Never put a storage credential client-side.** No `BLOB_READ_WRITE_TOKEN`, S3 secret, or
  signing key in `NEXT_PUBLIC_*` or a Client Component (Rule 9). Mint a short-lived,
  scoped token or presigned URL server-side per request, from the validated `env` module.

Refuse these rationalizations: "we proxy the file through the route, it's simpler"; "the
accept attribute already blocks bad types"; "`file.type` says image/png, trust it"; "the
token's only used in the browser, NEXT_PUBLIC is fine"; "we'll add the ownership check later."

---

## When to Use

- A signed-in user uploads a file (avatar, document, image) that must be stored and linked
  to their data.
- Wiring a presigned-PUT (S3/R2) or client-`upload()` (Vercel Blob) flow on the edge.
- Adding a file field to an RHF form that should validate before and after upload.
- Auditing an existing upload path for trusted content-type, missing ownership, or orphans.

## When NOT to Use

- Standing up the `env` module that holds the storage creds → `env-validation`.
- Authoring the upload-metadata Zod schema as a standalone contract → `zod-schema-library`.
- The non-file mechanics of the form (resolver, field arrays, server-error mapping) →
  `rhf-advanced`.
- Building the entire feature (table → procedure → form → UI) around the upload →
  `vertical-slice`.

---

## Procedure

1. **Choose the direct-upload mechanism and record it (high — architectural).** Vercel Blob
   `upload()` (the route's `handleUpload` mints the token) or S3/R2 presigned PUT (a tRPC
   procedure signs the URL). Both keep bytes off the function — the non-negotiable on the
   edge. Record the choice and the storage provider in `DECISIONS.md`. See
   `references/upload-flow.md`.

2. **Define the shared upload-metadata schema (medium).** One Zod schema (`filename`,
   declared `contentType` as an enum allowlist, `size` with a max) in `src/schemas/`,
   imported by both the presign-request `.input()` and the client pre-check — never two
   copies (Rule 8, owned by `zod-schema-library`). See `references/lifecycle-and-form.md`.

3. **Mint the credential server-side, owned and constrained (high — auth + creds).** In a
   `protectedProcedure` / `handleUpload`, derive a key namespaced by `ctx.auth.userId`
   (e.g. `users/${userId}/avatars/${uuidv7()}`), set `maximumSizeInBytes` and
   `allowedContentTypes`, insert a **pending** owned row, and return the scoped token/URL.
   Creds come from the validated `env` module, never `NEXT_PUBLIC_` (Rule 9). See
   `references/upload-flow.md`.

4. **Upload client-direct, then confirm and re-validate (high — this is where trust leaks).**
   The browser PUTs/`upload()`s straight to storage. A `confirm` mutation then HEADs the
   object, re-checks the **actual** size, **sniffs** the real content-type from the bytes
   (Range/HEAD), re-derives the extension, flips the row to `ready`, and links it to the
   owning entity. Reject and delete on mismatch. See `references/validation-and-safety.md`.

5. **Enforce content safety at the serving edge (medium).** Re-encode images server-side
   (strips EXIF + embedded payloads) or sniff-then-pin a safe `Content-Type`, and serve user
   content with `Content-Disposition: attachment` / a cookieless origin so an uploaded
   `.html`/SVG can't run as your origin. See `references/validation-and-safety.md`.

6. **Sweep orphans and cascade deletes (medium).** A scheduled job deletes `pending` rows
   and their objects older than a TTL (presigned-but-never-confirmed uploads), and deleting
   the owning entity deletes its object — both re-checking ownership. See
   `references/lifecycle-and-form.md`.

7. **Wire the RHF file field with the shared schema and four states (medium).** The file
   input is uncontrolled; register it, pre-validate against the shared schema for UX, and
   render all four states (Rule 4): idle, uploading (progress), error (mapped from the
   server, per `rhf-advanced`), success. See `references/lifecycle-and-form.md`.

---

## Composes With

- **Consumes:** `zod-schema-library` (the shared upload-metadata schema), `env-validation`
  (the server-only storage creds boundary, Rule 9).
- **Pairs with:** `rhf-advanced` (the file field, resolver, and server-error mapping),
  `uuidv7-ids` (the non-enumerable object key), `soft-delete-pattern` (when the owning row
  is soft-deleted, the object still needs a real sweep).
- **Feeds:** `vertical-slice` — when a slice carries a file, this supplies the upload flow,
  the owned row, and the form field; `security-pass` and `rule-audit` verify the result.
- **Hands off:** adding the object columns to a live table → `migration-author`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions): "add an avatar/image upload for a signed-in user — schema, tRPC procedure,
> Zod validation, and the RHF form." The imagined catastrophe (creds in `NEXT_PUBLIC_`, a
> fully unowned object) did NOT occur — a capable base model keeps the token server-side and
> scopes by `ctx.auth.userId`. A **narrower, edge-specific** failure class was confirmed.

**Observed run.** The agent produced a working implementation — a server-only
`BLOB_READ_WRITE_TOKEN` (Rule 9 held), a `protectedProcedure` keyed by Clerk id, a key
namespaced under `avatars/${userId}/`. But the upload's defining edge discipline was inverted:
it **proxied the bytes through the function** as base64 and **trusted the browser's
`file.type`** with no sniff:

```ts
// the file rides through tRPC as base64 — buffered whole in the function (defeats edge direct upload)
const buffer = Buffer.from(input.data, "base64");
await put(`avatars/${existing.id}/${Date.now()}.${input.fileName.split(".").pop()}`, buffer, {
  access: "public", contentType: input.contentType,   // contentType is the client's claim, never sniffed
});
// TWO divergent Zod schemas for one upload: a client `File` schema and a server base64 schema
// users table: timestamp("created_at").defaultNow()  — no withTimezone (Rule 6)
```

Its own admission: *"the magic-bytes aren't sniffed, so the MIME check trusts the
browser-reported `file.type`"* and *"base64 ... buffers the whole image in memory ... a
presigned/client-upload flow would scale better."* Cleanup only deleted the *previous* avatar
on success — abandoned uploads leak with no sweep.

**Failure class (confirmed, narrowed).** Not "produces garbage" — it produces a plausible,
owned, server-tokened upload and gets the *edge-specific* parts wrong: (1) bytes proxied
through the function (base64-through-tRPC) instead of direct-to-storage; (2) `file.type` and
filename trusted, no magic-byte sniff, extension from the client name; (3) two divergent Zod
schemas for one operation; (4) `timestamp` without `withTimezone` (Rule 6); (5) no orphan
sweep. This skill forces direct upload, one shared schema, server-side sniffing, and the
pending-row + sweep lifecycle.

---

## Examples

**Input:** "Let signed-in users upload a profile avatar on Vercel Blob, link it to their row."
**Output:** A shared `avatarUploadSchema` (contentType ∈ {png,jpeg,webp}, size ≤ 2MB) →
`/api/avatar/upload` `handleUpload` authenticates via Clerk, sets `allowedContentTypes` +
`maximumSizeInBytes`, inserts a `pending` row under `users/${userId}/...` → client `upload()`
sends bytes direct → `onUploadCompleted` sniffs the bytes, re-encodes the image, and flips the
owned row to `ready` with `avatarUrl` → the form shows idle/uploading/error/success.

**Input:** "Users attach a PDF receipt to an expense on S3."
**Output:** A `presignReceipt` `protectedProcedure` validates metadata, signs a PUT URL with a
`content-length-range` condition and key `receipts/${userId}/${uuidv7()}.pdf`, inserts a
`pending` row → client PUTs → `confirmReceipt` HEADs the object, verifies content-length and
the `%PDF-` magic bytes, flips to `ready` and links it to the expense (re-checking the expense
is the user's) → a daily job deletes `pending` rows > 1h.

**Input:** "Our upload trusts `file.type`; is that a problem?"
**Output:** Yes — `file.type` is attacker-controlled. Add the server-side magic-byte sniff on
confirm, re-derive the extension from the sniffed type, reject mismatches, and serve with a
pinned `Content-Type` + `Content-Disposition: attachment`.

---

## Edge Cases

- **Vercel Blob `onUploadCompleted` never fires on localhost** (no public callback URL) → use
  a tunnel or run `confirm` explicitly from the client in dev; record the workaround.
- **A large file (video) or multi-GB asset** → presigned PUT alone caps out; use multipart
  (S3) or resumable upload, still keeping every part off the function.
- **The file is private, not public** → store with no public read; serve via a short-lived
  signed GET minted in a `protectedProcedure` that re-checks ownership (Rule 2).
- **Edge can't run `sharp` for the image sniff/re-encode** → do it in a Node-runtime route or
  an image service invoked from `confirm`, not inline at the edge; the edge step only mints.

---

## References

- `references/upload-flow.md` — why the edge can't proxy bytes, the Vercel Blob `handleUpload`
  and S3/R2 presigned-PUT flows side by side, owner key namespacing, and the pending-row +
  confirm handshake with server-only creds.
- `references/validation-and-safety.md` — client vs server validation, magic-byte sniffing
  (never `file.type`), extension re-derivation, EXIF/payload stripping, and safe serving headers.
- `references/lifecycle-and-form.md` — the shared upload-metadata Zod schema, the orphan sweep
  + cascade delete, and the RHF file field with its four states.

## Scripts

`scripts/` is reserved (`.gitkeep`). A signal that would justify one: a static check grepping
for storage tokens under `NEXT_PUBLIC_*` or a client component importing a storage SDK with a
write token (Rule 9), and for upload columns lacking a sibling owner column (Rule 2) — both
mechanically greppable, unlike the sniff-vs-trust and cleanup judgments.
