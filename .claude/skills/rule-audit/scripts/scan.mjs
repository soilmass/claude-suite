#!/usr/bin/env node
/**
 * rule-audit mechanical pass.
 *
 * Flags MACHINE-DETECTABLE candidates for the nine inviolable rules (see ../../../CLAUDE.md).
 * It does NOT judge — it narrows where the human/judgment pass looks. Rules 2 (ownership)
 * and 4 (four states) are only partially mechanical; their flags here are hints, and the
 * SKILL.md judgment pass is authoritative for them.
 *
 * Usage:
 *   node scan.mjs <file-or-dir> [<file-or-dir> ...]
 *   git diff --name-only --diff-filter=d | xargs node scan.mjs
 *
 * Exit code: number of findings (0 = no mechanical candidates; non-zero != "clean",
 * because the judgment pass still has to run).
 */
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";

const EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node scan.mjs <file-or-dir> ...");
  process.exit(2);
}

// rule => [ {re, msg, hint} ]
const RULES = {
  "1 type-chain": [
    { re: /(?::\s*|<|\bas\s+|\|\s*|&\s*)any\b(?!\s*\/\/\s*audited)/g, msg: "`any` type", hint: "infer from Drizzle/router types instead" },
    { re: /@ts-(ignore|expect-error)/g, msg: "ts suppression", hint: "fix the type, don't suppress it" },
    { re: /JSON\.parse\((?![^)]*\bz\.)/g, msg: "JSON.parse without Zod nearby", hint: "parse external JSON through a Zod schema (rule 8 too)" },
    { re: /\bfetch\([^)]*\)(?![^;]*z\.)/g, msg: "fetch result not obviously validated", hint: "validate the response body with Zod" },
  ],
  "3 hardcoded-style": [
    { re: /#[0-9a-fA-F]{3,8}\b/g, msg: "raw hex color", hint: "use an OKLCH @theme token" },
    { re: /className="[^"]*\[[0-9]+px\]/g, msg: "arbitrary px in className", hint: "use a spacing/size token" },
  ],
  "5 float-money": [
    { re: /(price|amount|total|cost|balance|fee)\w*:\s*(real|doublePrecision|number)\b/gi, msg: "money as float/number", hint: "integer minor units or a decimal type" },
  ],
  "6 local-time": [
    { re: /timestamp\((?![^)]*withTimezone:\s*true)/g, msg: "timestamp without withTimezone", hint: "use timestamptz (withTimezone: true), UTC" },
  ],
  "7 n-plus-1": [
    // crude: an await ...query... inside a .map/.forEach arrow
    { re: /\.(map|forEach)\(\s*(async\s*)?\([^)]*\)\s*=>\s*\{[^}]*await[^}]*\.(findMany|findFirst|select|query)\b/gs, msg: "query inside a loop (possible N+1)", hint: "use a Drizzle relational query / join (judgment call — confirm)" },
  ],
  "9 client-secret": [
    { re: /NEXT_PUBLIC_\w*(SECRET|KEY|TOKEN|PASSWORD|PRIVATE)/gi, msg: "secret-shaped NEXT_PUBLIC_ var", hint: "secrets must not be public; move server-side" },
  ],
  "2 ownership (HINT only)": [
    { re: /protectedProcedure\b/g, msg: "protectedProcedure present — judgment pass MUST confirm an ownership check exists", hint: "see SKILL.md step 3; this hint cannot verify the check itself" },
  ],
};

function walk(p) {
  const s = statSync(p);
  if (s.isDirectory()) {
    if (/node_modules|\.next|dist|build/.test(p)) return [];
    return readdirSync(p).flatMap((c) => walk(join(p, c)));
  }
  return EXTS.has(extname(p)) ? [p] : [];
}

const files = args.flatMap(walk);
let findings = 0; // real mechanical violations — drives the exit code (gates key on this)
let hints = 0;    // informational (e.g. rule-2 presence) — printed but NOT counted

for (const file of files) {
  let src;
  try { src = readFileSync(file, "utf8"); } catch { continue; }
  const lines = src.split("\n");
  for (const [rule, pats] of Object.entries(RULES)) {
    for (const { re, msg, hint } of pats) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src)) !== null) {
        const line = src.slice(0, m.index).split("\n").length;
        const isHint = rule.includes("HINT");
        const sev = isHint ? "HINT" : (rule.startsWith("1") ? "HIGH" : "MED");
        console.log(`[${sev} rule ${rule}] ${file}:${line} — ${msg}\n    ↳ ${hint}\n    | ${(lines[line-1]||"").trim().slice(0,100)}`);
        if (isHint) hints++; else findings++;
        if (!re.global) break;
      }
    }
  }
}

console.log(`\n${findings} mechanical violation(s)${hints ? `, ${hints} hint(s)` : ""}. NOTE: 0 here does NOT mean "clean" — the rule-2/4/8 judgment pass (incl. the ${hints} ownership hint(s)) still has to run.`);
process.exit(findings);
