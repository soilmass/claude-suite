---
name: temporal-data
description: >
  Model time correctly on the edge stack: store every instant as Postgres `timestamptz`
  in UTC (Rule 6), keep all computation and comparison in UTC, and convert to a user's
  zone only at the display edge. Covers the Drizzle column definition (`timestamp(...,
  { withTimezone: true, mode: 'date' })`), date/instant vs. wall-clock-date distinction,
  half-open date ranges and overlap (`tstzrange` + exclusion constraints), durations as
  intervals or integer seconds, and recurrence stored as an RRULE string expanded at read.
  Use when: "store dates", "timezone", "timestamp", "date range", "recurring".
  Do NOT use for: modeling money/currency amounts (use money-modeling), or defining the
  tables, relations, and conventions themselves (use schema-design).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the local-time / naive-timestamp failure class:
    `timestamp` without timezone, server-side zone conversion, string dates, and ad-hoc
    range/recurrence handling. Baseline observed (clean-room capture).
---

# temporal-data

The decision skill for *how time is stored, compared, and displayed* on the edge stack. It
enforces Rule 6 in `../../CLAUDE.md` — instants are `timestamptz` in UTC, all computation
stays in UTC, conversion to a human zone happens once at the render edge — and covers the
patterns Rule 6 implies but does not spell out: wall-clock dates vs. instants, half-open
ranges and overlap, durations, and recurrence. It consumes the schema conventions in
`../../CLAUDE.md` and keeps Rule 8 in view: incoming dates are Zod-coerced before use.

---

## Non-Negotiable Rules

A naive timestamp compiles, renders, and passes in the author's zone — then silently
shifts data for every other user. These are hard lines:

- **Never store an instant as `timestamp` without timezone, or as a formatted string.**
  Use `timestamp(col, { withTimezone: true })` (Postgres `timestamptz`). A bare
  `timestamp` and an ISO string both drop the offset and corrupt comparison.
- **Never convert to a user's local zone anywhere but the display edge.** Storage, tRPC
  procedures, logic, and comparisons stay in UTC; conversion happens only in the client
  component (or a formatting helper it calls), never in the database or the API.
- **Never trust the server's local zone.** Edge runtimes have no stable `TZ`; stay on UTC
  (`new Date()` is UTC-anchored; `sql\`now()\`` returns `timestamptz`). Never call
  `.toLocaleString()` / `.getHours()` without an explicit `timeZone` option.
- **Never store a zoneless calendar date (birthday, holiday) as `timestamptz`.** That
  re-introduces a zone where none exists; use Postgres `date` as a wall-clock value.

Refuse these rationalizations: "the server is UTC anyway"; "I'll just store the ISO
string"; "`timestamp` is fine, we only have one timezone"; "I'll convert in the query so
the API returns local time."

---

## When to Use

- A schema column holds an instant (an event start, a `published_at`, a deadline).
- You must store or query a **date range** (a booking, a subscription period, an
  availability window) and detect overlaps.
- A feature has **recurring** events (a weekly meeting, a monthly invoice) to store and
  expand.
- You are formatting a stored instant for display in a user's timezone, or modeling a
  **duration** (a timeout, a session length, a TTL).

## When NOT to Use

- The value is a money amount or currency → `money-modeling` (it owns Rule 5; this owns
  Rule 6 — the sibling rule for time).
- The tables, columns, relations, and cardinality don't exist yet → `schema-design`
  (this skill decides the *temporal* column types on top of its output).
- You are evolving an existing column's type on a live table (e.g. `timestamp` →
  `timestamptz`) → `migration-author` (a type change needs expand-contract).
- You are indexing a time column you sort/range-filter on → `index-strategy`.

---

## Procedure

1. **Classify each field: instant, wall-clock date, or duration (high interrogation).**
   The costliest decision — an instant mis-modeled as a date (or vice versa) corrupts data
   irreversibly. Instant → `timestamptz`; zoneless calendar date (birthday, holiday) →
   `date`; length of time → `interval` or integer seconds. See
   `references/temporal-storage.md`.

2. **Define the column with the timezone-aware Drizzle type.** Instants use
   `timestamp(col, { withTimezone: true, mode: 'date' })` so Drizzle hydrates a JS `Date`;
   default `created_at`/`updated_at` to `sql\`now()\``. The schema-convention floor in
   `../../CLAUDE.md`. See `references/temporal-storage.md`.

3. **Keep every computation and comparison in UTC.** Procedures compare `Date`s and emit
   `timestamptz`; range math uses `gte`/`lt` against UTC instants. No zone enters the tRPC
   layer; the procedure stays thin (it calls a function) per the spine. See
   `references/temporal-storage.md`.

4. **Zod-coerce dates at the boundary (Rule 8).** A date arriving as JSON is external
   input: parse with `z.coerce.date()` in the *shared* schema so the tRPC input and the RHF
   form agree. Never `new Date(req.body.x)` unvalidated. See `references/temporal-storage.md`.

5. **Model ranges as half-open `[start, end)` and detect overlap correctly.** Store
   `starts_at`/`ends_at` as `timestamptz`; for "no double-booking" use a `tstzrange` GiST
   **exclusion constraint** rather than app-level checks that race. Overlap test:
   `start_a < end_b AND start_b < end_a`. See `references/ranges-and-recurrence.md`.

