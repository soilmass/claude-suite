Purpose: the catalog shape, augmenting next-intl's `Messages` type so keys are statically checked, namespaces, ICU pluralization, and the `check-messages.mjs` contract.

# Typed messages & pluralization

## The catalog: one file per locale, default locale is the type

Keep one JSON catalog per locale under `messages/`. The **default-locale** file (`messages/en.json`)
is the source of truth: it defines the key shape every other locale must match, and the type
`t()` is checked against.

```jsonc
// messages/en.json — the source of truth
{
  "Dashboard": {
    "title": "Your projects",
    "empty": "No projects yet",
    "count": "{count, plural, =0 {No projects} one {# project} other {# projects}}"
  }
}
```

```jsonc
// messages/fr.json — must mirror en.json's keys (check-messages.mjs enforces this)
{
  "Dashboard": {
    "title": "Vos projets",
    "empty": "Aucun projet pour l'instant",
    "count": "{count, plural, =0 {Aucun projet} one {# projet} other {# projets}}"
  }
}
```

## Making keys type-checked (Rule 1, no missing key at runtime)

next-intl exposes a `Messages` interface you augment from the default-locale catalog, so `t("...")`
only compiles with keys that actually exist. A typo is then a **build** failure, not a runtime
`undefined` rendered to a user.

```ts
// src/global.d.ts
import type en from "../messages/en.json";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface IntlMessages extends Messages {} // next-intl reads this
  type Messages = typeof en;
}
```

Usage stays terse and checked:

```tsx
import { useTranslations } from "next-intl"; // client
import { getTranslations } from "next-intl/server"; // server

const t = useTranslations("Dashboard");
return <h1>{t("title")}</h1>;          // ✓ checked
// t("titel")                          // ✗ compile error — not "looks fine, breaks in prod"
```

Static typing covers *renames and typos in code*. It does **not** prove every locale file has
every key — a translator can delete a key from `fr.json` and TypeScript is none the wiser. That
gap is exactly what the script closes.

## The runtime-missing-key gate: `check-messages.mjs`

`scripts/check-messages.mjs` deep-walks the default-locale catalog and every other catalog and
reports, by dot-path:

- **missing** — a key in the default locale absent from a target locale (would render the
  fallback or a blank), and
- **extra** — a key in a target locale not in the default (dead/renamed string).

Exit code = number of mismatches, so it drops straight into CI as a build-failing gate. Run it on
every PR that touches `messages/`. Pair it with a runtime fallback to the default-locale string so
a slipped-through gap degrades to English, never to an empty node.

## Pluralization & ordinals — ICU, never `n === 1`

`one`/`other` is an English oversimplification. Polish has `one`/`few`/`many`/`other`; Arabic has
six categories; French puts `0` and `1` in `one`. Hand-rolled `count === 1 ? a : b` is wrong in
most locales. Use ICU `plural`/`selectordinal` inside the message (resolved by next-intl), or
`Intl.PluralRules` when choosing a category in code:

```ts
const pr = new Intl.PluralRules(locale, { type: "ordinal" });
pr.select(1); // "one" → "1st"  ·  pr.select(2) → "two" → "2nd"
```

Let the message carry the branches (`{count, plural, …}`) so translators control the categories
per locale, rather than the component hard-coding a count of forms.
