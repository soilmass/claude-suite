#!/usr/bin/env node
/**
 * protect-source-of-truth — guards CLAUDE.md and DECISIONS.md against silent edits.
 * Wired under hooks.PreToolUse (matcher: Edit|Write) in settings.json.
 *
 * These two files are the spine. They should change deliberately, with the change announced —
 * not as an incidental side effect of some other task. This hook blocks an Edit/Write to them
 * unless the tool input carries an explicit acknowledgement marker, nudging the agent to
 * surface the change to the user (and, for DECISIONS.md, to use the decision-log skill).
 *
 * Contract: stdin = PreToolUse event JSON. Exit 0 = allow; exit 2 = block with guidance.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

let event;
try {
  event = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const path = event?.tool_input?.file_path ?? "";
const name = basename(path);
const PROTECTED = new Set(["CLAUDE.md", "DECISIONS.md"]);
if (!PROTECTED.has(name)) process.exit(0);

// Allow when the edit content/instructions explicitly acknowledge the source-of-truth change.
const blob = JSON.stringify(event?.tool_input ?? {});
const acknowledged = /SOURCE-OF-TRUTH-EDIT-ACK|DECISIONS-APPEND-ACK/.test(blob);
if (acknowledged) process.exit(0);

process.stderr.write(
  `\nBlocked by protect-source-of-truth: ${name} is a spine file and should not be edited silently.\n` +
    (name === "DECISIONS.md"
      ? `Use the decision-log skill to append a structured entry, or include the marker DECISIONS-APPEND-ACK to proceed.\n`
      : `Announce the rule/spine change to the user first, or include the marker SOURCE-OF-TRUTH-EDIT-ACK to proceed.\n`)
);
process.exit(2);
