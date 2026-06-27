# design-tokens scripts

## contrast.mjs — WCAG 2.2 contrast gate

```
node contrast.mjs "<fg>" "<bg>" [--large]
node contrast.mjs "#1a1a1a" "#ffffff"
node contrast.mjs "oklch(0.62 0.19 256)" "oklch(1 0 0)" --large
```

Accepts hex or `oklch(L C H)` (L as 0..1 or %). Prints the ratio and PASS/FAIL against
the AA threshold (4.5:1 normal, 3:1 large/UI). Exit 0 pass, 1 fail, 2 bad input.

**Gate discipline:** run on every foreground/background pair that co-occurs in the UI
before emitting a palette. A non-passing pair must be adjusted, not shipped. Verified
against reference WCAG values (black/white = 21:1).
