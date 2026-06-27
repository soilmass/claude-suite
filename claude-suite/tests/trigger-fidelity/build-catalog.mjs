#!/usr/bin/env node
/**
 * build-catalog — generate the skill catalog the trigger-fidelity routing test classifies against.
 *
 * Reads every <skillsDir>/<slug>/SKILL.md, extracts its frontmatter `description` (the real
 * trigger surface: the prose + "Use when:" + "Do NOT use for:"), and writes a flat catalog the
 * blind classifier agents read. Deterministic, no network. Run before the routing workflow.
 *
 * Usage (from the repo root):
 *   node claude-suite/tests/trigger-fidelity/build-catalog.mjs [skillsDir] [outFile]
 * Defaults: skillsDir=.claude/skills  outFile=claude-suite/tests/trigger-fidelity/.catalog.md
 */
import { readdirSync, existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const skillsDir = process.argv[2] || ".claude/skills";
const outFile = process.argv[3] || "claude-suite/tests/trigger-fidelity/.catalog.md";

if (!existsSync(skillsDir)) {
  console.error(`skills dir not found: ${skillsDir}`);
  process.exit(2);
}

const dirs = readdirSync(skillsDir)
  .filter((d) => existsSync(join(skillsDir, d, "SKILL.md")))
  .sort();

let out = "# Skill catalog (name + description / trigger surface)\n\n";
for (const d of dirs) {
  const src = readFileSync(join(skillsDir, d, "SKILL.md"), "utf8");
  const fm = src.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) continue;
  const m = fm[1].match(/description:\s*>([\s\S]*?)(?:\nlicense:|\nmetadata:)/);
  const desc = (m ? m[1] : "").replace(/\n\s+/g, " ").trim();
  out += `- **${d}**: ${desc}\n`;
}

writeFileSync(outFile, out);
console.log(`catalog: ${dirs.length} skills -> ${outFile} (${statSync(outFile).size} bytes)`);
