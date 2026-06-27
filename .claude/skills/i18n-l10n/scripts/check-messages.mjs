#!/usr/bin/env node
/**
 * check-messages — verify every locale catalog mirrors the default-locale source of truth.
 *
 * The default-locale file (e.g. messages/en.json) defines the canonical key set. Every other
 * catalog must have exactly those keys: a MISSING key would render a fallback or a blank to a
 * user, an EXTRA key is a dead/renamed string. TypeScript type-checks key *usage in code*, but
 * cannot see that a translator deleted a key from fr.json — this closes that runtime gap so a
 * missing key fails CI instead of shipping `undefined`.
 *
 * Usage:
 *   node check-messages.mjs [<messages-dir>] [--default <locale>]
 *     <messages-dir>    directory of <locale>.json catalogs (default: ./messages)
 *     --default <loc>   source-of-truth locale basename (default: en)
 *
 * Exit code: total number of mismatches (missing + extra) across all locales. 0 = aligned.
 * It does NOT judge translation quality — only key parity.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const args = process.argv.slice(2);
let dir = "messages";
let defaultLocale = "en";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--default") defaultLocale = args[++i];
  else dir = args[i];
}

if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error(`check-messages: messages dir not found: ${dir}`);
  process.exit(2);
}

const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const defaultFile = join(dir, `${defaultLocale}.json`);
if (!files.length || !existsSync(defaultFile)) {
  console.error(`check-messages: no ${defaultLocale}.json source catalog in ${dir}`);
  process.exit(2);
}

/** Collect every leaf key as a dot-path; arrays are treated as leaves. */
function keyPaths(obj, prefix = "") {
  const out = [];
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const k of Object.keys(obj)) {
      const p = prefix ? `${prefix}.${k}` : k;
      const child = keyPaths(obj[k], p);
      if (child.length) out.push(...child);
      else out.push(p);
    }
  } else {
    out.push(prefix);
  }
  return out;
}

function load(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    console.error(`check-messages: ${basename(file)} is not valid JSON — ${err.message}`);
    process.exit(2);
  }
}

const sourceKeys = new Set(keyPaths(load(defaultFile)));
let mismatches = 0;

for (const f of files) {
  if (f === `${defaultLocale}.json`) continue;
  const keys = new Set(keyPaths(load(join(dir, f))));
  const missing = [...sourceKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !sourceKeys.has(k));
  for (const k of missing) console.log(`[missing] ${f}: ${k}`);
  for (const k of extra) console.log(`[extra]   ${f}: ${k}`);
  mismatches += missing.length + extra.length;
}

const others = files.filter((f) => f !== `${defaultLocale}.json`).length;
console.log(
  `\n${mismatches} mismatch(es) across ${others} locale(s) vs ${defaultLocale} (${sourceKeys.size} keys).`,
);
process.exit(mismatches);
