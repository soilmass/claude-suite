Purpose: the concrete command set and pattern library for finding secrets in the working tree and git history, plus the allowlist of intentionally-public values.

# 1. Working-tree scan

Run these from the repo root. They scan only tracked files (`git grep`), so generated
artifacts and `node_modules` are excluded automatically.

```bash
# Known secret prefixes / shapes — extend per provider you use.
git grep -nIE \
  'sk_(live|test)_[A-Za-z0-9]{16,}|rk_(live|test)_|whsec_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]+'

# JWTs and PEM private keys.
git grep -nIE 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
git grep -nI 'BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY'

# Connection strings with inline credentials (Neon/Turso/Postgres).
git grep -nIE '(postgres(ql)?|mysql|libsql)://[^:@/]+:[^@/]+@'

# Generic assignment of a secret-looking literal.
git grep -nIE '(secret|token|api[_-]?key|password|passwd|private[_-]?key)["'\'' ]*[:=]\s*["'\''][^"'\'' ]{12,}'
```

# 2. NEXT_PUBLIC_ leak check (Rule 9, the #1 Next.js leak)

Anything under `NEXT_PUBLIC_` is statically inlined into the client bundle. A secret there is
already public. Flag any `NEXT_PUBLIC_` name whose suffix reads as a secret:

```bash
git grep -nIE 'NEXT_PUBLIC_[A-Z0-9_]*(SECRET|PRIVATE|TOKEN|PASSWORD|API_KEY|DATABASE|DB_URL|SERVICE)'
```

A match is almost always a real leak. The few legitimate public values are in §5 (allowlist).

# 3. Server secret reachable from a Client Component (Rule 9)

A file starting with `"use client"` (or a hook/component it imports) must never read a server
secret. Two tells: a direct `process.env.<SERVER_VAR>`, or importing a server-only field off
the validated `env` module inside a client file.

```bash
# Client files (top-of-file directive).
git grep -lI '^["'\'']use client' -- '*.ts' '*.tsx' > /tmp/client_files.txt

# For each, look for server env access. Server fields are the ones NOT prefixed NEXT_PUBLIC_.
while read f; do
  git grep -nIE 'process\.env\.(?!NEXT_PUBLIC_)[A-Z]|env\.(CLERK_SECRET_KEY|DATABASE_URL|STRIPE_SECRET_KEY|[A-Z_]*SECRET[A-Z_]*)' -- "$f"
done < /tmp/client_files.txt
```

(`git grep` uses basic ERE; if your build lacks lookahead, grep `process.env.` in client files
and inspect each — any non-`NEXT_PUBLIC_` read is a leak.)

# 4. Git-history scan (deletion is not removal)

A secret removed from HEAD persists in every earlier commit and is fully recoverable. Always
scan history before declaring clean.

```bash
# Was any env/credential file EVER tracked, even if deleted now?
git log --all --full-history --diff-filter=A --name-only -- \
  '.env' '.env.*' '*.pem' '*.key' '*service-account*.json' 'credentials*.json' \
  | grep -vE '\.env\.example$'

# Search every commit's content for a known token shape (-S = pickaxe on added/removed string).
git log --all -p -S 'sk_live_' -- . | head
git grep -nIE 'sk_(live|test)_|whsec_|CLERK_SECRET_KEY' $(git rev-list --all) 2>/dev/null | head

# Targeted: when did a specific var enter history?
git log --all --oneline -S 'CLERK_SECRET_KEY'
```

A hit here escalates to mandatory rotation (the value is public to anyone with repo/fork
access) plus a history rewrite — see `remediation.md`.

# 5. Allowlist — intentionally public, NOT leaks

Do not flag these; flagging real noise erodes trust in the scan:

- `*.env.example`, `*.env.sample`, `*.env.template` — placeholder values, no real secrets.
- Publishable / public keys, designed for the browser:
  - Clerk `pk_test_…` / `pk_live_…` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
  - Stripe publishable `pk_test_…` / `pk_live_…`.
  - PostHog *project* key (`phc_…`) under `NEXT_PUBLIC_POSTHOG_KEY`.
  - Sentry public DSN (`https://<hash>@…ingest.sentry.io/…`).
- Test fixtures and snapshots with obviously fake values (`sk_test_00000000…`, `xxxx`).
- Example/dummy JWTs in docs (`eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.` style placeholders).

Caveat: confirm a `NEXT_PUBLIC_` value really is the *publishable* variant — a personal API key
or a `sk_`/secret accidentally placed under a public name is still a Rule 9 leak.

# 6. Maintain an allowlist file

Track confirmed-safe matches so re-runs stay quiet. A simple convention: a repo-root
`.secretscanignore` of `path:pattern` lines, or per-line `// secret-scan:allow <reason>`
trailing comments on the intentional public-key lines. Record any allowlist entry that is
non-obvious in `DECISIONS.md`.
