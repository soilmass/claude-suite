#!/usr/bin/env node
/**
 * lint-skill — validates a skill directory against the house style.
 *
 * Checks frontmatter shape, the trigger-surface phrases, the required section headings and
 * their order, source_of_truth resolvability, and the intact baseline placeholder. It does
 * NOT judge content quality — it enforces the structural contract so skills load and trigger.
 *
 * Usage:
 *   node lint-skill.mjs <skill-dir> [<skill-dir> ...]
 *   node lint-skill.mjs ../..            # lint every skill under a skills/ root
 *
 * Exit code: number of findings (0 = structurally valid).
 */
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node lint-skill.mjs <skill-dir> ...");
  process.exit(2);
}

// Required section headings, in the order they must appear. Optional ones are not enforced
// for presence but, if present, must not break the order.
const REQUIRED = [
  "## When to Use",
  "## When NOT to Use",
  "## Procedure",
  "## Composes With",
  "## Baseline failure", // matches the placeholder heading OR an evaluated "## Baseline failure"
  "## Examples",
  "## Edge Cases",
  "## References",
];

function findSkillDirs(p) {
  // A skill dir contains SKILL.md. If given a parent, descend one level to find them.
  if (existsSync(join(p, "SKILL.md"))) return [p];
  if (!existsSync(p) || !statSync(p).isDirectory()) return [];
  return readdirSync(p)
    .map((c) => join(p, c))
    .filter((c) => statSync(c).isDirectory() && existsSync(join(c, "SKILL.md")));
}

let findings = 0;
const report = (dir, msg) => {
  console.log(`[lint] ${dir}: ${msg}`);
  findings++;
};

const dirs = args.flatMap(findSkillDirs);
if (dirs.length === 0) console.log("no skill directories found");

for (const dir of dirs) {
  const file = join(dir, "SKILL.md");
  const src = readFileSync(file, "utf8");
  const slug = basename(resolve(dir));

  // --- frontmatter ---
  const fm = src.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) {
    report(slug, "missing YAML frontmatter (--- … ---)");
    continue;
  }
  const front = fm[1];

  const nameMatch = front.match(/^name:\s*(.+)$/m);
  if (!nameMatch) report(slug, "frontmatter missing `name`");
  else if (nameMatch[1].trim() !== slug)
    report(slug, `frontmatter name "${nameMatch[1].trim()}" != directory "${slug}"`);

  if (!/^license:\s*\S/m.test(front)) report(slug, "frontmatter missing `license`");

  if (!/description:\s*>/.test(front) && !/^description:\s*\S/m.test(front))
    report(slug, "frontmatter missing `description`");
  if (!/Use when:/.test(front)) report(slug, "description missing `Use when:` triggers");
  if (!/Do NOT use for:/.test(front))
    report(slug, "description missing `Do NOT use for:` anti-triggers");

  const sot = front.match(/source_of_truth:\s*(.+)$/m);
  if (!sot) report(slug, "metadata missing `source_of_truth`");
  else {
    const target = resolve(dirname(file), sot[1].trim());
    if (!existsSync(target)) report(slug, `source_of_truth not resolvable: ${sot[1].trim()}`);
  }

  // --- title ---
  if (!new RegExp(`^#\\s+${slug}\\b`, "m").test(src))
    report(slug, `body missing "# ${slug}" title heading`);

  // --- required sections, in order ---
  let cursor = 0;
  for (const heading of REQUIRED) {
    const idx = src.indexOf("\n" + heading);
    if (idx === -1) {
      report(slug, `missing section "${heading}"`);
    } else if (idx < cursor) {
      report(slug, `section "${heading}" is out of order`);
    } else {
      cursor = idx;
    }
  }

  // --- baseline must remain a labeled placeholder until a real transcript replaces it ---
  if (src.includes("## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)")) {
    if (!/Failure class encoded:/.test(src))
      report(slug, "baseline section missing `Failure class encoded:`");
  }
}

console.log(`\n${findings} finding(s) across ${dirs.length} skill(s).`);
process.exit(findings);
