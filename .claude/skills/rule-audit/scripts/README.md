# rule-audit scripts

## scan.mjs — the mechanical pass

```
node scan.mjs <file-or-dir> ...
git diff --name-only --diff-filter=d | grep -E '\.(ts|tsx|js|jsx)$' | xargs node scan.mjs
```

Exit code = number of mechanical candidates found. **Exit 0 does NOT mean the diff
passed** — it means the regex pass found nothing. The judgment pass in SKILL.md (rules
2, 4, 8) still has to run.

### What it CAN detect (regex-level)
- rule 1: `any`, `@ts-ignore`/`@ts-expect-error`, bare `JSON.parse`/`fetch` near no Zod
- rule 3: raw hex, arbitrary `[Npx]` in className
- rule 5: money columns typed `real`/`doublePrecision`/`number`
- rule 6: `timestamp(...)` missing `withTimezone: true`
- rule 7: a query call inside `.map`/`.forEach` (flagged as a JUDGMENT CALL)
- rule 9: secret-shaped `NEXT_PUBLIC_` vars

### What it CANNOT detect (needs the judgment pass)
- rule 2 (ownership): it can only point at each `protectedProcedure`; whether an
  ownership check exists is a reading task.
- rule 4 (four states): requires understanding component data flow.
- rule 8 (validated boundaries): partial only; full coverage is a reading task.

Treat the script as a flashlight, not a verdict.
