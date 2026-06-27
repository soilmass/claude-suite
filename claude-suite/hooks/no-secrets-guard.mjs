#!/usr/bin/env node
/**
 * no-secrets-guard — enforces Rule 9 mechanically on writes.
 * Wired under hooks.PreToolUse (matcher: Edit|Write) in settings.json.
 *
 * Blocks writing content that puts a secret on the client side: a secret-shaped NEXT_PUBLIC_
 * variable, server env in a "use client" file, or a credential literal. Fast regex, no network.
 *
 * Exemptions (so the guard does not block legitimate writes):
 *  - Markdown (.md/.mdx) is documentation, not shipped code — the variable-name / use-client
 *    checks are skipped so a skill or baseline may NAME the anti-pattern. Real credential
 *    literals are still flagged in docs (a key committed anywhere is a leak).
 *  - The security tooling itself (this file, scan.mjs) legitimately contains the patterns it
 *    scans for, so it is fully exempt — otherwise it could never be edited through the tool.
 *
 * Contract: stdin = PreToolUse event JSON. Exit 0 = allow; exit 2 = block with the fix.
 */
import { readFileSync } from "node:fs";

let event;
try {
  event = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const ti = event?.tool_input ?? {};
const path = ti.file_path ?? "";
const content = ti.content ?? ti.new_string ?? "";
if (!content) process.exit(0);

const isDoc = /\.(md|mdx|markdown)$/i.test(path);
const isSecurityTool = /(no-secrets-guard|scan)\.mjs$/.test(path);

const hits = [];

if (!isDoc && !isSecurityTool) {
  // Rule 9: secret-shaped NEXT_PUBLIC_ vars are always wrong in shipped code.
  const pub = /NEXT_PUBLIC_\w*(SECRET|KEY|TOKEN|PASSWORD|PRIVATE|CREDENTIAL)/gi;
  let pm;
  while ((pm = pub.exec(content)) !== null) hits.push(`secret-shaped public var: ${pm[0]}`);

  // A "use client" file importing server env is a leak smell.
  if (/["']use client["']/.test(content) && /process\.env\.(?!NEXT_PUBLIC_)/.test(content)) {
    hits.push(`server env (process.env.*) referenced in a "use client" file: ${path}`);
  }
}

if (!isSecurityTool) {
  // Credential literals must never be committed — flagged everywhere except the scanner sources.
  const keyish = /\b(sk_live_|sk_test_|rk_live_|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/g;
  let m;
  while ((m = keyish.exec(content)) !== null) hits.push(`hardcoded credential literal: ${m[1]}`);
}

if (hits.length === 0) process.exit(0);

process.stderr.write(
  `\nBlocked by no-secrets-guard (Rule 9): ${hits.length} issue(s) in ${path || "the write"}:\n` +
    hits.map((h) => `  - ${h}`).join("\n") +
    `\nMove secrets server-side; never expose them via NEXT_PUBLIC_ or in client components. Run /security for a full pass.\n`
);
process.exit(2);
