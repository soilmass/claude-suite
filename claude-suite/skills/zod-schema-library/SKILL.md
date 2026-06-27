---
name: zod-schema-library
description: >
  Author one Zod schema per entity-operation and share it verbatim between the tRPC
  procedure input and the React Hook Form resolver, so validation can never drift into
  two copies. Covers refinements (.refine/.superRefine), transforms and coercion at the
  boundary, branded types for IDs and money, and deriving schemas from Drizzle columns with
  drizzle-zod so the type chain stays rooted in inference. The schema is the single contract
  both ends of a slice obey.
  Use when: "zod schema", "shared validation schema", "refine a schema", "branded type",
  "drizzle-zod".
  Do NOT use for: building the full feature slice end to end (use vertical-slice), or wiring
  the form fields, resolver, and submit handler (use rhf-advanced).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the drifting-validation failure class: two divergent
    schemas for one operation, float money in the schema, unvalidated coercion at the edge.
    Baseline section is the encoded failure class; replace with an observed transcript.
---

# zod-schema-library

Produce the **one** Zod schema an operation owns and export it for both ends to import — the
tRPC `.input()` and the RHF `zodResolver`. See `../../CLAUDE.md` for the spine (one schema per
entity-operation, shared) and the nine rules this enforces, especially Rule 8 (validated
boundaries), Rule 1 (type chain rooted in Drizzle inference), and Rule 5 (money never float).

## Non-Negotiable Rules

- **Never** define a second Zod schema for an operation that already has one. Both the
  procedure and the form import the same exported symbol from `src/schemas/`.
- **Never** type money as `z.number()` for dollars — model minor units as `z.number().int()`
  or a branded cents type (Rule 5).
- **Never** let an external value cross a boundary unparsed — coerce and `.parse()` env vars,
  route params, search params, and webhook bodies, not just tRPC inputs (Rule 8).
- **Never** annotate the inferred output by hand; let `z.infer` flow the type (Rule 1). No
  `any` to silence a refinement.

Refuse these rationalizations: "the form only needs a subset so I'll make a lighter schema,"
"it's just a number, cents is overkill," "the route param is already a string, no need to
parse," "I'll cast the transform result to keep TypeScript quiet."

## When to Use

- You are creating or revising the validation contract for one entity-operation (create,
  update, filter, a webhook payload).
- A field needs a cross-field rule (`.refine`/`.superRefine`), a coercion (`z.coerce`), or a
  transform that reshapes input to what the server stores.
- You want branded IDs/money so a raw `string` or `number` can't be passed where a typed one
  is required.
- You want the schema derived from Drizzle columns via drizzle-zod instead of restated.

## When NOT to Use

- Building the whole slice (model → procedure → form → component): use **vertical-slice**;
  this skill produces only the schema it consumes.
- Wiring fields, the resolver, default values, and submit/error handling: use **rhf-advanced**.
- Designing the table columns the schema derives from: use **schema-design**.
- Authoring a migration when a column changes: use **migration-author**.

## Procedure

1. **Locate or create the operation's schema module (low).** One file per entity under
   `src/schemas/<entity>.ts`, one exported schema per operation. If one exists, edit it — do
   not fork. Drift is the failure this skill exists to prevent. See `references/patterns.md`.
2. **Root the shape in Drizzle inference (medium).** Prefer `createInsertSchema`/
   `createSelectSchema` from drizzle-zod over restating columns, then `.pick`/`.omit`/
   `.extend` to the operation's surface. Keeps Rule 1 intact. See `references/drizzle-zod.md`.
3. **Type money and time correctly (high — costly to fix later).** Money is integer minor
   units (`z.number().int().nonnegative()`) or a branded cents type, never float (Rule 5).
   Timestamps cross the wire as ISO strings, coerced to `Date`, stored UTC `timestamptz`
   (Rule 6). See `references/patterns.md`.
4. **Add refinements last, after the base shape (medium).** Use `.refine` for one field,
   `.superRefine` with `ctx.addIssue` for cross-field rules and multiple errors; attach
   `path` so RHF maps the message to the field. See `references/patterns.md`.
5. **Coerce and transform at the boundary only (medium).** `z.coerce.number()` for query
   params, `.transform()` to normalize (trim, lowercase email) — but never `.transform()` a
   shared schema into a shape the form can't render; split into input vs. parsed if the
   output diverges. See `references/patterns.md`.
