#!/usr/bin/env node
/**
 * WCAG 2.2 contrast checker for design-tokens.
 * Gates palette output: no palette ships until every co-occurring fg/bg pair passes.
 *
 * Accepts hex (#rrggbb) or OKLCH (oklch(L C H) with L in 0..1 or 0..100%).
 *
 * Usage:
 *   node contrast.mjs "<fg>" "<bg>" [--large]
 *   node contrast.mjs "#1a1a1a" "#ffffff"
 *   node contrast.mjs "oklch(0.62 0.19 256)" "oklch(1 0 0)" --large
 *
 * AA thresholds: 4.5:1 normal text, 3:1 large text / UI components.
 * Exit 0 = pass, 1 = fail, 2 = bad input.
 */

const args = process.argv.slice(2);
const large = args.includes("--large");
const [fg, bg] = args.filter((a) => !a.startsWith("--"));
if (!fg || !bg) { console.error('usage: node contrast.mjs "<fg>" "<bg>" [--large]'); process.exit(2); }

// ---- parse to linear sRGB ----
function parse(c) {
  c = c.trim();
  if (c.startsWith("#")) return hexToRgb(c);
  if (c.startsWith("oklch")) return oklchToRgb(c);
  throw new Error(`unrecognized color: ${c}`);
}
function hexToRgb(h) {
  h = h.replace("#", "");
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
function oklchToRgb(s) {
  const m = s.match(/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*\)/i);
  if (!m) throw new Error(`bad oklch: ${s}`);
  let L = parseFloat(m[1]); if (m[1].includes("%")) L /= 100;
  const C = parseFloat(m[2]); const Hd = parseFloat(m[3]); const H = (Hd * Math.PI) / 180;
  const a = C * Math.cos(H), b = C * Math.sin(H);
  // OKLab -> linear sRGB (Björn Ottosson)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, mm = m_ ** 3, ss = s_ ** 3;
  const r =  4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * ss;
  const g = -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * ss;
  const bl = -0.0041960863 * l - 0.7034186147 * mm + 1.7076147010 * ss;
  return [r, g, bl].map((v) => Math.min(1, Math.max(0, lin2srgb(v)))).map(srgb2lin_passthrough);
}
// linear -> sRGB gamma, then we re-linearize in luminance(); keep as sRGB 0..1 here
function lin2srgb(v) { return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; }
function srgb2lin_passthrough(v) { return v; } // value is now sRGB 0..1

function luminance([r, g, b]) {
  const f = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

let L1, L2;
try {
  L1 = luminance(parse(fg));
  L2 = luminance(parse(bg));
} catch (e) { console.error(String(e.message || e)); process.exit(2); }

const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
const threshold = large ? 3 : 4.5;
const pass = ratio >= threshold;

console.log(`contrast ${ratio.toFixed(2)}:1  (need ${threshold}:1 for ${large ? "large/UI" : "normal text"})  ${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
