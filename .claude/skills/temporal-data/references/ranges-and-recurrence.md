Purpose: model time spans and repeating events correctly — half-open ranges, the overlap predicate, tstzrange + GiST exclusion constraints for no-double-booking, durations, and recurrence as an RRULE expanded at read.

# Date ranges: store two instants, reason half-open

A range is two `timestamptz` columns. Always reason with **half-open** `[start, end)`
semantics: the start is included, the end is excluded. Half-open ranges tile without gaps
or overlaps (one period's `end` is the next period's `start`) and avoid the classic
off-by-one of inclusive `<=` comparisons.

```ts
startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
endsAt:   timestamp("ends_at",   { withTimezone: true, mode: "date" }).notNull(),
```

Add a CHECK so a range is never inverted:

```ts
import { check } from "drizzle-orm/pg-core";
// inside the pgTable third-arg callback:
(t) => ({ validRange: check("valid_range", sql`${t.startsAt} < ${t.endsAt}`) })
```

# Overlap detection — the predicate, and why the DB must enforce it

Two half-open ranges A and B overlap **iff** `startA < endB AND startB < endA`. In Drizzle,
to find bookings overlapping a requested `[reqStart, reqEnd)`:

```ts
import { and, eq, lt } from "drizzle-orm";
const clashes = await db
  .select()
  .from(bookings)
  .where(and(
    eq(bookings.roomId, roomId),
    lt(bookings.startsAt, reqEnd),   // startA < endB
    lt(reqStart, bookings.endsAt),   // startB < endA   (reqStart as the literal)
  ));
```

**Do not** rely on this select-then-insert in application code as the *guarantee*: two
concurrent requests both read "no clash" and both insert — a race that double-books. The
database must enforce non-overlap with an **exclusion constraint** (authored via
`migration-author`, since it needs raw SQL and the `btree_gist` extension):

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&   -- '[)' = half-open; && = overlaps
  );
```

Now a conflicting insert fails atomically at commit; the application catches the constraint
error and surfaces it as the "slot taken" error state (Rule 4). Optionally store a generated
`during tstzrange` column instead of recomputing it in the constraint.

# Durations

Prefer **integer seconds** for app-computed durations (timeouts, TTLs, session length):
arithmetic-friendly, no parsing, trivially comparable.

```ts
durationSeconds: integer("duration_seconds").notNull(),
```

Use Postgres `interval` only when you want the database to do calendar-aware math
(`starts_at + duration`), since intervals respect months/DST in `+`/`-`:

```ts
import { interval } from "drizzle-orm/pg-core";
length: interval("length"),   // returns a string like "01:30:00" — parse before use (Rule 8)
```

Never store a duration as a float of hours (that is a Rule-5-adjacent precision trap and
makes comparisons lossy).

# Recurrence: store the rule, not the rows

Never materialize a repeating event into one row per occurrence — the series is unbounded,
edits become fan-out updates, and "every weekday forever" has no row count. Store the
iCalendar **RRULE** (RFC 5545) plus its anchor and zone, and **expand at read** over the
window you are querying.

```ts
export const recurringEvents = pgTable("recurring_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  // The first occurrence, as a UTC instant.
  dtstart: timestamp("dtstart", { withTimezone: true, mode: "date" }).notNull(),
  // The wall-clock zone the rule is interpreted in (keeps "9am local" stable across DST).
  timezone: text("timezone").notNull(),                 // IANA, e.g. "America/New_York"
  // The RRULE string, e.g. "FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20271231T000000Z"
  rrule: text("rrule").notNull(),
  // Per-occurrence exceptions (cancellations / moves) as ISO instants.
  exdates: jsonb("exdates").$type<string[]>().default(sql`'[]'::jsonb`),
});
```

Expand in a plain function (the procedure stays thin and calls it), e.g. with the `rrule`
library, scoped to the requested window so you never enumerate infinity:

```ts
import { rrulestr } from "rrule";
function occurrencesBetween(row: RecurringEvent, from: Date, to: Date): Date[] {
  // Format the UTC instant as an iCalendar UTC timestamp: 2027-01-04T09:00:00.000Z -> 20270104T090000Z
  const dtStart = row.dtstart.toISOString().replace(/[-:]/g, "").slice(0, -5) + "Z";
  // rrulestr() parses a full DTSTART + RRULE block; RRule.fromString() does not handle DTSTART.
  const rule = rrulestr(`DTSTART:${dtStart}\nRRULE:${row.rrule}`);
  const excl = new Set(row.exdates);
  return rule.between(from, to, true).filter((d) => !excl.has(d.toISOString()));
}
```

Why `dtstart` (UTC) **and** `timezone`: a rule like "every Monday at 9am" must stay 9am
*local* across a DST transition. Expanding in the stored IANA zone preserves the wall-clock
time; expanding against a pre-resolved UTC offset drifts by an hour after the switch. Record
the "store rule, expand at read" decision in `DECISIONS.md`.

# Self-check

- [ ] Ranges are two `timestamptz` columns, reasoned half-open `[start, end)`.
- [ ] A CHECK enforces `start < end`; no-overlap is a GiST exclusion constraint, not app code.
- [ ] The overlap predicate is `startA < endB AND startB < endA` (strict `<`, not `<=`).
- [ ] Durations are integer seconds (or `interval` for calendar math), never float hours.
- [ ] Recurrence is one RRULE row + `dtstart` + IANA `timezone`, expanded at read in-window.
