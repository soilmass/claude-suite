#!/usr/bin/env node
/**
 * no-secrets-guard — enforces Rule 9 mechanically on writes.
 * Wired under hooks.PreToolUse (matcher: Edit|Write) in settings.json.
 *
 * Blocks writing content that puts a secret on the client side: a secret-shaped NEXT_PUBLIC_
 * variable, or a long high-entropy key literal in a file that looks client-bound. Fast regex
 * only — no network. It is a backstop, not a replacement for the secret-scan skill / CI.
 *
 * Contract: stdin = PreToolUse event JSON. Exit 0 = allow; exit 2 = block with the offending
 * pattern and the fix.
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
// Content to inspect: Write.content or Edit.new_string.
const content = ti.content ?? ti.new_string ?? "";
if (!content) process.exit(0);

const hits = [];

// Rule 9: secret-shaped NEXT_PUBLIC_ vars are always wrong.
const pub = /NEXT_PUBLIC_\w*(SECRET|KEY|TOKEN|PASSWORD|PRIVATE|CREDENTIAL)/gi;
let m;
while ((m = pub.exec(content)) !== null) hits.push(`secret-shaped public var: ${m[0]}`);

// Known key prefixes that must never be client-bound.
const keyish = /\b(sk_live_|sk_test_|rk_live_|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/g;
while ((m = keyish.exec(content)) !== null) hits.push(`hardcoded credential literal: ${m[1]}`);

// A "use client" file importing process.env (server-only) is a leak smell.
if (/["']use client["']/.test(content) && /process\.env\.(?!NEXT_PUBLIC_)/.test(content)) {
  hits.push(`server env (process.env.*) referenced in a "use client" file: ${path}`);
}

if (hits.length === 0) process.exit(0);

process.stderr.write(
  `\nBlocked by no-secrets-guard (Rule 9): ${hits.length} issue(s) in ${path || "the write"}:\n` +
    hits.map((h) => `  - ${h}`).join("\n") +
    `\nMove secrets server-side; never expose them via NEXT_PUBLIC_ or in client components. Run /security for a full pass.\n`
);
process.exit(2);
