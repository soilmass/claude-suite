# design-gate scripts

This gate ships **no script of its own** — it is suggestion-first judgment over the rendered
output and the `@theme` tokens, like `a11y-gate`. Where a mechanical check exists, it *invokes*
the siblings that own it; it never re-implements them.

## Distinguishability (color-system)

```
node ../../color-system/scripts/cvd-check.mjs <status/categorical colors...>
node ../../color-system/scripts/cvd-check.mjs --ramp <sequential/diverging stops...>
```

Exit code = number of failures. A non-zero on a status/categorical/chart set is a **blocker**
unless the meaning is already carried by a redundant label/icon (then downgrade to a note).

## Readability — informational only (design-tokens)

```
node ../../design-tokens/scripts/contrast.mjs "<fg>" "<bg>" [--large]
```

Use this only to *inform* a harmony suggestion. The pass/fail contrast verdict at done-time is
`a11y-gate`'s — do not restate a WCAG conformance result from this gate.

## Why no script here

"On the spacing scale," "right semantic role," "legible hierarchy," and "crafted empty state"
are judgments, not regex. The one deterministic color check (distinguishability) already lives
in `color-system`; duplicating it here would drift. If a recurring, mechanical design-adherence
check emerges (e.g. an `@theme`-token-usage linter), it belongs alongside `rule-audit`'s scanner,
not as a bespoke script in this gate.
