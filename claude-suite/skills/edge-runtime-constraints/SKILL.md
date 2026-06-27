---
name: edge-runtime-constraints
description: >
  Diagnose what breaks under the Edge runtime — Node built-ins (fs, net, dns,
  child_process, node:crypto), native addons, dynamic eval, TCP database drivers — and pick
  an edge-safe alternative or, as a last resort, set a single route to the Node runtime.
  Decodes the Vercel/Cloudflare build errors that mean "this API isn't available at the
  edge" and decides runtime per route without forfeiting the edge fork lightly.
  Use when: "edge runtime error", "does this run on edge", "node api at edge", "runtime =
  edge".
  Do NOT use for: deploy mechanics and platform config (use deploy-edge), or wiring the
  serverless DB driver itself (use neon-turso-driver).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the "Node API shipped to the edge runtime" failure class:
    code that builds locally on the default Node runtime and dies at the edge boundary.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# edge-runtime-constraints

The edge runtime is the fork-defining fact of this stack (see `../../CLAUDE.md` — it is why
the data layer is Drizzle and auth/DB are edge variants). The edge is a Web-APIs-only V8
isolate, **not** Node.js: `fs`, `net`, `dns`, `child_process`, native `.node` addons, most of
`node:crypto`, dynamic `eval`, and long-lived TCP sockets are all absent. This skill maps a
broken (or about-to-break) dependency to its edge-safe replacement, and decides — per route —
when to set `runtime = 'edge'` versus falling back to `'nodejs'`.

---

## When to Use
- A build or runtime error says a Node API / module is unavailable at the edge.
- You are about to add a dependency and need to know if it survives the edge.
- You are deciding whether a specific route handler should run on `edge` or `nodejs`.
- Middleware (always edge) is doing something that needs a Node API.

