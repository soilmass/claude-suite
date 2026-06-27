---
name: type-chain-audit
description: >
  Deep, single-rule audit that the Drizzle → Zod → tRPC → React Hook Form → component type
  chain is unbroken end to end, with no `any`, `as` casts, non-null `!`, `@ts-ignore`, or
  untyped `fetch`/`JSON.parse` bridging a boundary. Walks each hop, confirms every type
  traces back to Drizzle inference as its root, and reports each break with its location and
  the concrete reconnect fix. This is the focused Rule 1 deep-dive, not the full nine-rule
  scan.
  Use when: "check the types", "type chain", "is the type chain intact", "any leaks".
  Do NOT use for: the full nine-rule scan (use rule-audit), or building the chain in the
  first place (use vertical-slice).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the broken-type-chain failure class: a cast, `any`, or
    untyped parse silently severs inference at one hop so a downstream shape drift compiles.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# type-chain-audit

Trace one slice's types from the Drizzle table outward and prove no hop is bridged by an
escape hatch — the deep version of Rule 1. See `../../CLAUDE.md` for the spine (Drizzle
inference is the root of the type chain) and the nine rules; this skill audits Rule 1 alone,
in depth, where `rule-audit` would only flag the loud cases in passing.

## When to Use

- You want to confirm a feature's types are genuinely connected, not just compiling, before
  merge or after a refactor.
- A shape changed (a column, a Zod field, a procedure output) and you need to know everywhere
  the change should have propagated but a cast absorbed it instead.
- You suspect an `any` or `as` is laundering an unknown shape across a boundary.
- A bug looks like a type mismatch that the compiler should have caught but didn't.

## When NOT to Use

- Scanning a diff against all nine rules at once: use **rule-audit** (this is the Rule 1
  deep-dive it defers to).
- Building the chain — model → procedure → schema → form → component: use **vertical-slice**.
- Sweeping a rename/restructure across the chain once breaks are found: hand off to
  **refactor**.
- Authoring the migration a column change implies: use **migration-author**.

## Procedure

1. **Scope the chain and find its root (low).** Pick the slice(s) under audit and identify the
   Drizzle table(s) in `src/db/schema/`. Every type in the slice must trace back to a
   `$inferSelect`/`$inferInsert` (or `createSelectSchema`/`createInsertSchema`) on those
   tables. A type with no path back to inference is already a break. See
   `references/chain-anatomy.md`.
2. **Grep the loud breaks first (low).** Scan the slice's files for `any`, `as any`,
   `@ts-ignore`, `@ts-expect-error`, `as unknown as`, non-null `!`, and bare `JSON.parse(` /
   untyped `fetch(`. These are unambiguous Rule 1 violations; record each with file:line. See
   `references/audit-checklist.md` for the exact patterns.
3. **Walk each hop and confirm inference flows through it (high — the whole point).** Drizzle →
   Zod (drizzle-zod, not restated), Zod → tRPC `.input()`/output, tRPC → client
   (`RouterInputs`/`RouterOutputs`, not a redeclared `interface`), client → RHF
   (`z.infer` + `zodResolver`), props → component. At each hop, ask: is the downstream type
   *derived from* the upstream one, or *parallel to* it? Parallel is a silent break. See
   `references/chain-anatomy.md`.
4. **Interrogate every `as` and `satisfies` (high).** A cast is a claim the compiler stopped
   checking. For each, decide: is it narrowing a genuinely-`unknown` boundary value that was
   *just* Zod-parsed (acceptable), or is it asserting a shape to silence a real mismatch
   (a break)? `satisfies` that widens, or `as const` misused to fake a type, count as breaks.
5. **Audit the true boundaries for unknown input (high).** Webhook bodies, `localStorage`,
   `searchParams`, `env`, third-party `fetch` JSON — these enter as `unknown`/`any` and MUST
   be Zod-`.parse()`d before the result is used (Rule 8 overlaps here). An untyped
   `JSON.parse` feeding a typed variable is the classic laundering point.
6. **Confirm the client redeclares nothing (medium).** A hand-written `interface Product` or
   `type ProductDTO` in a component that mirrors a Drizzle/router type is a parallel chain
   that drifts on the next column change. The client imports `RouterOutputs["x"]["y"]` or the
   shared `z.infer` type — it does not restate the shape.
7. **Report each break with location, severity, and the reconnect (medium).** For every
   finding: file:line, which hop it severs, and the concrete fix (derive instead of restate,
   parse instead of cast, infer instead of annotate). Severity = how far a wrong shape would
   travel before surfacing. See `references/audit-checklist.md`.