6. **Store recurrence as an RRULE string, expand at read.** Persist the iCalendar RRULE
   (RFC 5545) plus the UTC `dtstart` and an explicit IANA `timezone`; expand occurrences in
   a plain function (e.g. `rrule`) over the queried window — never materialize an infinite
   series into rows. Record "store rule, not rows" in `DECISIONS.md`. See
   `references/ranges-and-recurrence.md`.

7. **Convert to the user's zone only at the display edge.** Format in the Client Component
   with `Intl.DateTimeFormat` given an explicit IANA `timeZone` from the user's profile or
   browser, never the server environment. Render all four states (Rule 4). See
   `references/temporal-storage.md`.

---

## Composes With

- **Consumes:** `schema-design` — the tables and relations whose temporal columns this
  skill types are defined there; this decides `timestamptz` vs. `date` vs. `interval` on
  top of that output.
- **Pairs with:** `vertical-slice` — when a feature slice has a date input, this skill
  supplies the shared Zod date coercion, the UTC-in/convert-at-edge discipline, and the
  display formatting the slice's form and component need.
- **Hands off:** changing a column's temporal type on populated data → `migration-author`
  (expand-contract); indexing a range/sort column → `index-strategy`; a money amount
  alongside a date → `money-modeling`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent told to implement
> as a typical dev would, with no project conventions). The encoded failure class was confirmed.

**Observed run.** Prompt: "add an `events` table with title, start time, end time, and a query
for upcoming events." With no skill the agent produced:

```ts
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  startTime: timestamp("start_time").notNull(),  // no withTimezone
  endTime: timestamp("end_time").notNull(),      // no withTimezone
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
// upcoming: where(gt(events.startTime, new Date()))
```

Its own note: *"used Drizzle's `timestamp(...)` columns (plain `timestamp without time zone`),
comparing against a JS `Date`."* That is the Rule 6 failure verbatim — zoneless `timestamp`
drops the offset, and comparing a `timestamp without time zone` column against a JS `Date`
silently mixes the server's (unstable, edge-runtime) zone into the boundary. Renders correctly
in the author's zone; the "upcoming" filter shifts by hours for any user elsewhere.

**Failure class (confirmed).** `timestamp(...)` without `{ withTimezone: true }`; raw
`new Date(input)` from a tRPC input with no Zod coercion (Rule 8); pre-formatting to a string
in the procedure (breaks Rule 1); range overlap checked in app code; recurrence expanded into
N rows instead of an RRULE.

---

## Examples

**Input:** "Events have a start time the user sets, shown in their timezone."
**Output:** Column `startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date'
}).notNull()`. Shared Zod derived from the Drizzle table — `createInsertSchema(events, {
startsAt: z.coerce.date() }).pick({ startsAt: true })` (Rule 1: rooted in inference; Rule 8:
coerced at the wire) — used by both the tRPC input and the RHF resolver. Procedure stores the `Date` as-is (UTC). The Client Component
formats with `new Intl.DateTimeFormat(locale, { timeZone: user.tz, dateStyle: 'medium',
timeStyle: 'short' }).format(startsAt)` — conversion only here.

**Input:** "Rooms can be booked for a time range; no two bookings overlap."
**Output:** `startsAt`/`endsAt` as `timestamptz`, plus a generated `tstzrange` and a GiST
`EXCLUDE USING gist (room_id WITH =, during WITH &&)` exclusion constraint authored via
`migration-author`. The database, not application code, guarantees no overlap; reads use
half-open `[startsAt, endsAt)` semantics.

---

## Edge Cases

- **Scheduling in *their* wall-clock time across a DST boundary** (a 9am recurring meeting
  that stays 9am local) → store the RRULE with an explicit IANA `timezone` and `dtstart`
  and expand in that zone; pre-resolving to UTC instants drifts by an hour after the switch.
- **You only ever have one timezone today** → still use `timestamptz`. The cost of "we
  only have one zone" is the same corruption later; the storage is identical, the
  discipline is free now and expensive to retrofit (`migration-author`).
- **A "deadline at end of day" in the user's zone** → store the resolved UTC instant of
  that local midnight (needs the user's IANA zone at write time), not a bare `date`, or the
  cutoff fires at the wrong moment for everyone else.

## References

- `references/temporal-storage.md` — the core discipline: instant vs. `date` vs. duration,
  Drizzle `timestamp({ withTimezone, mode })` definitions, `now()` defaults, Zod boundary
  coercion, UTC-only computation, and display-edge formatting with explicit `timeZone`.
- `references/ranges-and-recurrence.md` — half-open ranges, the overlap predicate,
  `tstzrange` + GiST exclusion constraints for no-double-booking, durations as
  `interval`/integer seconds, and recurrence stored as an RRULE expanded at read.

## Scripts

`scripts/` is reserved. A signal that would justify one: a static check that greps
`src/db/schema/` for `timestamp(` calls lacking `withTimezone: true` and flags them —
mechanically enforceable, unlike the instant-vs-date classification that is the core of
this skill.
