Purpose: the edge-compatibility gate — how to decide, fast, whether a candidate library can run on this stack's Workers-class edge runtime, and what to substitute when it cannot.

# The edge runtime is the kill switch

This stack deploys to the edge runtime (see `../../CLAUDE.md`), a V8-isolate environment with
Web-standard globals — NOT Node. Most npm packages assume full Node. The edge gate runs first
because a hard fail here ends the evaluation regardless of how good the library otherwise is.

# Disqualifying tells (any one is a hard fail unless a real shim exists)

- **Node built-in imports:** `node:fs`, `node:path`, `node:crypto` (use Web Crypto instead),
  `node:net`, `node:tls`, `node:dns`, `node:child_process`, `node:worker_threads`, `node:stream`
  (Web Streams exist, Node streams do not), `node:http`/`node:https` (use `fetch`).
- **Native addons:** any package shipping a `.node` binary, `node-gyp`/`prebuild` in its
  install, or `bindings`/`node-addon-api` as a dep. These cannot load in a V8 isolate. Classic
  offenders: `bcrypt`, `sharp`, `canvas`, `better-sqlite3`, `node-sass`.
- **Long-lived TCP / persistent connections:** anything that opens a raw socket or a pooled DB
  connection (`pg` with a pool, `mysql2`, `ioredis` over TCP). The edge has no persistent socket —
  this stack uses HTTP/serverless drivers (Neon serverless, Turso/libSQL over HTTP) for exactly
  this reason. Redis must be HTTP-based (Upstash REST class).
- **Dynamic code generation:** `eval`, `new Function(...)`, `vm`. Blocked in the isolate.
- **Full Node globals assumed:** `process.cwd()`, `__dirname`, `Buffer`-only APIs (prefer
  `Uint8Array`/`TextEncoder`), `global` instead of `globalThis`.
- **Filesystem at runtime:** reading config/templates/assets from disk. The edge has no fs.

# How to read package.json (do this before grepping source)

- **`exports` conditions:** a package that declares a `"workers"`, `"edge-light"`, `"worker"`, or
  `"browser"` export condition is signalling edge/browser support — a strong (not conclusive)
  pass. A package with only `"node"`/`"require"` conditions and Node APIs is a likely fail.
- **`engines.node`** pinned with no browser/worker field → built for Node.
- **`dependencies`** — scan transitively; a pure-looking lib that depends on `node-fetch`,
  `ws`, `pg`, or a native addon inherits the fail. The closure matters, not just the top level.
- **`type: "module"` / ESM** — not an edge requirement per se, but ESM correlates with tree-shaking
  (see the bundle gate in `scoring-rubric.md`).

# Confirm against the runtime's supported API list

The edge runtime supports a documented subset of Web APIs (`fetch`, `Request`/`Response`,
`URL`, `crypto.subtle`/`crypto.getRandomValues`, `TextEncoder`/`TextDecoder`, Web Streams,
`structuredClone`, `atob`/`btoa`, timers). When in doubt, check the candidate's core calls
against that list rather than assuming. This list is dated/perishable — `perishable-refresh`
owns re-verifying it; do not hardcode today's exact support into a verdict.

# Web-standard substitutes for the common offenders

| Want to… | Don't add | Use (zero/edge-native) |
|---|---|---|
| Format dates/numbers/currency for display | `moment` | `Intl.DateTimeFormat` / `Intl.NumberFormat` |
| Date arithmetic | `moment` | `date-fns` (tree-shakeable) or `Temporal` |
| Hash / random / sign | `bcrypt`, `crypto` (node) | `crypto.subtle`, `crypto.getRandomValues` |
| HTTP request | `axios`, `node-fetch` | `fetch` (global) |
| Parse/build a URL or query string | `qs`, `url` (node) | `URL`, `URLSearchParams` |
| Deep clone | `lodash.clonedeep` | `structuredClone` |
| UUID | `uuid` (some paths) | `crypto.randomUUID()` (and UUIDv7 helper per stack) |
| Base64 | `Buffer` | `atob`/`btoa` + `TextEncoder` |
| Talk to Postgres/SQLite | `pg` pool, `better-sqlite3` | Neon serverless / Turso libSQL HTTP driver |
| Talk to Redis | `ioredis` | HTTP/REST Redis (Upstash class) |

# Output of this gate

A binary pass/fail plus the reason. On fail: name the exact tell (the import, the addon, the
socket) and the substitute if one exists. A pass here is necessary, not sufficient — proceed to
the bundle/types/maintenance/license gates in `scoring-rubric.md`.