8. **Hand off scope you can't fix in place (low).** If reconnecting a break means renaming a
   concept or restructuring across files, hand off to **refactor**; if it implies a column
   change, to **migration-author**. Record any non-obvious resolution in `DECISIONS.md`.

## Composes With

- **Runs against:** a vertical slice's files (schema, router, schemas, form, component).
- **Pairs with:** `rule-audit` (the nine-rule scan that defers the Rule 1 deep-dive here),
  `vertical-slice` (the builder whose output this verifies).
- **Hands off:** `refactor` when a reconnect is a sweeping change, `migration-author` when a
  break traces to a wrong column type.

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project conventions). The encoded failure class was confirmed.

**Observed run.** A naive reviewer shown a planted-flaw slice caught the loud, surface-level defects — the `u.naem` typo, the missing loading/undefined handling on `useQuery().data`, even that `as any` is "why the typo wasn't caught" — and returned a confident "Request changes." But it framed the verdict around the *typo and the missing loading state* as the headline failures, treating the casts as contributing factors rather than the root. It missed that the chain has **no Drizzle root at all** and that every cast is a deliberate laundering point that compiles clean:

```ts
const u = api.getUser.useQuery().data as any   // tRPC inference thrown away here
const data: any = await res.json()             // network boundary severed, unvalidated
return rows as User[]                           // unchecked cast over raw db.execute()
```

It flagged `data: any` and `rows as User[]` as generic "any/cast" smells, but did not name them as the specific hops where inference is severed, nor that `return rows as User[]` *asserts* a shape the DB never guaranteed (inference would have been `unknown`), nor that the chain's root is supposed to be `users.$inferSelect`, not a hand-asserted `User[]`.

**Failure class (confirmed).** A general reviewer triages by what looks scariest at runtime (a typo, an unhandled `undefined`) and treats the `any`/`as` escape hatches as secondary code smell. The real failure class is the inverse: the casts are the *cause* — each one silently severs one hop of the Drizzle → Zod → tRPC → component chain so a wrong shape compiles and ships. Because it all type-checks, the trap is invisible to a reviewer who isn't walking each hop back to inference and asking "is this derived from the upstream type, or asserted parallel to it?"

## Examples

**Input:** "Check the types on the orders slice." → **Output:** a finding list:
`OrderRow` in `order-list.tsx` is a hand-written `interface` paralleling
`RouterOutputs["order"]["list"]` (break at the tRPC → client hop; fix: import the router
type); `as any` on `row.total` to do `.toFixed` (break; `total` is integer cents, format via
the money helper, drop the cast); rest of the chain traces to `orders.$inferSelect` — intact.

**Input:** "Any leaks in the webhook handler?" → **Output:** `JSON.parse(payload)` feeds
`event.data.object.amount` with no schema (break at the boundary, Rules 1+8); fix: define
`stripeEventSchema` and `stripeEventSchema.parse(JSON.parse(payload))`, then the rest is typed.

**Input:** "Is the type chain intact after I renamed `price` to `unitPrice`?" → **Output:**
schema and router updated, but `product-form.tsx` casts the form values `as ProductInput`,
which absorbed the rename — the form still binds `price`. The cast is the break; remove it and
let `z.infer<typeof productCreateSchema>` surface the now-missing field as a compile error.

## Edge Cases

- When an `as` immediately follows a Zod `.parse()` of a genuinely-`unknown` value → that is
  narrowing a validated boundary, not a break; note it as reviewed, don't flag it.
- When a third-party library's types are wrong and a cast is unavoidable → isolate it in one
  adapter function with a Zod parse at its edge, record the reason in `DECISIONS.md`, and treat
  that function as the only sanctioned cast site.
- When `RouterOutputs` is too deep/awkward to reference → that signals the procedure should
  return a named type or the slice needs **refactor**, not a redeclared interface.
- When the break is one of several rules at once (e.g. unparsed money as float) → fix it here
  for Rule 1 but flag the overlap so **rule-audit** records Rules 5/8 too; don't silently
  half-fix.

## References

- `references/chain-anatomy.md` — the canonical intact Drizzle → Zod → tRPC → RHF → component
  chain shown end to end with code, plus the parallel-chain anti-pattern at each hop.
- `references/audit-checklist.md` — the grep patterns for every escape hatch, the per-hop
  questions, and the severity/reconnect rubric for the report.

## Scripts

Reserved; empty for now. A `grep`-driven scanner that lists `any`/`as`/`@ts-ignore`/untyped
`JSON.parse` sites with file:line across a slice would justify one once the slice directory
layout is fixed across projects — but the judgment of *which* cast is a real break stays human.
