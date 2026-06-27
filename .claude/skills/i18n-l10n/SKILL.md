---
name: i18n-l10n
description: >
  Add internationalization & localization to the Next.js App Router edge stack the decided
  way (next-intl class): a `[locale]` route segment, locale detection that composes inside the
  existing `clerkMiddleware` (not a second middleware), a typed message catalog so a missing
  key fails at build instead of rendering `undefined`, `Intl`-based date/number/currency
  formatting at the display edge (UTC `timestamptz` → format on display, Rule 6; minor units →
  currency, Rule 5), ICU pluralization, RTL via `dir`, and a locale switcher that persists.
  This is opt-in — the stack is English-first by default; only reach for it when a second
  locale is actually on the table.
  Use when: "add multi-language support", "internationalization", "i18n", "localize the app",
  "locale routing", "translate the UI", "right-to-left / RTL support", "locale switcher".
  Do NOT use for: how money is stored or the currency-format helper itself (use money-modeling);
  the `[locale]` segment's underlying routing/middleware mechanics or server/client boundary
  (use nextjs-app-router); the Clerk middleware itself or its matcher (use clerk-auth-flows);
  validating the default-locale env var (use env-validation).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the i18n failure class. Baseline observed 2026-06-26 and
    narrowed: a capable base model composes the locale middleware into Clerk's correctly, but
    leaks API/tRPC past `auth.protect()`, hardcodes a `/ 100` currency divide, breaks the type
    chain with `@ts-expect-error`, hardcodes `dir="ltr"`, and ships an untyped catalog with no
    missing-key gate.
---

# i18n-l10n

The localization layer for the edge stack. Multi-locale support is mostly invisible failures: a
`t("titel")` typo renders `undefined` to a user instead of failing the build, a date formatted in a
query bakes one viewer's timezone into the row, a hardcoded `/ 100` mis-scales JPY, and locale
handling slips a route past `auth.protect()`. This skill wires the `[locale]` segment, folds locale
detection *into* the existing `clerkMiddleware`, makes the message catalog a typed schema, and
pushes every locale-sensitive format to the display edge with `Intl`. It is **opt-in**: the spine is
English-first, so do not scaffold locales nobody asked for.

Spine and the nine rules live in `../../CLAUDE.md` (App Router + edge, Rules 5/6/8); this skill
obeys them and does not restate them.

---

## Non-Negotiable Rules

These ship in code that compiles and renders fine in English, which is why they survive review:

- **Never key translations by bare string with no typed catalog.** Messages are a typed schema
  rooted in the default-locale catalog; a missing key must be a *build/lint* failure, never a
  runtime `undefined` (or thrown 500) shown to a user. Gate with `check-messages.mjs`.
- **Never format or store a localized value early.** Dates stay UTC `timestamptz` (Rule 6) and
  money stays integer minor units (Rule 5) in the DB and on the wire; localization happens only at
  the display edge via `Intl`. A stored `"3/4/25"` or pre-formatted `"$1,234.50"` is a defect.
- **Never add a second `middleware.ts` for locale.** Next.js runs exactly one middleware chain.
  Locale detection composes *inside* `clerkMiddleware`; a standalone locale middleware (or one that
  returns early) skips auth on the routes it handles. See `references/middleware-composition.md`.
- **Never branch layout on `left`/`right` or hard-code `dir`.** Set `dir` from the locale's script
  on `<html>` and lay out with logical properties (`ms-*`/`me-*`, `start`/`end`) — RTL is one
  attribute, not a rewrite.

Refuse these rationalizations: "just use `t()` with string keys, we'll catch typos in review";
"format the date in the query / store the localized string, it's simpler"; "add a separate
locale middleware, Clerk's is its own thing"; "we only ship LTR languages so skip `dir`";
"hand-roll `n === 1 ? singular : plural`, ICU is overkill."

---

## When to Use

- A genuinely second locale is on the table (e.g. English **and** French) and the UI must translate.
- You need per-locale routing (`/en/...`, `/fr/...`) and locale-aware date/number/currency output.
- Adding pluralization, an RTL language, or a persisted locale switcher to an app.
- Auditing an existing i18n wiring for the middleware-coexistence or missing-key failure classes.

## When NOT to Use

