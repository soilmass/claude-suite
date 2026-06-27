Purpose: the core temporal discipline — classify a field, define the Drizzle column, coerce at the boundary, compute in UTC, format only at the display edge. Enforces Rule 6.

# Classify first

Three temporal kinds. Mis-classifying is the costliest error (Rule 6, and it's hard to
reverse once data exists):

| Kind | Meaning | Postgres type | Drizzle |
|------|---------|---------------|---------|
| **Instant** | A point on the global timeline — it happened/will happen at one absolute moment | `timestamptz` | `timestamp(col, { withTimezone: true, mode: 'date' })` |
| **Wall-clock date** | A calendar date with no instant and no zone — birthday, holiday, invoice date | `date` | `date(col)` |
| **Duration** | A length of time, not a point | `interval`, or `integer` seconds | `interval(col)` / `integer(col)` |

Rule of thumb: if "what time is it there?" is a meaningful question about the value, it is
an **instant** → `timestamptz`. If the value is "the same date everywhere on Earth" (you
turn 30 on the same calendar day in Tokyo and New York), it is a **wall-clock date** →
`date`. Record any non-obvious choice in `DECISIONS.md`.

# Drizzle column definitions

```ts
import { sql } from "drizzle-orm";
import { pgTable, timestamp, date, integer, uuid } from "drizzle-orm/pg-core";

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),

  // INSTANT — always timezone-aware. mode: 'date' hydrates a JS Date (root of the type chain).
  startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),

  // DURATION as integer seconds — explicit, arithmetic-friendly, no parsing.
  durationSeconds: integer("duration_seconds").notNull(),

  // WALL-CLOCK DATE — no zone. A holiday/birthday/invoice date.
  invoiceDate: date("invoice_date"),

  // The schema-convention floor from CLAUDE.md: every table gets these, timestamptz, default now().
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .default(sql`now()`)
    .$onUpdateFn(() => new Date()),
});
```

Notes:
- `withTimezone: true` is what produces `timestamptz`. Omitting it produces a bare
  `timestamp` that drops the offset — the #1 Rule 6 defect.
- `mode: 'date'` → Drizzle gives/takes a JS `Date`. `mode: 'string'` returns the raw ISO
  string; only use it if you have a specific reason and you still parse with Zod before use.
- `defaultRandom()` is fine for UUIDv4; for the UUIDv7 the spine prefers on public-facing
  IDs, generate it in app code or via a DB function — see `schema-design`.
- A JS `Date` is *already* a UTC-anchored instant (epoch ms). Storing/reading it through a
  `timestamptz` column is lossless and zone-correct. The danger is only in *formatting* it.

# Boundary coercion (Rule 8) — one shared schema

A date arriving over the wire is a string. Coerce it once, in the schema shared between the
tRPC input and the RHF form (the spine forbids two drifting copies). Derive the schema from
the Drizzle table with `createInsertSchema` so it stays rooted in inference (Rule 1), then
layer the wire-boundary coercion on top (Rule 8):

```ts
// src/features/events/schema.ts — the ONE schema for this entity-operation.
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { events } from "@/db/schema/events";

export const createEventInput = createInsertSchema(events, {
  // z.coerce.date() accepts an ISO string OR a Date and yields a Date. Reject the invalid.
  startsAt: z.coerce.date(),
  durationSeconds: (schema) => schema.positive(),
}).pick({ startsAt: true, durationSeconds: true });
export type CreateEventInput = z.infer<typeof createEventInput>;
```

```ts
// tRPC procedure — thin: validate, authorize, call a function, return.
export const eventsRouter = createTRPCRouter({
  create: protectedProcedure
    .input(createEventInput) // Rule 8: parsed before use
    .mutation(({ ctx, input }) => createEvent(ctx.auth.userId, input)),
});
```

```ts
// RHF — same schema via the resolver, so client and server never drift.
const form = useForm<CreateEventInput>({ resolver: zodResolver(createEventInput) });
```

Never `new Date(input.something)` on an unvalidated value, and never `JSON.parse` a date
without a Zod gate (that also breaks Rule 1).

# Compute in UTC, never in the server's local zone

Edge runtimes have no stable `TZ`. Keep all logic on UTC instants:

```ts
// GOOD — UTC-anchored, zone-free arithmetic.
const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
await db.select().from(events).where(gte(events.startsAt, cutoff));

// GOOD — let Postgres do interval math in the query.
await db.select().from(events).where(gte(events.startsAt, sql`now() - interval '7 days'`));

// BAD — depends on the process timezone; undefined at the edge.
new Date().getHours();
someDate.toLocaleString();        // no timeZone => server/runtime zone
```

Procedures, business functions, and comparisons see only `Date`/`timestamptz`. No IANA zone
enters the API layer.

# Convert ONLY at the display edge

Conversion happens in the Client Component (or a formatting helper it calls), with an
**explicit** IANA `timeZone` sourced from the user's profile or the browser
(`Intl.DateTimeFormat().resolvedOptions().timeZone`) — never from the server environment.

```tsx
"use client";
function EventTime({ startsAt, tz }: { startsAt: Date; tz: string }) {
  const fmt = new Intl.DateTimeFormat(undefined, {
    timeZone: tz,                 // explicit — the whole point of Rule 6
    dateStyle: "medium",
    timeStyle: "short",
  });
  return <time dateTime={startsAt.toISOString()}>{fmt.format(startsAt)}</time>;
}
```

- Always emit the machine-readable `dateTime={startsAt.toISOString()}` (UTC) on `<time>`
  for accessibility and copy/paste correctness.
- For a wall-clock `date` value, format with `timeZone: 'UTC'` so it never shifts a calendar
  day across zones.
- This is a data-bound display: render Rule 4's four states (loading skeleton, empty/"no
  date", a failed-parse error, and the success format).

# Quick self-check

- [ ] Every instant column is `timestamp(..., { withTimezone: true })` (`timestamptz`).
- [ ] No `.toLocaleString()` / `.getHours()` without an explicit `timeZone`.
- [ ] Dates Zod-coerced at every boundary; one shared schema for input + form.
- [ ] Conversion to a human zone happens only in client display code.
- [ ] Birthdays/holidays/invoice dates are `date`, not `timestamptz`.
