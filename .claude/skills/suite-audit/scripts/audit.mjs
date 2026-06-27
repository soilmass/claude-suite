#!/usr/bin/env node
/**
 * suite-audit — lint the whole claude-suite for structural and coherence problems.
 *
 * Checks, across skills/ + agents/ + commands/:
 *   - skills: the structural contract (delegates to skill-create/scripts/lint-skill.mjs)
 *   - agents: frontmatter (name matches file, description has "Use when:", a tools line),
 *             least-privilege (reviewers/auditors must not hold Write/Edit), and an Output section
 *   - commands: frontmatter description, and a thin body that names a skill/agent (or is marked
 *               self-contained)
 *   - cross-references: kebab slugs cited in "Composes With" / hand-offs that resolve to a real
 *     primitive or a known foundation slug (else: possible dead reference — a warning)
 *   - duplicate triggers: identical "Use when:" phrases shared by two skills (a warning)
 * And (with --write) regenerates docs/composition-map.md.
 *
 * Usage:
 *   node audit.mjs <suite-root>            # audit only
 *   node audit.mjs <suite-root> --write    # audit + regenerate composition-map.md
 *
 * Exit code = number of STRUCTURAL findings (warnings do not count). 0 = structurally sound.
 */
import { readFileSync, existsSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { execSync } from "node:child_process";

const root = resolve(process.argv[2] || ".");
const write = process.argv.includes("--write");
const skillsDir = join(root, "skills");
const agentsDir = join(root, "agents");
const commandsDir = join(root, "commands");

// Foundation / external slugs that legitimately appear in references but live outside the suite.
const FOUNDATION = new Set([
  "t3-genesis", "design-tokens", "schema-design", "vertical-slice", "refactor",
  "migration-author", "rule-audit", "a11y-gate", "security-pass", "perishable-refresh",
  "color-system", "typography-system", "layout-composition", "motion-system", "design-gate",
  "deep-research", "draft-adr", "draft-conventional-commit", "optimization-loop",
  "draft-launch-comms", "draft-runbook", "draft-change-request", "bisect",
]);

let structural = 0;
const warn = [];
const note = (m) => { console.log(`[FAIL] ${m}`); structural++; };
const warning = (m) => { warn.push(m); };

const dirsIn = (d) =>
  existsSync(d) ? readdirSync(d).map((c) => join(d, c)).filter((p) => statSync(p).isDirectory()) : [];
const filesIn = (d, ext) =>
  existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(ext)).map((f) => join(d, f)) : [];

const skillSlugs = dirsIn(skillsDir).filter((d) => existsSync(join(d, "SKILL.md"))).map((d) => basename(d));
const agentSlugs = filesIn(agentsDir, ".md").map((f) => basename(f, ".md"));
const commandSlugs = filesIn(commandsDir, ".md").map((f) => basename(f, ".md"));
const known = new Set([...skillSlugs, ...agentSlugs, ...commandSlugs, ...FOUNDATION]);

console.log(`Suite: ${skillSlugs.length} skills, ${agentSlugs.length} agents, ${commandSlugs.length} commands\n`);

// ---- 1. skills: structural lint via the shared linter ----
const linter = join(skillsDir, "skill-create", "scripts", "lint-skill.mjs");
if (existsSync(linter)) {
  try {
    execSync(`node '${linter}' '${skillsDir}'`, { stdio: "inherit" });
  } catch (e) {
    const n = typeof e.status === "number" ? e.status : 1;
    structural += n;
    console.log(`(skill lint contributed ${n} structural finding(s))\n`);
  }
} else {
  warning("skill-create linter not found; skipped skill structural lint");
}

// ---- 2. agents ----
for (const file of filesIn(agentsDir, ".md")) {
  const slug = basename(file, ".md");
  const src = readFileSync(file, "utf8");
  const fm = src.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) { note(`agent ${slug}: missing frontmatter`); continue; }
  const front = fm[1];
  const nm = front.match(/^name:\s*(.+)$/m);
  if (!nm) note(`agent ${slug}: missing name`);
  else if (nm[1].trim() !== slug) note(`agent ${slug}: name "${nm[1].trim()}" != filename`);
  if (!/Use when:/.test(front)) note(`agent ${slug}: description missing "Use when:"`);
  const toolsLine = front.match(/^tools:\s*(.+)$/m);
  if (!toolsLine) warning(`agent ${slug}: no tools line (inherits all tools)`);
  if (!/## Output/.test(src)) note(`agent ${slug}: missing "## Output" section`);
  // least-privilege: read-only roles must not write
  if (/(review|audit|hunter|planner|describer)/.test(slug) && toolsLine && /\b(Write|Edit)\b/.test(toolsLine[1]))
    note(`agent ${slug}: read-only role holds Write/Edit (violates least-privilege)`);
}

