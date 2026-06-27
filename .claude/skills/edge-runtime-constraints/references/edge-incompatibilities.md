Purpose: what breaks at the Edge runtime, the edge-safe replacement for each, the Web APIs you *do* have, and a decoder mapping build/deploy errors to the class.

# Edge incompatibilities and their replacements

The Edge runtime is a Web-APIs-only V8 isolate (Vercel Edge Functions, Cloudflare Workers).
It is **not** Node.js. There is no filesystem, no TCP/UDP sockets, no native addons, no
child processes, and dynamic code evaluation is blocked. Prefer the replacement (keeps the
edge fork from `../../CLAUDE.md`); pin a route to `nodejs` only when no replacement exists.

## What is NOT available at the edge

| Node feature | Why it fails |
| --- | --- |
| `fs` / `node:fs` | No filesystem in the isolate. |
| `net`, `dns`, `tls` | No raw TCP/UDP; cannot open sockets (this is why TCP `pg` fails). |
| `child_process` | No process spawning. |
| Native addons (`.node`, e.g. `bcrypt`, `sharp`, `better-sqlite3`) | No native binary loading. |
| Most of `node:crypto` | Node crypto bindings absent; use Web Crypto instead. |
| `process.cwd()`, `__dirname`, `__filename` | No filesystem/process context. |
| `process.env` beyond statically-inlined keys | Only build-time-inlined env is reliable. |
| `eval`, `new Function`, runtime WASM compile from string | Dynamic Code Evaluation blocked. |
| `Buffer` (heavy reliance) | Discouraged; use `Uint8Array` / `TextEncoder`. |

## What IS available (use these)

- `fetch`, `Request`, `Response`, `Headers`, `URL`, `URLSearchParams`
- Web Crypto: `crypto.subtle` (hashing, HMAC, sign/verify), `crypto.getRandomValues`,
  `crypto.randomUUID()`
- `TextEncoder` / `TextDecoder`, `atob` / `btoa`
- `ReadableStream` / `WritableStream` / `TransformStream`
- `structuredClone`, `WebAssembly` (instantiate from bytes, not from a string)
- `setTimeout` / `queueMicrotask`

## Replacement mapping

| Node-only dependency / API | Edge-safe replacement |
| --- | --- |
| `jsonwebtoken` (uses `node:crypto`) | `jose` — `SignJWT`, `jwtVerify` (Web Crypto based) |
| `bcrypt` / `bcryptjs`(native or slow) | Web Crypto PBKDF2/HMAC via `crypto.subtle`, or `@noble/hashes`; or delegate to Clerk (auth is Clerk's job anyway) |
| `node:crypto` hashing/HMAC | `crypto.subtle.digest` / `crypto.subtle.sign` |
| `pg` / `mysql2` (TCP pool) | Neon serverless HTTP driver or Turso/libSQL — see `neon-turso-driver` |
| `nodemailer` (SMTP over `net`) | HTTP email API (Resend / Postmark) via `fetch` |
| `fs.readFile` for a template/asset | `import` it as a module, embed as a string, or `fetch` it from a URL |
| `sharp` (native image) | An HTTP image service, or pin the image route to `runtime = 'nodejs'` |
| `uuid` (sometimes pulls node crypto) | `crypto.randomUUID()`; UUIDv7 via an edge-safe generator (see schema-design IDs) |
| Winston / pino with file transports | Structured `console` + the OTel/Sentry edge SDK (log discipline in `../../CLAUDE.md`) |

After any swap: the replacement's response still crosses a boundary — keep it typed (Rule 1,
no untyped `fetch`/`JSON.parse`) and Zod-parse it (Rule 8). Never put a swapped client's
secret key in `NEXT_PUBLIC_*` or a Client Component (Rule 9).

## Build / deploy error decoder

| Error text (approx.) | Means | Fix |
| --- | --- | --- |
| `A Node.js API is used (process.X / Buffer / ...) which is not supported in the Edge Runtime` | Node API in an edge route or middleware | Replace with the Web API equivalent, or pin route to `nodejs` |
| `Module not found: Can't resolve 'fs' / 'net' / 'dns'` | A dependency imports a Node built-in | Find an edge-safe lib or isolate behind a `nodejs` route |
| `Dynamic Code Evaluation (e.g. 'eval', 'new Function') not allowed in Edge Runtime` | `eval`/`new Function` (often transitive) | Remove or replace the offending dependency |
| `The edge runtime does not support Node.js 'crypto' module` | `node:crypto` import | Use `crypto.subtle` / `jose` |
| Runtime: connection/socket timeout from the DB | TCP driver at the edge | Switch to the HTTP driver — `neon-turso-driver` |
| Function exceeded size limit | Bundle too large for the edge function | Trim deps / dynamic import / move heavy route to `nodejs` (deploy-edge for limits) |
