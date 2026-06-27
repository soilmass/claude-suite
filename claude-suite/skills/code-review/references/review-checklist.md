Purpose: the ordered code-review pass, the severity rubric, and the finding format for a diff that has already cleared the mechanical floor (rule-audit + type-chain-audit).

# Review checklist

This is the quality pass ABOVE the nine inviolable rules. Assume `rule-audit` and
`type-chain-audit` are green; if a nine-rule or inference defect surfaces, name it and route it,
do not relitigate it here. See `../../CLAUDE.md` for the spine and the rules.

## The ordered pass

Run these in order — earlier passes change how you read later ones.

1. **Scope.** `git diff` the change set (or the PR base...head). List the touched entry points:
   tRPC procedures, plain functions, components, hooks, Drizzle queries/schema, Zod schemas.
   Exclude generated/vendored files (`drizzle/` migrations, shadcn primitives, lockfiles) from
   nit-picking — review only authored code.

2. **Intent.** State, in one sentence, what the change is for. A "cleaner" suggestion that
   misreads intent is noise. If intent is unclear from the diff, that itself is a readability
   finding (name + comments should make intent obvious).

3. **Layering (spine alignment).** Check each piece is at the right layer:
   - tRPC procedures are THIN: validate input (Zod) → authorize (auth + ownership) → call a
     plain function → return. Business logic inlined in a procedure is a should-fix at minimum;
     it is also where missing ownership checks hide (Rule 2 — route to `rule-audit`).
   - Components don't orchestrate data fetching that belongs in a `use*` hook.
   - One shared Zod schema per entity-operation, not a client copy and a server copy.
   - Display-edge concerns (money formatting, timezone conversion) live at the display edge, not
     smeared through the data layer.

4. **Complexity & cohesion.** See `quality-heuristics.md`. Flag deep nesting, long/uncohesive
   functions, boolean-flag params, modules whose members don't belong together.

5. **Dead code & duplication.** See `quality-heuristics.md`. Unused exports, commented-out
   blocks, unreachable branches, copy-pasted logic with a clear consolidation target.

6. **Naming & readability.** See `quality-heuristics.md`. Every naming finding proposes the
   replacement name. Comments should explain WHY, not restate the code.

7. **Triage & report.** Group by severity, give each finding a location and a concrete fix.

## Severity rubric

- **Blocking** — must fix before merge. Wrong layer with real consequences (business logic in a
  procedure that should be testable/reusable), a correctness-adjacent smell, duplication that
  will cause divergent bugs, a name that actively misleads.
- **Should-fix** — address in this PR. Readability, extractable duplication, a function over the
  complexity threshold, a vague name in a public/exported surface.
- **Nit** — optional, author's discretion. Local-variable naming, comment tidy-ups, ordering.

Be honest: if the diff is genuinely clean, say so. Inventing should-fix findings to look
thorough trains authors to ignore the review.

## Finding format

Every finding, regardless of severity:

```
[severity] path/to/file.ts:LINE — <the smell, one phrase>
  → <the concrete change: the new name, the extraction target, the early-return rewrite>
```

Example:

```
[should-fix] src/server/api/routers/invoice.ts:42 — procedure inlines total computation
  → extract computeInvoiceTotals(lines) to src/lib/invoice.ts; procedure calls it (keeps it thin, unit-testable)
[nit] src/lib/pagination.ts:22 — `tmp` is uninformative
  → rename to `nextCursor`
```

## Routing table (out of scope here)

| If you find… | Route to |
| --- | --- |
| `any` / `@ts-ignore` / untyped boundary / inference break | `type-chain-audit` |
| Missing ownership, float money, missing state, N+1, etc. | `rule-audit` |
| Hardcoded style value (Rule 3) | `rule-audit` (then `design-tokens` / `tailwind-v4-component-style`) |
| Accessibility | `a11y-gate` |
| Security / abuse cases | `security-pass` |
| The actual sweeping cleanup of a blocking finding | `refactor` |
| A new project-wide convention you want to assert | record in `DECISIONS.md` first |