## When NOT to Use
- Deploying, platform flags, function size/region config → `deploy-edge`.
- Choosing/wiring the Neon or Turso/libSQL HTTP driver → `neon-turso-driver` (this skill
  only tells you the TCP `pg` driver won't work at the edge; that skill fixes it).
- A pure type-chain or rules violation unrelated to runtime → `rule-audit`.

---

## Procedure

1. **Identify the runtime the code actually runs on (low cost, do first).** App Router
   defaults to `'nodejs'`; the edge is opt-in per route via `export const runtime = 'edge'`.
   **Middleware is the exception — it always runs on the edge runtime**, no opt-out. So a
   green local build proves nothing: confirm which routes declare edge and that middleware
   stays edge-clean. See `references/runtime-selection.md`.

2. **Locate the offending API (medium cost).** Map the symptom to the cause: scan for
   `node:*` imports, bare `fs`/`net`/`dns`/`crypto` imports, `process.*` beyond static
   `process.env`, `__dirname`/`__filename`, `Buffer` reliance, native packages (`bcrypt`,
   `sharp`, `pg`), and `eval`/`new Function`. The build error wording maps precisely to the
   class — see the error decoder in `references/edge-incompatibilities.md`.

3. **Reach for the edge-safe replacement first (medium cost).** Almost every Node-only
   dependency has a Web-API equivalent: `jsonwebtoken`→`jose`, `bcrypt`→Web Crypto /
   `@noble/hashes`, `pg`→Neon/libSQL HTTP driver, `nodemailer`→an HTTP email API, `fs.read`→
   import-as-module or `fetch`, `node:crypto` hashing→`crypto.subtle`. Replacing keeps the
   edge fork intact. The full mapping table is in `references/edge-incompatibilities.md`.

4. **Only if no edge-safe path exists, pin that one route to `nodejs` (high cost — this
   forfeits the fork's benefit for that route).** Set `export const runtime = 'nodejs'` on
   the single route handler that needs the Node API; keep everything else at the edge. Never
   flip the whole app. **Record the exception and its reason in `DECISIONS.md`** — the spine
   says edge, so a Node route is a logged deviation, not a silent one.

5. **Keep middleware edge-pure (high cost — middleware can't fall back).** Because
   middleware is always edge, it must never import a Node-only module. Clerk's
   `clerkMiddleware` is chosen precisely because it is edge-compatible; keep middleware to
   auth/redirect/header work and push anything Node-shaped into a `nodejs` route handler.

6. **Re-verify any boundary you replaced (Rules 1 & 8).** A swapped client (e.g. an HTTP
   email or auth call) still returns data that crosses a boundary — keep it typed (no
   untyped `fetch`/`JSON.parse`, Rule 1) and Zod-parse the response (Rule 8). An edge fix is
   not done if it reopened the type chain.

---

## Composes With
- **Pairs with:** `neon-turso-driver` (it supplies the edge-safe DB driver this skill points
  to when the TCP `pg` driver fails), `deploy-edge` (platform-side runtime/region config).
- **Hands off:** deploy and platform configuration to `deploy-edge`.
- **Feeds:** `rule-audit` / `security-pass` — replacements get re-checked for Rules 1, 8, 9.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked for an `export const runtime = "edge"` route that SHA-256-hashes a
posted token and checks it against an allowlist, the agent produced a handler that imports
`node:crypto`, `node:fs`, and `node:path` — all absent from the edge isolate. It used
`crypto.createHash("sha256")` (Node-only; the edge offers only WebCrypto) and read the
allowlist with `fs.readFileSync(path.join(process.cwd(), ...))` on every request, so despite
the `runtime = "edge"` declaration the route cannot build or run at the edge:

```ts
export const runtime = "edge";

export async function POST(req: Request) {
  const { token } = await req.json();                       // untyped any across the boundary
  const hash = crypto.createHash("sha256")                  // node:crypto — not on edge
    .update(token).digest("hex");
  const configPath = path.join(process.cwd(), "config", "tokens.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8")); // node:fs/path — not on edge
  return NextResponse.json({ valid: !!config.allowedHashes?.includes(hash) });
}
```

It compounded the runtime breakage with rule violations: `req.json()` and `JSON.parse` feed
untyped `any` straight into the hasher with no Zod parse of the body (**Rules 1 and 8**), and
there is no error handling for malformed JSON, a missing file, or a non-string token.

**Failure class (confirmed).** The agent treats the edge declaration as cosmetic and writes
ordinary Node code — `node:crypto`, `node:fs`/`node:path`, `process.cwd()` — that builds
locally on the default Node runtime but dies at the edge boundary. The edge-correct path is
WebCrypto (`await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))`) plus a
static config import, with the request body Zod-parsed before use. This skill exists to map
each Node-only API to its edge-safe replacement before it ships.

---

## Examples

**Input:** "Build fails: `Module not found: Can't resolve 'fs'` in a route that emails a
welcome message via nodemailer."
**Output:** Identifies two edge-incompatibilities — `fs` (template read) and `nodemailer`
(SMTP over `net`). Replaces: read the template via import-as-module, send via an HTTP email
API (e.g. Resend's `fetch`-based client). Route stays `runtime = 'edge'`; the email response
is Zod-parsed (Rule 8). No Node fallback needed.

**Input:** "Should this PDF-generation route be edge?"
**Output:** PDF libs depend on native binaries / `fs` with no edge equivalent. Pin only that
route: `export const runtime = 'nodejs'`. Everything else stays edge. Logs the exception in
`DECISIONS.md` with the reason (no edge-safe PDF path). Hands deploy/region config to
`deploy-edge`.

**Input:** "`jsonwebtoken` throws at the edge."
**Output:** Swap to `jose` (Web Crypto based, edge-native): `jwtVerify`/`SignJWT`. Keep the
verified payload typed and Zod-parsed before use (Rules 1 & 8).

---

## Edge Cases
- **It only breaks in production, not `next dev`** → `next dev` can run edge routes on Node;
  trust the build/deploy error and `next build`, not the dev server.
- **You need `Buffer` or `crypto` for one small operation** → use `TextEncoder`/`Uint8Array`
  and `crypto.subtle`/`crypto.getRandomValues` (Web Crypto is available at the edge); do not
  pull in `node:crypto`.
- **A transitive dependency (not your code) imports `fs`/`net`** → tree-shaking may not drop
  it; either find an edge-safe library or isolate it behind a `nodejs` route, not the whole app.
- **Cloudflare Workers vs Vercel Edge differ** → some Node shims need a `nodejs_compat`-class
  flag on Workers; that is platform config → `deploy-edge`. This skill stops at "needs a flag."

---

## References
- `references/edge-incompatibilities.md` — the broken-API → edge-safe-alternative mapping
  table, the available Web APIs at the edge, and a build-error decoder.
- `references/runtime-selection.md` — per-route `runtime` declaration mechanics, the
  always-edge middleware rule, and the detection checklist for scanning a diff.

## Scripts
`scripts/` reserved. A grep-based scanner (flagging `node:*`/`fs`/`net` imports and native
packages in files that declare `runtime = 'edge'` plus all middleware) would justify one once
the import-detection pattern proves stable across real repos. Empty for now.
