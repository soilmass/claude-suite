#!/usr/bin/env node
/**
 * typecheck-on-touch — OPT-IN, OFF BY DEFAULT. Runs `tsc --noEmit` after editing a .ts/.tsx.
 * NOT wired in settings.json by default — a full typecheck on every edit is too slow for most
 * repos. Enable it deliberately (add it under hooks.PostToolUse, matcher Edit|Write) only in a
 * small project or with an incremental/project-references tsconfig where it stays fast.
 *
 * Contract: stdin = PostToolUse event JSON. Advisory — exit 0 always; type errors on stderr.
 * Honors a kill switch: set SUITE_TYPECHECK_ON_TOUCH=0 to no-op even if wired.
 */
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

if (process.env.SUITE_TYPECHECK_ON_TOUCH === "0") process.exit(0);

let event;
try {
  event = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const path = event?.tool_input?.file_path ?? "";
if (!/\.(ts|tsx)$/.test(path)) process.exit(0);
if (!existsSync("tsconfig.json")) process.exit(0);

try {
  execSync("npx tsc --noEmit --pretty false", { encoding: "utf8" });
} catch (e) {
  const out = `${e.stdout || ""}${e.stderr || ""}`.trim();
  if (out)
    process.stderr.write(
      `\n[typecheck-on-touch] tsc reported errors after editing ${path}:\n${out.split("\n").slice(0, 20).join("\n")}\n`
    );
}
process.exit(0);