// ---- 3. commands ----
for (const file of filesIn(commandsDir, ".md")) {
  const slug = basename(file, ".md");
  const src = readFileSync(file, "utf8");
  const fm = src.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) { note(`command /${slug}: missing frontmatter`); continue; }
  if (!/^description:\s*\S/m.test(fm[1])) note(`command /${slug}: missing description`);
  const body = src.slice(fm[0].length).trim();
  const namesPrimitive = [...known].some((k) => new RegExp(`\\b${k}\\b`).test(body));
  const selfContained = /self-contained|no skill|no single skill|follow a loop|produce a/i.test(body);
  if (!namesPrimitive && !selfContained)
    warning(`command /${slug}: body names no known primitive and isn't marked self-contained`);
}

// ---- 4. cross-references (warnings) ----
const refRe = /`([a-z0-9]+(?:-[a-z0-9]+)+)`/g;
const checkRefs = (file, label) => {
  const src = readFileSync(file, "utf8");
  // focus on the Composes With section + hand-off lines to reduce noise
  const section = (src.split(/\n## /).find((s) => s.startsWith("Composes With")) || "");
  const handoffs = src.split("\n").filter((l) => /Hands off|use [a-z0-9-]+\)/i.test(l)).join("\n");
  const hay = section + "\n" + handoffs;
  let m;
  const seen = new Set();
  while ((m = refRe.exec(hay)) !== null) {
    const tok = m[1];
    if (seen.has(tok)) continue;
    seen.add(tok);
    if (!known.has(tok) && tok.endsWith("md") === false && !/\.(ts|tsx|mjs)/.test(tok))
      warning(`${label}: references unknown slug \`${tok}\` (possible dead reference)`);
  }
};
for (const d of dirsIn(skillsDir)) if (existsSync(join(d, "SKILL.md"))) checkRefs(join(d, "SKILL.md"), `skill ${basename(d)}`);

// ---- 5. duplicate triggers (warnings) ----
const triggerOwners = new Map();
for (const d of dirsIn(skillsDir)) {
  const f = join(d, "SKILL.md");
  if (!existsSync(f)) continue;
  const src = readFileSync(f, "utf8");
  const useWhen = (src.match(/Use when:([\s\S]*?)(?:Do NOT use for:|---|\n\n)/) || [, ""])[1];
  const phrases = [...useWhen.matchAll(/"([^"]+)"/g)].map((x) => x[1].toLowerCase().trim());
  for (const p of phrases) {
    if (!triggerOwners.has(p)) triggerOwners.set(p, []);
    triggerOwners.get(p).push(basename(d));
  }
}
for (const [p, owners] of triggerOwners) {
  if (owners.length > 1) warning(`duplicate trigger "${p}" claimed by: ${owners.join(", ")}`);
}

// ---- 6. regenerate composition-map.md ----
if (write) {
  const lines = ["# Composition map", "", "Generated by `suite-audit`. Each skill with its first-sentence purpose.", ""];
  const groups = {};
  for (const d of dirsIn(skillsDir)) {
    const f = join(d, "SKILL.md");
    if (!existsSync(f)) continue;
    const src = readFileSync(f, "utf8");
    const desc = (src.match(/description:\s*>([\s\S]*?)Use when:/) || [, ""])[1].replace(/\s+/g, " ").trim();
    const first = desc.split(/(?<=\.)\s/)[0] || desc;
    (groups["skills"] ||= []).push(`- \`${basename(d)}\` — ${first}`);
  }
  lines.push(`## Skills (${(groups.skills || []).length})`, "", ...(groups.skills || []).sort(), "");
  lines.push(`## Agents (${agentSlugs.length})`, "", ...agentSlugs.sort().map((s) => `- \`${s}\``), "");
  lines.push(`## Commands (${commandSlugs.length})`, "", ...commandSlugs.sort().map((s) => `- \`/${s}\``), "");
  const out = join(root, "docs", "composition-map.md");
  writeFileSync(out, lines.join("\n") + "\n");
  console.log(`\nWrote ${out}`);
}

// ---- summary ----
console.log(`\n--- suite-audit summary ---`);
console.log(`structural findings: ${structural}`);
console.log(`warnings: ${warn.length}`);
for (const w of warn) console.log(`  [warn] ${w}`);
process.exit(structural);