6. **Brand IDs and money where mix-ups are plausible (medium).** `.brand<"UserId">()` so an
   `OrgId` can't be passed as a `UserId`. Record any branding convention you introduce in
   `DECISIONS.md`. See `references/patterns.md`.
7. **Export the schema and its inferred type; share both ends (low).** Export the schema and
   `export type X = z.infer<typeof xSchema>`. The procedure imports it for `.input()`; the
   form imports it for `zodResolver`. One symbol, two consumers.

## Composes With

- **Consumes:** `schema-design` (the Drizzle columns the schema is rooted in).
- **Feeds:** `vertical-slice` (the procedure `.input()` and the component contract),
  `rhf-advanced` (the `zodResolver` and field error mapping).
- **Pairs with:** `rule-audit` (verifies Rules 1, 5, 6, 8 on the result).
- **Hands off:** `migration-author` when a refinement reveals a needed column change.

## Baseline failure (REPLACE WITH OBSERVED TRANSCRIPT)

> This is the encoded failure *class*, not a captured transcript. Replace it with a real
> transcript once one is observed.

**Failure class encoded:** Without this skill, a generated "shared" schema tends to ship with:

- two schemas for one operation — a full one on the tRPC input and a hand-trimmed lighter
  one in the form — that silently drift the moment a field is added (violates the
  one-schema-shared spine).
- money typed as `z.number()` representing dollars, so `19.99` rounds and reconciles wrong
  (Rule 5).
- a route param or `searchParams` value read as a raw string with no `z.coerce`/`.parse`,
  passed straight into a query (Rule 8).
- a `.transform()` baked into the shared schema that makes the inferred output unrenderable
  by the form, then "fixed" with an `as` cast (Rule 1).
- a cross-field `.refine` with no `path`, so RHF shows a form-level error the user can't
  attribute to a field.

## Examples

**Input:** "Schema for creating a product with a price and an optional sale price that must
be below price." → **Output:** `productCreateSchema` derived via `createInsertSchema(products)`
then `.omit({ id, createdAt, updatedAt })`; `price`/`salePrice` as `z.number().int()` minor
units; a `.superRefine` asserting `salePrice < price` with `path: ["salePrice"]`; exports
`productCreateSchema` and `type ProductCreateInput = z.infer<...>`.

**Input:** "Validate the `?page=` and `?status=` search params on the list page." → **Output:**
a `productListQuerySchema` using `z.coerce.number().int().positive().default(1)` for `page`
and `z.enum([...])` for `status`, `.parse()`d in the server component before the tRPC call
(Rule 8) — not a duplicate of the create schema.

**Input:** "Make sure a `userId` can't be passed where an `orgId` is expected." → **Output:**
`z.string().uuid().brand<"UserId">()` and `...brand<"OrgId">()` exported as reusable column
schemas; downstream signatures take the branded type so a raw string won't type-check (Rule 1).

## Edge Cases

- When the form needs only a subset of fields → `.pick()`/`.omit()` from the one schema;
  never author a parallel lighter schema.
- When input and stored shape genuinely diverge (a `.transform` reshapes it) → export two
  symbols (`xInput` for the form/wire, `xParsed` for the server) from the same module, not
  two unrelated schemas in two files.
- When a refinement needs a DB lookup (uniqueness) → keep the Zod schema synchronous; do the
  async check in the procedure's plain function and surface it as a tRPC error, not in
  `.refine` (edge async refinements add latency per request).
- When drizzle-zod's inferred type fights a custom column type → narrow with `.extend` on the
  generated schema rather than dropping to a hand-written `z.object` that breaks Rule 1.

## References

- `references/patterns.md` — refinements, transforms/coercion, branded types, money/time,
  input-vs-parsed split, and the share-both-ends export pattern, with code.
- `references/drizzle-zod.md` — deriving schemas from Drizzle columns with
  `createInsertSchema`/`createSelectSchema`, `.pick`/`.omit`/`.extend`, keeping the chain rooted.

## Scripts

Reserved; empty for now. A generator that stubs `src/schemas/<entity>.ts` from a Drizzle
table would justify one once the schema directory layout is fixed across projects.
