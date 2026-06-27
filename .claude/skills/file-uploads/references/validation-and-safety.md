Purpose: validating uploads on BOTH ends, why the client's content-type/filename is never
trusted, magic-byte sniffing, extension re-derivation, payload/EXIF stripping, and safe
serving headers.

# Validation and safety

## Client validation is UX; server validation is the gate

The client check (`accept` attr, a Zod `File` refinement) exists only to fail fast for a real
user. It is bypassed by any non-browser client. **Both** of these are mandatory and live
server-side:

1. **At credential mint** — cap `maximumSizeInBytes` and an `allowedContentTypes` allowlist on
   the token / presigned policy (`content-length-range` for presigned POST). This is what
   stops a hostile client before bytes land.
2. **At confirm** — re-read the *actual* stored object and verify size + the *real* type. The
   mint-time constraint is the provider's promise; confirm is your verification.

## Never trust `file.type` or the filename

`file.type` is set by the browser from the OS, and the filename is whatever the client sent.
Both are attacker-controlled. Gating on them lets a script-bearing SVG or an HTML file pass as
`image/png`, and lets `avatar.php.jpg` / `../../etc/passwd` through as a path.

**Sniff the magic bytes** of the stored object and derive everything from that:

```ts
// on confirm: read just the leading bytes via a Range GET / HEAD, sniff, compare
import { fileTypeFromBuffer } from "file-type";

const head = await fetchRange(row.key, 0, 4100);          // enough for file-type's detectors
const sniffed = await fileTypeFromBuffer(head);            // { mime, ext } | undefined
if (!sniffed || !ALLOWED_MIME.has(sniffed.mime)) {
  await deleteObject(row.key);                             // reject + clean up
  throw new TRPCError({ code: "BAD_REQUEST", message: "File content does not match an allowed type." });
}
const safeExt = sniffed.ext;                               // re-derive extension from the SNIFFED type
```

`file-type` reads container magic numbers, not the client claim. Note it cannot vouch for
text-based formats (SVG is XML, CSV is text) — for those, treat as untrusted: sanitize SVG or
forbid it, and never serve such files from your own origin (below).

## Re-encode images to neutralize payloads

For images, the strongest validation is to **re-encode** them (`sharp` in a Node runtime route
or an image service called from `confirm`): a re-encode that succeeds proves it was a real
raster image and strips EXIF/GPS metadata and any appended payload. The edge step only mints
the credential; the re-encode runs where `sharp` can (Node route / worker), not inline at the
edge.

```ts
const out = await sharp(originalBuffer).rotate().webp({ quality: 82 }).toBuffer(); // strips EXIF + payloads
```

## Safe serving headers

How an object is served decides whether a malicious upload can execute as your origin:

- **Pin the Content-Type** from the sniffed type, not the stored/claimed one.
- **`Content-Disposition: attachment`** for anything you do not fully control, so the browser
  downloads rather than renders it.
- **Serve user content from a cookieless origin** (a separate bucket domain), so a stored
  HTML/SVG cannot read your auth cookies or run as your domain.
- **Private files** get a short-lived signed GET minted in a `protectedProcedure` that
  re-checks ownership (Rule 2) — never a public URL.
- **AV scan** arbitrary user files (not just images) before they are downloadable, async after
  confirm; keep the row `pending`/`quarantined` until the scan clears.

## What to re-check at confirm (checklist)

- Object exists and `ownerId === ctx.auth.userId` (Rule 2).
- Actual content-length ≤ the cap (HEAD), independent of the client's declared size.
- Sniffed MIME ∈ allowlist; extension re-derived from the sniff.
- (Images) re-encode succeeded.
- Only then flip `pending` → `ready` and link to the owning entity.
