Purpose: the mechanical scan patterns for every type-chain escape hatch, the per-hop questions to ask once the loud grep is done, and the severity/reconnect rubric for writing the finding report.

# Step 1 — grep the loud breaks

Run against the slice's files (schema, router, schemas, components, hooks, lib). Each hit is a
candidate Rule 1 violation; capture file:line, then judge (step 4 below).

```bash
# escape hatches that disable the checker
rg -n '\bany\b|: any|<any>|as any|as unknown as' src/<slice>
rg -n '@ts-ignore|@ts-expect-error|@ts-nocheck' src/<slice>
rg -n '\bsatisfies\b| as [A-Z]' src/<slice>        # casts (skip `as const` after review)
rg -n '!\.' src/<slice>                            # non-null assertions: data!.x, foo!.bar

# untyped boundary crossings
rg -n 'JSON\.parse\(' src/<slice>                  # must feed a Zod .parse, not a typed var
rg -n '\bfetch\(' src/<slice>                      # .json() returns any unless parsed
rg -n 'process\.env\.' src/<slice>                 # must come from the validated env module

# parallel chains on the client (the silent break)
rg -n 'interface .*\{|type .* = \{' src/<slice>/*.tsx   # redeclared shapes vs RouterOutputs
```

Notes:
- `as const` is legitimate (literal narrowing). Review and clear it, don't auto-flag.
- A `!` inside test files is lower priority than one in render/data paths.
- `: unknown` is *good* at a boundary — it forces a parse before use. Flag the absence of the
  parse, not the `unknown`.

# Step 2 — per-hop questions

For each hop in `references/chain-anatomy.md`, answer yes/no. Any "no" is a break.

| Hop | Question | Break if "no" |
|-----|----------|---------------|
| Drizzle → Zod | Is the schema derived via `createInsertSchema`/`createSelectSchema` (or `.pick`/`.omit` off one), not hand-restated columns? | parallel schema; drifts on column change |
| Zod → tRPC | Does the procedure use the shared schema symbol for `.input()`, and `return` the inferred row (not an `as`-asserted literal)? | output type lies about the data |
| tRPC → client | Does the client read `RouterInputs`/`RouterOutputs` rather than a local `interface`/`type` mirroring the row? | new field is `undefined`, no compile error |
| schema → RHF | Are `useForm<z.infer<…>>` and `zodResolver(sameSchema)` rooted in one schema, with no `mutate(values as …)`? | form sends a stale/renamed shape |
| query → props | Are loading/error/empty guarded so `data` narrows to the row without `!`? | erased undefined case (Rules 1 + 4) |

# Step 3 — the true boundaries (unknown in)

These enter the program as `unknown`/`any` and MUST be Zod-`.parse()`d before any property is
read. Confirm a parse exists between the raw value and its first use (overlaps Rule 8):

- webhook bodies — `schema.parse(JSON.parse(await req.text()))`, never `body.field` raw.
- `searchParams` / route params — `z.coerce`-parsed in the server component.
- `localStorage` / `sessionStorage` — parsed on read; storage returns `string | null`.
- third-party `fetch` JSON — `schema.parse(await res.json())`; `.json()` is `any`.
- `process.env` — read only from the validated env module (see `env-validation`), never raw.

# Step 4 — classify each candidate cast

For every `as` / `!` / `satisfies` hit:

- **Sanctioned:** narrows a genuinely-`unknown` value *immediately after* its Zod `.parse`, or
  an unavoidable third-party-types workaround isolated in one adapter function with a parse at
  its edge (record in `DECISIONS.md`). Note as reviewed; not a finding.
- **Break:** asserts a shape to silence a mismatch, widens via `satisfies`, fakes a literal
  type, or `!`-erases an `undefined`/loading case. This is a finding.

# Step 5 — severity rubric (how far a wrong shape travels)

- **High** — break at or before the tRPC boundary (Drizzle/Zod/router): a wrong shape reaches
  every consumer and surfaces only at runtime, often as corrupt persisted data.
- **Medium** — break at the client redeclare or RHF hop: contained to one feature's UI/submit,
  but drifts silently on the next schema change.
- **Low** — break in a leaf component prop or a test: visible quickly, blast radius of one file.

# Step 6 — report shape

One block per finding:

```
[HIGH] src/server/api/routers/order.ts:42
  Hop severed: Zod → tRPC. `return { ...row, total: row.total } as OrderRow`
  asserts a literal as the inferred row; output type no longer reflects the columns.
  Reconnect: return the `.returning()` row directly; delete the cast.
  Overlaps: none. (If money were floated here, also flag Rule 5 for rule-audit.)
```

Close the report with: hops confirmed intact, count by severity, and any hand-offs (refactor
for a sweeping reconnect, migration-author for a column-type cause).