- The app is single-locale English — i18n is opt-in; don't add the `[locale]` segment → leave it
  to the English-first default in `../../CLAUDE.md`.
- How money is stored, the minor-unit math, or the `formatMoney` helper itself → `money-modeling`.
- The `[locale]` segment's underlying routing, the server/client boundary, or streaming → `nextjs-app-router`.
- The Clerk middleware, its matcher, or the auth flow itself → `clerk-auth-flows`.
- Adding/validating the `DEFAULT_LOCALE` (or locale list) env var → `env-validation`.

---

## Procedure

1. **Confirm i18n is actually wanted, then decide the locale set (high — opt-in, costly to undo).**
   Locales are not free; only proceed if a second locale is real. Decide the list, the default
   locale, and the routing strategy (path-prefix vs. domain), validate `DEFAULT_LOCALE` through
   `env-validation`, and record the choices in `DECISIONS.md`. See `references/locale-routing.md`.
2. **Stand up the `[locale]` segment (medium).** Wrap the app in `app/[locale]/layout.tsx`,
   Zod-parse `params.locale` against the known set (Rule 8) and `notFound()` on an unknown one, and
   render `<html lang={locale} dir={dirOf(locale)}>`. Segment mechanics belong to `nextjs-app-router`.
3. **Compose locale detection *into* `clerkMiddleware` (high — the coexistence trap).** Run the
   locale matcher inside the single `clerkMiddleware` callback so one chain does both auth and
   locale, with one `config.matcher` covering `/((?!_next|.*\\..*).*)` and `/(api|trpc)(.*)`.
   Never a second middleware. See `references/middleware-composition.md`.
4. **Make messages a typed catalog (high — no missing key at runtime).** One catalog per locale
   (`messages/en.json` is the source of truth), augment next-intl's `Messages` type from it so
   `t("...")` only accepts real keys, and gate CI with `scripts/check-messages.mjs` (missing/extra
   keys across locales). See `references/typed-messages-and-plurals.md`.
5. **Format only at the display edge with `Intl` (medium — Rules 5/6).** `Intl.DateTimeFormat` on a
   UTC `timestamptz` (convert on display, never in the query), `Intl.NumberFormat({ style:
   "currency" })` on minor units handed up by `money-modeling`, `Intl.Collator` for sorting.
6. **Pluralize and order via ICU / `Intl`, not by hand (medium).** Use ICU `{count, plural, …}`
   messages or `Intl.PluralRules`/`Intl.RelativeTimeFormat`; never `n === 1 ? a : b`, which is
   wrong in most languages. See `references/typed-messages-and-plurals.md`.
7. **Wire RTL and a persisted switcher (medium).** Derive `dir` from the locale's script, use
   logical properties, and build a switcher that writes a `NEXT_LOCALE` cookie (read by the
   middleware) and rewrites the path so the choice survives reloads. See `references/intl-formatting-rtl.md`.

---

## Composes With

- **Consumes:** `nextjs-app-router` (the `[locale]` segment shape, server/client boundary,
  route-param Zod parse), `clerk-auth-flows` (the `clerkMiddleware` this folds locale into), and
  `env-validation` (the `DEFAULT_LOCALE` / locale-list env boundary).
- **Pairs with:** `money-modeling` — it owns minor-unit storage and the `formatMoney` helper;
  this skill supplies the active locale that helper's `Intl.NumberFormat` runs in.
- **Pairs with:** `layout-composition` / `design-tokens` for the logical-property layout RTL needs.
- **Hands off:** finished surface → `rule-audit` (Rules 1/5/6/8), `a11y-gate` (`lang`/`dir`,
  translated labels), and any resolved fork → `DECISIONS.md`.

---

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent told to implement as a
> typical dev would, no project conventions): "add English/French support with locale routing to
> a Next.js app that already uses Clerk." The imagined catastrophe — a second `middleware.ts`
> fighting Clerk's, hand-rolled `n === 1` plurals, no RTL awareness — did **not** occur. A capable
> base model reached for next-intl and got the headline structure right. A **narrower** failure
> class was confirmed.

**Observed run.** The agent produced a competent next-intl setup: it composed the locale middleware
*inside* `clerkMiddleware` (one default export, not two), validated the `[locale]` segment, wrote ICU
`{count, plural, …}` messages, and described logical-property RTL. But four disciplines were missing:

