#!/usr/bin/env node
/**
 * skill-lint — validates a SKILL.md the moment it's written.
 * Wired under hooks.PostToolUse (matcher: Write) in settings.json.
 *
 * When a write targets a SKILL.md file, run the structural linter on that skill directory so a
 * malformed skill (missing triggers, wrong section order, broken baseline) is caught at
 * authoring time rather than when it silently fails to trigger. Advisory — exit 0 always.
 *
 * Contract: stdin = PostToolUse event JSON. Warnings on stderr.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { execSync } from "node:child_process";

let event;
try {
  event = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const path = event?.tool_input?.file_path ?? "";
if (!/\/SKILL\.md$/.test(path)) process.exit(0);

const skillDir = dirname(path);
const candidates = [
  ".claude/skills/skill-create/scripts/lint-skill.mjs",
  "claude-suite/skills/skill-create/scripts/lint-skill.mjs",
];
const linter = candidates.find(existsSync);
if (!linter) process.exit(0);

try {
  execSync(`node ${linter} '${skillDir}'`, { stdio: "inherit" });
} catch (e) {
  const n = typeof e.status === "number" ? e.status : 1;
  process.stderr.write(
    `\n[skill-lint] ${n} structural finding(s) in ${skillDir} — fix before relying on this skill to trigger.\n`
  );
}
process.exit(0);
