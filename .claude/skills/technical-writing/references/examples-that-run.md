Purpose: how to write copy-pasteable, stack-correct examples for docs — real App Router / Drizzle / tRPC / Zod / RHF idioms, the rules an example must never teach by counter-example, and secret discipline.

# The rule: examples are real artifacts, not illustrations

Every fenced code block in a doc is a promise that it runs. A sample that "shows the idea" but
would not compile teaches the reader wrong and erodes trust in every other example. Before
shipping a sample: paste it into the project, let TypeScript check it, run it.

An example is also a teaching surface for the nine rules in ../../CLAUDE.md. A doc that ships a
`protectedProcedure` with no ownership check is teaching a Rule 2 violation to every reader who
copies it. Examples must model the rules, not break them.

# Examples must not teach these by counter-example

- **Rule 1 (type chain):** no `any`, no `@ts-ignore`, no untyped `fetch`/`JSON.parse` in a
  sample. Let types trace from Drizzle inference. If a sample needs a type, derive it
  (`type Invoice = typeof invoices.$inferSelect`), do not annotate `any`.
- **Rule 2 (ownership):** any `protectedProcedure` sample over a user-owned row shows the
  ownership check against `ctx.auth.userId`. Never a bare `protectedProcedure` over someone's data.
- **Rule 3 (tokens):** JSX/className samples use `@theme` tokens, never raw hex or arbitrary px.
- **Rule 4 (four states):** a component sample either renders loading/empty/error/success or
  explicitly says "states omitted for brevity — see vertical-slice".
- **Rule 5 (money):** money in samples is integer minor units or a decimal, never a float dollar.
- **Rule 8 (validated boundaries):** input samples are Zod-parsed; the same schema is shared
  between the tRPC input and the form, not duplicated.
- **Rule 9 (secrets):** never a real key; never a secret read in a Client Component or via
  `NEXT_PUBLIC_*`.

# Canonical sample shapes

A thin procedure with ownership (how-to and reference examples lean on this):

```ts
// src/server/api/routers/invoice.ts
export const invoiceRouter = createTRPCRouter({
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() })) // Rule 8: validated boundary
    .query(async ({ ctx, input }) => {
      const invoice = await ctx.db.query.invoices.findFirst({
        where: (t, { and, eq }) =>
          and(eq(t.id, input.id), eq(t.userId, ctx.auth.userId)), // Rule 2: ownership
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      return invoice; // type traces from Drizzle inference — Rule 1
    }),
});
```

The shared Zod schema, used by both procedure and form (Rule 8, single source):

```ts
// src/lib/schemas/invoice.ts
export const createInvoice = z.object({
  amountCents: z.number().int().positive(), // Rule 5: minor units, never a float
  dueAt: z.coerce.date(),                    // Rule 6: stored timestamptz UTC
});
export type CreateInvoice = z.infer<typeof createInvoice>;
```

```tsx
// the form consumes the SAME schema — never a second copy
const form = useForm<CreateInvoice>({ resolver: zodResolver(createInvoice) });
```

# Secret and placeholder discipline

- Use obviously fake placeholders: `pk_test_xxx`, `<YOUR_DATABASE_URL>`, `clerk_dev_...`.
- Show where the real value lives server-side ("set `DATABASE_URL` in `.env`, never
  `NEXT_PUBLIC_DATABASE_URL`") rather than pasting one.
- Env access in a sample goes through the validated env module, not raw `process.env` strewn
  through the doc (Rule 8 for env vars).

# Keeping examples from drifting

- Prefer linking to `api-docs-from-trpc` output for exact signatures; hand-copied signatures rot.
- Mark any version-specific claim (a Drizzle/Clerk/Next/Tailwind API that may change) so
  `perishable-refresh` re-checks it.
- Re-run every example from a clean checkout before publishing; a stale sample is worse than none.
