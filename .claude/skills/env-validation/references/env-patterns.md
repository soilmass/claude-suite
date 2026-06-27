Purpose: per-type Zod patterns for env values, the server/client classification checklist, and the common mistakes this skill exists to prevent.

# Zod patterns per variable type

Env values arrive as `string | undefined` (or `""` with `emptyStringAsUndefined`). Validate
the *meaning*, not just presence (Rule 8).

| Need | Pattern |
| --- | --- |
| Required non-empty string | `z.string().min(1)` |
| URL (DB, app URL, webhook) | `z.string().url()` |
| Connection string with scheme | `z.string().url().startsWith("postgres")` |
| Prefixed key (Stripe/Clerk) | `z.string().startsWith("sk_")` / `.startsWith("pk_")` |
| Number / port | `z.coerce.number().int().positive()` |
| Boolean flag | `z.enum(["true","false"]).transform((v) => v === "true")` |
| Enum (stage) | `z.enum(["development","test","production"])` |
| Optional with default | `z.string().url().default("http://localhost:3000")` |
| Comma list | `z.string().transform((s) => s.split(",").filter(Boolean))` |

Notes:
- `z.coerce.number()` not `z.number()` — env is always a string; `z.number()` would always
  fail. The coerced value is the typed number downstream (Rule 1: type chain stays intact).
- A boolean from env is never `z.boolean()`; the literal `"false"` is a truthy string. Use the
  enum+transform form so `FOO=false` resolves to `false`.
- Prefer a real format check (`.url()`, `.startsWith()`) over bare `.min(1)` where the value
  has a known shape — it catches the malformed-but-present case at build.

# Server vs client classification checklist

Run this per variable. When any answer is uncertain, classify as **server**.

1. Does the browser need this value at runtime to render or call out? If **no** → `server`.
2. Is the value a secret — an API key, signing secret, DB credential, token? If **yes** →
   `server`, full stop. It can never be `NEXT_PUBLIC_` (Rule 9).
3. If it is genuinely client-needed AND non-sensitive (a publishable key, a public URL, a
   feature flag) → `client`, and it MUST be named `NEXT_PUBLIC_*`.
4. Needed on both sides and non-sensitive → one `NEXT_PUBLIC_*` entry is fine. Needed on both
   sides but the *full* value is sensitive → declare a server secret AND a separate public,
   non-sensitive value (e.g. a publishable key); never expose the secret to bridge the gap.

Reminder: "publishable"/"public" keys from providers (Clerk `pk_`, Stripe `pk_`) are designed
to be client-visible. Their `sk_`/secret counterparts are not — never co-locate them.

# Common mistakes this skill prevents

- **`process.env.X!`** — the non-null assertion lies to the compiler; at runtime the value is
  still `undefined` and the edge request crashes. Replace with a schema entry.
- **`as string` / `as number`** — same lie, plus it skips coercion. Banned (Rules 1, 8).
- **Spreading into `runtimeEnv`** (`...process.env`) — breaks Next's static inlining of
  `NEXT_PUBLIC_*` at the edge; the client value becomes `undefined` in the browser bundle.
- **A secret under `NEXT_PUBLIC_`** — ships to the browser in plaintext. The single worst env
  mistake (Rule 9). t3-env cannot detect that a *value* is secret, only enforce the prefix
  rule — classification (checklist above) is the human/agent's job.
- **Reading env in module top-level of a Client Component file** — only `NEXT_PUBLIC_*`
  resolves there; a server key import is a build error (the guardrail working as intended).
- **No `.env.example`** — the schema is the contract; the example file is its discoverable
  copy. Keep them in lockstep when adding a key.
- **Skipping validation in CI to "fix" a red build** — that hides exactly the missing-var bug
  the gate caught. `SKIP_ENV_VALIDATION` is a Docker build-layer tool only; log any other use
  in `DECISIONS.md`.
