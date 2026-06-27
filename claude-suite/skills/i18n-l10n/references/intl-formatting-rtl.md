Purpose: `Intl`-based date/number/currency/collation formatting at the display edge (Rules 5/6), RTL via `dir` + logical properties, and the persisted locale switcher.

# Display-edge formatting, collation & RTL

## The rule: store canonical, format at the edge

Data is stored and transmitted in its canonical, locale-free form and is localized **only at the
moment of display**:

- **Dates/times** — stored as UTC `timestamptz` (Rule 6). Never format in a query, never store a
  formatted string. Convert to the viewer's locale and zone with `Intl.DateTimeFormat` at render.
- **Money** — stored as integer minor units with a currency (Rule 5, owned by `money-modeling`).
  This skill does not re-implement that; it supplies the *active locale* to the currency formatter.
- **Plain numbers** — stored numeric; grouped/decimalized for display with `Intl.NumberFormat`.

```ts
// src/i18n/format.ts — all formatters take the active locale explicitly
export function formatDate(utc: Date, locale: string, tz?: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: tz ?? "UTC", // resolve the viewer's zone at the edge; the row stays UTC
  }).format(utc);
}

export function formatNumber(n: number, locale: string) {
  return new Intl.NumberFormat(locale).format(n);
}
```

### Currency: locale here, minor units there

`money-modeling` owns `formatMoney(minor, currency, locale)` — its `Intl.NumberFormat` derives the
fraction digits from the currency (JPY=0, USD=2, BHD=3), so the divide happens once inside the
formatter, never as a hardcoded `/ 100`. This skill's only job is to pass the **active locale** in:

```tsx
import { useLocale } from "next-intl";
import { formatMoney } from "~/lib/money"; // money-modeling owns this

const locale = useLocale();
return <span>{formatMoney(row.priceMinor, row.currency, locale)}</span>;
// fr-FR → "12,50 €"   ·   en-US → "$12.50"   ·   ja-JP + JPY → "￥1,250"
```

### Relative time & collation

- `Intl.RelativeTimeFormat(locale)` for "2 days ago" / "il y a 2 jours" — compute the delta from
  the UTC instant, then format.
- `Intl.Collator(locale)` for sorting strings the locale's way (so `é`, `ä`, `ñ` order correctly).
  A bare `array.sort()` is byte order, not language order:

```ts
const collator = new Intl.Collator(locale, { sensitivity: "base" });
rows.sort((a, b) => collator.compare(a.name, b.name));
```

All `Intl` constructors run on the edge runtime (they are part of the JS standard library, no Node
APIs), so none of this breaks the edge target.

## RTL: one attribute, logical properties

Layout direction is a property of the locale's **script**, not a per-component choice. Set `dir`
once on `<html>` (see `locale-routing.md`, `dirOf(locale)`), then never branch on `left`/`right`:

- Use Tailwind/CSS **logical** utilities: `ms-*`/`me-*` (margin-inline-start/end), `ps-*`/`pe-*`,
  `start-0`/`end-0`, `text-start`/`text-end` — they flip automatically under `dir="rtl"`.
- Mirror only genuinely directional **icons** (a "back" chevron) with `rtl:-scale-x-100`; never
  mirror text, logos, or media.
- This is the styling side; `layout-composition`/`design-tokens` own the utility vocabulary, and
  `a11y-gate` verifies the rendered `dir`/reading order.

## The persisted locale switcher

The switcher must (a) change the route to the chosen locale and (b) persist the choice so the next
visit to a prefix-less URL resolves the same way. next-intl reads a `NEXT_LOCALE` cookie in the
middleware; write it on change and navigate with the locale-aware router:

```tsx
"use client"; // smallest interactive leaf, per nextjs-app-router
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "~/i18n/navigation"; // next-intl's locale-aware wrappers
import { locales } from "~/i18n/config";

export function LocaleSwitcher() {
  const active = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <select
      aria-label="Language"
      value={active}
      onChange={(e) => {
        document.cookie = `NEXT_LOCALE=${e.target.value};path=/;max-age=31536000;samesite=lax`;
        router.replace(pathname, { locale: e.target.value }); // keeps the same page, swaps locale
      }}
    >
      {locales.map((l) => (
        <option key={l} value={l}>{l.toUpperCase()}</option>
      ))}
    </select>
  );
}
```

Notes: keep the cookie `samesite=lax` and non-secret (it is not sensitive, so no Rule 9 concern);
when the path prefix and the cookie disagree, the **path wins** for that request and the cookie is
updated on the next switch. Prefer a real `<select>` (or a shadcn `Select`) so it is keyboard- and
screen-reader-operable out of the box rather than a hand-built menu.