```ts
// /api and /trpc return BEFORE auth.protect() runs — unprotected at the edge:
if (pathname.startsWith("/api") || pathname.startsWith("/trpc")) return NextResponse.next();
format.number(p.priceMinor / 100, { ... });   // hardcoded /100 — wrong for JPY (0) / BHD (3)
// @ts-expect-error -- pathname/params are valid together   ← type chain broken (Rule 1)
<html lang={locale} dir="ltr">                  // RTL hardcoded off; "make it dynamic later"
```

Messages were also looked up with stringly-typed `t("...")` against plain JSON — **no `IntlMessages`
augmentation, no key-parity gate** — so a typo, or a key `fr.json` is missing, fails at runtime not build.

**Failure class (confirmed, narrowed).** Not "produces a broken middleware" — "composes the
middleware correctly, then leaks the details the rules turn on": API/tRPC short-circuited *past*
`auth.protect()` (auth-coverage gap on the mutating surface); a hardcoded `/ 100` divide that
mis-scales non-cent currencies (Rule 5 / `money-modeling` ignored); an `@ts-expect-error` breaking
the type chain (Rule 1); `dir="ltr"` hardcoded; an untyped catalog with no missing-key gate. This
skill closes exactly those.

---

## Examples

**Input:** "Add English and French with `/en` and `/fr` routing to our app."
**Output:** Records `locales=[en,fr]`, `defaultLocale=en`, path-prefix strategy in `DECISIONS.md`;
adds `app/[locale]/layout.tsx` that Zod-parses `params.locale` and sets `lang`/`dir`; folds the
next-intl locale matcher **inside** the existing `clerkMiddleware` (one chain, one matcher);
makes `messages/en.json` the typed source and wires `check-messages.mjs` into CI; leaves money
formatting to `money-modeling` with the active locale passed in.

**Input:** "Show 'You have N messages' and the post date, localized."
**Output:** An ICU `{count, plural, one {# message} other {# messages}}` entry (typed key), and
`Intl.DateTimeFormat(locale, …)` applied to the row's UTC `timestamptz` at render — never a
`count === 1` ternary, never a date formatted in the query.

**Input:** "We're adding Arabic."
**Output:** Marks `ar` RTL, sets `dir="rtl"` from the script on `<html lang="ar">`, confirms the
layout uses logical properties (no mirroring rewrite); hands the visual check to `a11y-gate`.

---

## Edge Cases

- **A route must stay locale-less** (a webhook, a health check, `/api/...`) → exclude it from the
  locale rewrite but keep it inside `clerkMiddleware`'s coverage; never drop it from auth.
- **Clerk's own UI (`<SignIn />`) needs translating** → use Clerk's `localization` prop with its
  locale bundle, driven by the same active locale; don't try to feed it your message catalog.
- **A key exists in `en` but not `fr` at ship time** → `check-messages.mjs` fails CI; fall back to
  the default-locale string at runtime *and* fix the catalog — a silent blank is the defect.
- **Locale in the path disagrees with the `NEXT_LOCALE` cookie** → the path wins for that request;
  the switcher updates the cookie on change so the next default-route visit is consistent.

---

## References

- `references/locale-routing.md` — the opt-in decision, locale set + default + routing strategy,
  the `[locale]` segment, `params.locale` Zod parse, and `lang`/`dir`.
- `references/middleware-composition.md` — folding the locale matcher into `clerkMiddleware` (one
  chain), the combined `config.matcher`, and why a second middleware drops auth.
- `references/typed-messages-and-plurals.md` — the catalog shape, augmenting the `Messages` type so
  keys are checked, ICU pluralization, and the `check-messages.mjs` contract.
- `references/intl-formatting-rtl.md` — `Intl` date/number/currency/collation at the display edge
  (Rules 5/6), RTL via `dir` + logical properties, and the persisted locale switcher.

## Scripts

- `scripts/check-messages.mjs` — compares every locale catalog against the default-locale source
  and reports missing/extra keys (deep, dot-path). This is the mechanical half of the typed-catalog
  rule — a missing key fails CI instead of rendering `undefined`. Exit code = number of mismatches.
- `scripts/README.md` — usage, the source-of-truth-locale model, and the exit-code convention.
