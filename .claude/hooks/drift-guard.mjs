#!/usr/bin/env node
/**
 * drift-guard — flags stack drift away from the decided spine.
 * Wired under hooks.PostToolUse (matcher: Edit|Write) in settings.json.
 *
 * The spine is Drizzle (not Prisma), App Router (not Pages Router), edge runtime. This hook
 * does NOT block (PostToolUse can't); it surfaces a warning on stderr when a write introduces
 * a known drift signal, so it gets caught at write time rather than in review.
 *
 * Contract: stdin = PostToolUse event JSON. Always exit 0 (advisory). Warnings on stderr.
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

const drift = [];
if (/@prisma\/client|from ["']\.?\/?prisma|PrismaClient/.test(content))
  drift.push("Prisma usage — the spine is Drizzle (see DECISIONS.md). Edge target chose Drizzle over Prisma.");
if (/getServerSideProps|getStaticProps|getInitialProps/.test(content))
  drift.push("Pages-Router data fetching — the spine is App Router only.");
if (/\/pages\//.test(path))
  drift.push(`file under pages/ (${path}) — App Router uses app/.`);
if (/runtime\s*[:=]\s*["']nodejs["']/.test(content))
  drift.push("runtime = 'nodejs' — the deployment target is the edge runtime; confirm this route truly needs Node.");

if (drift.length === 0) process.exit(0);

process.stderr.write(
  `\n[drift-guard] possible stack drift in ${path || "this write"}:\n` +
    drift.map((d) => `  ! ${d}`).join("\n") +
    `\nIf intentional, record the deviation in DECISIONS.md with a reason.\n`
);
process.exit(0);
