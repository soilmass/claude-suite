#!/usr/bin/env node
/**
 * stop-gates-reminder — advisory nudge to run the definition-of-done gates.
 * Wired under hooks.Stop in settings.json.
 *
 * When a turn ends and the working tree has uncommitted changes to .ts/.tsx files, remind the
 * user that the done-time gate trio (rule-audit / a11y-gate / security-pass via /gates) has not
 * been confirmed. Advisory only — never blocks (exit 0). "Did you run the gates" is judgment,
 * not a hard rule, so it's a reminder, not a deny.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

try {
  readFileSync(0, "utf8"); // drain stdin; content not needed
} catch {}

let changed = "";
try {
  changed = execSync("git status --porcelain", { encoding: "utf8" });
} catch {
  process.exit(0); // not a git repo
}

const codeChanges = changed
  .split("\n")
  .filter((l) => /\.(ts|tsx)$/.test(l));

if (codeChanges.length === 0) process.exit(0);

process.stderr.write(
  `\n[reminder] ${codeChanges.length} changed TS file(s) not yet gated. ` +
    `Before committing, run /gates (rule-audit + a11y-gate + security-pass) — the definition of done.\n`
);
process.exit(0);
