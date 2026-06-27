#!/usr/bin/env node
/**
 * pre-commit-gate — runs the rule-audit mechanical pass on staged files before a `git commit`.
 * Wired under hooks.PreToolUse (matcher: Bash) in settings.json.
 *
 * Contract: reads the PreToolUse event JSON on stdin. Only acts when the Bash command is a
 * `git commit`. Exit 0 = allow; exit 2 = block with a reason + fix on stderr.
 *
 * It does NOT replace the rule-audit judgment pass (rules 2/4/8 still need a human read) — it
 * blocks only on machine-detectable candidates so obvious violations never land in a commit.
 */
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

let event;
try {
  event = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0); // no event => nothing to gate
}

const cmd = event?.tool_input?.command ?? "";
if (!/\bgit\s+commit\b/.test(cmd)) process.exit(0); // only gate commits

// Locate the rule-audit mechanical scanner in the installed project.
const candidates = [
  ".claude/skills/rule-audit/scripts/scan.mjs",
  "claude-suite/skills/rule-audit/scripts/scan.mjs",
];
const scanner = candidates.find(existsSync);
if (!scanner) process.exit(0); // scanner not installed here; don't block

// Scan everything that could land in this commit. A PreToolUse hook runs BEFORE the bash
// command, so a combined `git add … && git commit` (or `git commit -a`) has nothing staged
// yet at this point. To fail closed, scan the union of staged + working-tree changes +
// untracked code files reported by `git status --porcelain`.
let files;
try {
  files = execSync("git status --porcelain --untracked-files=all", { encoding: "utf8" })
    .split("\n")
    .map((l) => l.slice(3)) // strip the "XY " status prefix
    .map((p) => (p.includes(" -> ") ? p.split(" -> ")[1] : p)) // rename: take the new path
    .map((p) => p.trim().replace(/^"|"$/g, ""))
    .filter((f) => /\.(ts|tsx|js|jsx)$/.test(f) && existsSync(f));
  files = [...new Set(files)];
} catch {
  process.exit(0); // not a git repo
}
if (files.length === 0) process.exit(0);

let findings = 0;
try {
  execSync(`node ${scanner} ${files.map((f) => `'${f}'`).join(" ")}`, { stdio: "inherit" });
} catch (e) {
  findings = typeof e.status === "number" ? e.status : 1;
}

if (findings > 0) {
  process.stderr.write(
    `\nBlocked by pre-commit-gate: rule-audit found ${findings} mechanical candidate(s) in the changed/staged code.\n` +
      `Fix them, or run /audit for the full pass. To commit anyway, state the intent and re-run with the override.\n`
  );
  process.exit(2);
}
process.exit(0);
