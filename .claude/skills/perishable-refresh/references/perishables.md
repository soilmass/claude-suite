# Perishables catalog — what dates, and where to check it

Each item is marked perishable in the stack. Re-verify against the canonical source, not
memory. Touch ONLY these; durable principles are out of scope.

| Perishable item | Lives in | Canonical source to check |
|---|---|---|
| OWASP Top 10 ordering; "insecure design" & misconfiguration standings | security-pass refs, CLAUDE.md | owasp.org Top 10 (current edition) |
| Core Web Vitals: which metrics are current (FID→INP, future changes) | CLAUDE.md, CI budget, a11y-gate note | web.dev / Chrome team CWV docs |
| CWV p75 thresholds (LCP/INP/CLS numeric budgets) | CI perf budget config, CLAUDE.md | web.dev CWV thresholds |
| Next.js version & App Router API surface | t3-genesis scaffold, package.json | nextjs.org release notes |
| Drizzle ORM / drizzle-kit version & API | schema-design, migration-author, package.json | orm.drizzle.team docs/releases |
| Clerk edge middleware API | t3-genesis wiring, package.json | clerk.com docs |
| Tailwind v4 @theme syntax | design-tokens, CLAUDE.md | tailwindcss.com docs |
| Serverless DB driver (Neon/Turso) edge API | t3-genesis, src/db | the chosen driver's docs |
| Security header recommended values | security-pass headers ref | OWASP Secure Headers project |

## Durable (DO NOT touch in a refresh)
- The spine (Next.js App Router + Drizzle + Clerk + tRPC + Tailwind + Zod + RHF on edge).
- The nine inviolable rules.
- The type-chain discipline (Drizzle inference as root).
- Expand-contract migration principle.
These are stable by design. If one seems wrong, raise it as a separate spine-level
question — never as a quiet refresh edit.

## Output discipline
Walk every row above. For each: still-current, or changed → (world says X / canon says Y /
source). Flag downstream ripples. Propose; apply only on sign-off; record adopted changes
in DECISIONS.md.
