#!/usr/bin/env node
/**
 * webhook-lint — heuristic static check for an inbound-webhook route handler.
 *
 * Flags the mechanically detectable halves of the webhook failure class:
 *   - `req.json()` in a webhook handler — the raw bytes the signature is computed over are
 *     destroyed; read `req.text()` / `req.arrayBuffer()` instead.
 *   - a signing/webhook secret under `NEXT_PUBLIC_*` (Rule 9) or read via bare `process.env.*`
 *     instead of the validated `env` module (Rule 8).
 *   - an `any`-typed event (`evt: any`, `as any`) — the verified body is `unknown` and must be
 *     Zod-parsed (Rules 1/8).
 *
 * It does NOT prove the handler is correct: verify-BEFORE-parse ordering, constant-time
 * comparison, and event-id dedup are semantic and stay a manual `rule-audit` check. A 0 here
 * means "no red flags in these files", not "verified and idempotent".
 *
 * Usage:
 *   node webhook-lint.mjs <file-or-dir> [<file-or-dir> ...]
 *
 * Exit code: number of findings (0 = no red flags).
 */
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node webhook-lint.mjs <file-or-dir> ...");
  process.exit(2);
}

function collect(p) {
  if (!existsSync(p)) return [];
  if (statSync(p).isFile()) return /\.(ts|tsx|js|mjs)$/.test(p) ? [p] : [];
  return readdirSync(p).flatMap((c) => collect(join(p, c)));
}

const RULES = [
  {
    re: /\breq(uest)?\.json\s*\(/,
    msg: "req.json() in a webhook handler destroys the raw bytes the signature is computed over — use req.text()/arrayBuffer() and parse the string after verifying",
  },
  {
    re: /NEXT_PUBLIC_[A-Z0-9_]*(WEBHOOK|SIGNING|SECRET)/,
    msg: "signing/webhook secret exposed under NEXT_PUBLIC_* (Rule 9) — secrets are server-only",
  },
  {
    re: /process\.env\.[A-Z0-9_]*(WEBHOOK|SIGNING)_?SECRET/,
    msg: "signing secret read via bare process.env (Rule 8) — import it from the validated env module",
  },
  {
    re: /\b(evt|event|payload)\s*:\s*any\b|\bas\s+any\b/,
    msg: "event typed `any` — the verified body is `unknown` and must be Zod-parsed (Rules 1/8)",
  },
];

const files = args.flatMap(collect);
let findings = 0;

for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) return;
    for (const { re, msg } of RULES) {
      if (re.test(line)) {
        console.log(`[webhook-lint] ${file}:${i + 1}: ${msg}`);
        findings++;
      }
    }
  });
}

console.log(`\n${findings} finding(s) across ${files.length} file(s).`);
process.exit(findings);
