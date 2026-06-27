# scripts — i18n-l10n

## `check-messages.mjs`

Verifies that every locale catalog under a `messages/` directory has **exactly** the key set of
the default-locale catalog. It is the mechanical half of the typed-catalog rule: TypeScript checks
that the keys you call `t("...")` with exist in the source locale, but it cannot see that a
translator dropped a key from `fr.json`. This script closes that runtime gap so a missing key fails
CI instead of rendering `undefined` (or a silent blank) to a user.

### Usage

```bash
node check-messages.mjs                       # defaults: ./messages, source locale "en"
node check-messages.mjs src/messages          # custom messages dir
node check-messages.mjs messages --default fr  # treat fr.json as the source of truth
```

### Output & exit code

- Prints one line per discrepancy: `[missing] fr.json: Dashboard.count` (key in the source locale
  absent from a target) or `[extra] fr.json: Dashboard.legacy` (key in a target not in the source).
- **Exit code = total number of mismatches** (missing + extra). `0` means every catalog is aligned.
  Drop it into CI as a build-failing gate on any PR touching `messages/`.
- Exit code `2` is reserved for operational errors (no messages dir, missing source catalog, or a
  catalog that is not valid JSON) — distinct from a clean run.

### Scope & limits

- Compares **key parity only** — it does not judge translation quality, ICU syntax, or whether a
  value is actually translated (a `fr` value left in English passes; that is a human-review concern).
- Arrays and primitive leaves are compared as whole dot-paths; it does not diff inside array
  elements.
- The default locale is also the runtime fallback (see `references/typed-messages-and-plurals.md`),
  so a slipped-through gap degrades to the source string rather than to an empty node.
