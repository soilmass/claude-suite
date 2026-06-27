Purpose: the opt-in decision, the locale set / default locale / routing strategy fork, the `[locale]` segment, the `params.locale` Zod parse, and `lang`/`dir`.

# Locale routing on the App Router edge

## 0. i18n is opt-in — decide before scaffolding

The spine (`../../CLAUDE.md`) is English-first. Adding locales adds a route segment, a
middleware concern, a translation catalog per locale, and an ongoing maintenance cost (every new
string must be translated and gated). Only proceed when a **second locale is real** — a stated
requirement, not a "we might one day." If it is one-day, leave English hardcoded and revisit; do
not pay the structural cost speculatively.

Once it is real, settle three things and record them in `DECISIONS.md`:

- **The locale set** — the BCP-47 tags you will support (`en`, `fr`, `ar`, …).
- **The default locale** — used when detection is ambiguous and as the message source of truth.
- **The routing strategy** (the fork):
  - **Path prefix** (`/en/...`, `/fr/...`) — the default choice. Crawlable, shareable, one
    deployment. Use `localePrefix: "as-needed"` to keep the default locale at the root if SEO
    wants clean English URLs, or `"always"` for symmetry.
  - **Domain / sub-domain** (`example.fr`) — only when there is a real per-market reason
    (separate brand, legal, or CDN). More infra; record why.
  - **Cookie-only, no prefix** — avoid for content you want indexed; a single URL can't be
    crawled per locale. Acceptable for an internal tool.

## 1. The default-locale env boundary

The default locale and the locale list are configuration, so they cross the env boundary and are
Zod-parsed there (Rule 8) — hand this to `env-validation`, don't read `process.env` raw:

```ts
// part of the env schema owned by env-validation
DEFAULT_LOCALE: z.enum(["en", "fr"]).default("en"),
```

Keep the canonical `locales` array in one module (`src/i18n/config.ts`) so the segment, the
middleware, and `check-messages.mjs` all import the same source of truth.

```ts
// src/i18n/config.ts
export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

// RTL is a property of the script, not this app's locale union — keep it a string set so
// adding `ar`/`he` to `locales` later needs no cast (no Rule 1 break in exemplar code).
const rtlLocales = new Set<string>(["ar", "fa", "he", "ur"]);
export const dirOf = (l: Locale): "rtl" | "ltr" => (rtlLocales.has(l) ? "rtl" : "ltr");
```

## 2. The `[locale]` segment

The segment shape itself is `nextjs-app-router`'s domain — this skill only adds the locale
concerns: parse the param (Rule 8) and set `lang`/`dir`.

```tsx
// src/app/[locale]/layout.tsx  (Server Component)
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { locales, dirOf, type Locale } from "~/i18n/config";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!locales.includes(locale as Locale)) notFound(); // Rule 8: validate the route param
  setRequestLocale(locale); // enables static rendering of the subtree

  const messages = await getMessages(); // typed — see typed-messages-and-plurals.md
  return (
    <html lang={locale} dir={dirOf(locale as Locale)}>
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
```

`notFound()` on an unknown locale gives you the structural four-state coverage (Rule 4) for the
"no such locale" case for free, rather than rendering a blank tree.

## 3. Where Clerk's `<ClerkProvider>` sits

`<ClerkProvider>` wraps the app once. When it carries translated Clerk UI, pass Clerk's own
`localization` bundle keyed off the active locale (see the SKILL Edge Cases) — that is separate
from your message catalog. Keep the provider above `NextIntlClientProvider` so both contexts are
available to the subtree.
