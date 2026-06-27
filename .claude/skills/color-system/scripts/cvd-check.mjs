#!/usr/bin/env node
/**
 * cvd-check — color-vision-deficiency distinguishability + viz-ramp monotonicity checker.
 *
 * The sibling of design-tokens' contrast.mjs, and ORTHOGONAL to it: contrast.mjs answers
 * "is this fg/bg pair READABLE" (luminance ratio, WCAG AA). cvd-check answers a question
 * contrast math cannot — "do these colors stay TELLABLE APART for a color-blind user," and
 * "is this sequential/diverging viz ramp perceptually ordered." Two colors can pass any
 * contrast test against a background and still collapse into each other under deuteranopia.
 *
 * Two modes:
 *
 *   Categorical (default) — every color must stay distinguishable from every other under
 *   normal vision AND the three dichromacies (protanopia, deuteranopia, tritanopia). Reports
 *   any pair whose perceptual distance (OKLab ΔE) drops below the threshold under any sim.
 *     node cvd-check.mjs "oklch(0.62 0.19 256)" "#e11d48" "oklch(0.7 0.17 145)" ...
 *     node cvd-check.mjs --min 0.10 <colors...>
 *
 *   Ramp (--ramp) — a sequential/diverging viz ramp must be MONOTONIC in lightness so it
 *   survives grayscale and CVD. Reports every step that reverses or flattens lightness.
 *     node cvd-check.mjs --ramp "oklch(0.95 0.03 256)" "oklch(0.8 0.1 256)" "oklch(0.5 0.2 256)" ...
 *
 * Colors: hex (#rgb / #rrggbb) or oklch(L C H) with L as 0..1 or 0..100%.
 * Dichromacy simulation: Machado, Oliveira & Fernandes (2009) severity-1.0 matrices.
 * Default categorical threshold: OKLab ΔE 0.10 (well above the ~0.02 JND — categorical
 *   swatches need to be obviously, not just barely, distinct).
 *
 * Exit code = number of failures (collapsing pairs, or non-monotonic steps). 0 = clean.
 * Exit 2 = bad input/usage.
 */

const argv = process.argv.slice(2);
const ramp = argv.includes("--ramp");
let min = 0.10;
const minIdx = argv.indexOf("--min");
if (minIdx !== -1) { min = parseFloat(argv[minIdx + 1]); }
const colors = argv.filter((a, i) =>
  !a.startsWith("--") && !(minIdx !== -1 && i === minIdx + 1));

if (colors.length < 2) {
  console.error('usage: node cvd-check.mjs [--min <ΔE>] <colorA> <colorB> [...]');
  console.error('       node cvd-check.mjs --ramp <c0> <c1> [...]   (ordered light→dark or diverging)');
  process.exit(2);
}

// ---- parse any input to LINEAR sRGB (0..1, not gamma-encoded) ----
function parse(c) {
  c = c.trim();
  if (c.startsWith("#")) return srgbToLinear(hexToSrgb(c));
  if (c.startsWith("oklch")) return oklchToLinear(c);
  throw new Error(`unrecognized color: ${c}`);
}
function hexToSrgb(h) {
  h = h.replace("#", "");
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
function srgbToLinear(rgb) {
  return rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
}
function oklchToLinear(s) {
  const m = s.match(/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*\)/i);
  if (!m) throw new Error(`bad oklch: ${s}`);
  let L = parseFloat(m[1]); if (m[1].includes("%")) L /= 100;
  const C = parseFloat(m[2]); const H = (parseFloat(m[3]) * Math.PI) / 180;
  const a = C * Math.cos(H), b = C * Math.sin(H);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, mm = m_ ** 3, ss = s_ ** 3;
  return [
     4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * ss,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * ss,
    -0.0041960863 * l - 0.7034186147 * mm + 1.7076147010 * ss,
  ]; // linear sRGB
}

// ---- LINEAR sRGB -> OKLab (Björn Ottosson, forward) ----
function linearToOklab([r, g, b]) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}

// ---- dichromacy simulation in LINEAR sRGB (Machado et al. 2009, severity 1.0) ----
const CVD = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.011820, 0.042940, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.303900],
  ],
};
function applyMatrix(M, [r, g, b]) {
  return [
    M[0][0] * r + M[0][1] * g + M[0][2] * b,
    M[1][0] * r + M[1][1] * g + M[1][2] * b,
    M[2][0] * r + M[2][1] * g + M[2][2] * b,
  ];
}
const deltaE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

// ---- run ----
let linear;
try { linear = colors.map(parse); }
catch (e) { console.error(String(e.message || e)); process.exit(2); }

let failures = 0;

if (ramp) {
  // Sequential/diverging: lightness must move monotonically (allow one turning point for
  // diverging by checking |ΔL| direction consistency on each half is out of scope — we
  // assert simple monotonicity, the property that survives grayscale for a sequential ramp).
  const Ls = linear.map((c) => linearToOklab(c)[0]);
  const dir = Math.sign(Ls[1] - Ls[0]) || 1;
  for (let i = 1; i < Ls.length; i++) {
    const d = Ls[i] - Ls[i - 1];
    if (Math.sign(d) !== dir || d === 0) {
      failures++;
      console.log(
        `[ramp] step ${i - 1}→${i} breaks monotonic lightness: ` +
        `L ${Ls[i - 1].toFixed(3)} → ${Ls[i].toFixed(3)} (expected ${dir > 0 ? "increasing" : "decreasing"})`,
      );
    }
  }
  if (!failures) console.log(`[ramp] OK — ${colors.length} stops, lightness strictly ${dir > 0 ? "increasing" : "decreasing"}`);
} else {
  const labBySim = {};
  for (const sim of Object.keys(CVD)) {
    labBySim[sim] = linear.map((c) => linearToOklab(applyMatrix(CVD[sim], c)));
  }
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      let worstSim = null, worst = Infinity;
      for (const sim of Object.keys(CVD)) {
        const d = deltaE(labBySim[sim][i], labBySim[sim][j]);
        if (d < worst) { worst = d; worstSim = sim; }
      }
      if (worst < min) {
        failures++;
        console.log(
          `[collapse] "${colors[i]}" vs "${colors[j]}" — ΔE ${worst.toFixed(3)} under ` +
          `${worstSim} (need ≥ ${min}). These two are not tellable apart for that viewer.`,
        );
      }
    }
  }
  if (!failures) console.log(`[categorical] OK — all ${colors.length} colors stay ≥ ${min} ΔE apart under normal + protan + deutan + tritan vision`);
}

process.exit(failures);
