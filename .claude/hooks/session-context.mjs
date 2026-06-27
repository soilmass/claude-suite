#!/usr/bin/env node
/**
 * session-context — surfaces the most recent decisions at session start.
 * Wired under hooks.SessionStart in settings.json.
 *
 * Prints the newest DECISIONS.md entries to stdout so the spine's recent resolved forks are in
 * view from the first turn (DECISIONS.md wins over CLAUDE.md when they disagree). Read-only,
 * fast, no network. Always exit 0.
 */
import { readFileSync, existsSync } from "node:fs";

const candidates = ["DECISIONS.md", "claude-suite/DECISIONS.md"];
const file = candidates.find(existsSync);
if (!file) process.exit(0);

let text;
try {
  text = readFileSync(file, "utf8");
} catch {
  process.exit(0);
}

// Grab the first up-to-3 "## " entries after the format header.
const entries = text.split(/\n(?=## )/).filter((s) => /^## \d{4}-\d{2}-\d{2}/.test(s.trim()));
if (entries.length === 0) process.exit(0);

const recent = entries.slice(0, 3).map((e) => {
  const title = (e.match(/^## (.+)$/m) || [, ""])[1];
  const decision = (e.match(/\*\*Decision:\*\*\s*(.+)$/m) || [, ""])[1];
  return `  • ${title}${decision ? ` — ${decision}` : ""}`;
});

process.stdout.write(`Recent decisions (${file}):\n${recent.join("\n")}\n`);
process.exit(0);
