Purpose: the "we already have this" catalog — Web-standard APIs and installed-primitive features that make a dependency (or a hand-rolled helper) unnecessary on this edge stack, and the common reinventions each replaces.

The edge runtime ships Web-standard APIs, and the spine already pins Drizzle / Zod / Clerk /
shadcn. Most "is there a library for X?" questions are answered here, before tier 4 (community).

---

# Web-standard APIs (zero dependency, edge-native)

| Need                                  | Use this primitive                          | Common reinvention it kills                     |
| ------------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| Format money for display (Rule 5/6)   | `Intl.NumberFormat(locale, {style:'currency'})` over **minor units / 100** | a hand-rolled `formatCurrency`, or `accounting.js`/`numeral.js` |
| Format dates/times at display (Rule 6)| `Intl.DateTimeFormat` / `toLocaleString`    | `moment`, much of `date-fns` for display-only   |
| Relative time ("3 days ago")          | `Intl.RelativeTimeFormat`                   | `moment`, `timeago.js`                          |
| Random UUID                           | `crypto.randomUUID()` (v4); a pure-JS v7 gen for sortable IDs (see `uuidv7-ids`) | a `uuid` dep for v4 |
| Hashing / HMAC / key derivation       | `crypto.subtle` (SHA-256, HMAC, PBKDF2)     | `bcrypt`/`crypto` Node addons (DOA at the edge) |
| Parse / build URLs + query strings    | `URL`, `URLSearchParams`                     | `query-string`, `qs`                            |
| Deep clone                            | `structuredClone()`                          | `lodash.clonedeep`                              |
| Base64 / text encoding               | `atob`/`btoa`, `TextEncoder`/`TextDecoder`  | `js-base64`                                     |
| Debounce/throttle (where truly needed)| `AbortController` + `setTimeout`, or a tiny local util | a `lodash.debounce` dep                  |
| Number/locale collation, sorting      | `Intl.Collator`                              | custom locale-aware sort                        |

Note: anything reaching for `node:fs`, `node:crypto` (the Node module, not Web-Crypto), a
native `.node` addon, or a long-lived TCP socket is disqualified at the edge — that is a
tier-4 candidate `tech-evaluation` will reject, not prior art to adopt.

---

# Drizzle (the data layer is already here)

- **Relational reads without N+1 (Rule 7):** `db.query.<table>.findMany({ with: { … } })` —
  do not add an ORM helper or hand-join in a `.map()`. See `drizzle-relational-queries`.
- **Aggregates / window functions / raw SQL:** the `sql` template tag — no query-builder dep.
- **Inferred types are the type-chain root (Rule 1):** `table.$inferSelect` / `$inferInsert`.
  Before defining a TypeScript type for a row, check it isn't already inferable from the table.
- **Transactions, prepared statements, `onConflict` upserts** are built in — no extra dep.

# Zod (validation is already here — Rule 8)

- One shared schema per entity-operation, used by both the tRPC input and the RHF form.
  Before authoring a validator, grep for an existing `…Input`/`…Schema` (see `search-tiers.md`).
- Coercion (`z.coerce.*`), refinements (`.refine`), transforms (`.transform`), discriminated
  unions, branded types — no validation library beyond Zod is warranted.
- `drizzle-zod` can derive a Zod schema from a Drizzle table — check before hand-writing one.

# Clerk (auth is already here — the spine owns it)

- Anything auth-shaped is Clerk's: `auth()` / `currentUser()` server-side, `useUser` /
  `useAuth` / `<SignedIn>` / `<Protect>` client-side, `clerkMiddleware` for route protection.
- Do NOT hand-roll sessions, JWT parsing, password hashing, or role gates. Ownership checks
  (Rule 2) read `ctx.auth.userId` from the Clerk-populated context — not a custom auth layer.

# shadcn/ui + Radix (interaction is already here — the spine mandates composing it)

- Dialog, dropdown/menu, combobox (`Command`), popover, tooltip, tabs, accordion, toast,
  focus trap, roving tabindex — all ship as accessible primitives. Hand-building any of these
  is a spine violation; it loses keyboard nav, focus management, and ARIA for free.
- Check `src/components/ui/` for what's already vendored before adding the primitive again.
- Style the primitive with project tokens (Rule 3) via `shadcn-compose` /
  `tailwind-v4-component-style` — never hardcode values onto it.

---

# How to use this catalog

When the verdict is **adopt a primitive**, the memo (`prior-art-memo.md`) should name the exact
API/feature and the reinvention it avoids. When a primitive *almost* fits but needs a thin
wrapper, that is **extend**, and the wrapper — not raw scattered calls — becomes the shared
surface. Only when nothing here fits do you descend to a tier-4 community candidate.
