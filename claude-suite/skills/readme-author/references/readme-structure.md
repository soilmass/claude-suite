# README structure — canonical section order, patterns, and skeleton

Purpose: the fixed shape a README should take, the load-bearing patterns (what/why,
quickstart), and a fill-in skeleton so every README in the suite reads the same way.

## The order (top to bottom)

A reader scans top-down and bails early. Order by decreasing universality.

1. **Title + one-line tagline** — the project name and a single sentence of what it is.
2. **What / why** — two to four sentences: what it is, the problem it solves, who it is
   for. This is the only prose that earns its place above the quickstart.
3. **Quickstart** — the shortest copy-pasteable path to a working result.
4. **Install** — prerequisites + the install command(s).
5. **Usage** — one or two of the most common, real examples. Link the rest out.
6. **Configuration** — only the essential env vars / options, as a table; link the full
   reference.
7. **Links / further reading** — deeper docs (`technical-writing`), changelog
   (`changelog-from-commits`), contributing, support.
8. **License** — one line + link.

Badges, a TOC, and screenshots are optional and go *below* the what/why, never above it.
For a short package README, sections 5–6 collapse into one and 2 may be a single line.

## What / why — the first-two-lines rule

The first non-title line states what the project *is*; the second states the problem it
solves. A reader must be able to self-select in/out from these two lines alone.

Good:
```
# acme-billing

Type-safe billing procedures for Next.js apps on the edge runtime.
Drop-in tRPC routers for subscriptions and one-off charges — no Stripe glue code to write.
```

Bad (background-first, no self-selection): "Billing is hard. Over the years we have seen
many teams struggle with payment integration. This library is the result of…"

## Quickstart — copy-paste and it runs

- One fenced block, minimal steps, no commentary between commands a reader must paste.
- Start from the most common entry state (a fresh install or clone), end at a visible
  result ("you should see …").
- **Verify it.** Run the commands, or explicitly mark any step you could not execute
  (e.g. one needing live credentials) rather than presenting unverified steps as working.
- Show package-manager-agnostic commands or pick the project's standard one; do not list
  npm + pnpm + yarn + bun variants for every line — link a note if it matters.

```bash
npm i acme-billing
# add the router to your tRPC app
```
```ts
import { createBillingRouter } from "acme-billing";
export const billing = createBillingRouter({ /* … */ });
```

## Scannability rules

- Every section is a heading; a reader skimming only headings + first lines must still
  get what/why/how.
- Prefer lists and tables over paragraphs. One idea per bullet.
- Keep the body shallow. The README is a **map**, not the territory — depth lives in
  `docs/` (owned by `technical-writing`) and is linked, not inlined.
- Target length: a package README fits on roughly one screen plus the quickstart; a repo
  README rarely needs more than two screens before it should be linking out.

## Edge-runtime / stack honesty

This suite ships on the **edge runtime** with a serverless/HTTP DB driver, Clerk edge
middleware, and Next.js App Router (see `../../CLAUDE.md`). When that constrains install or
usage, say so in **Prerequisites**, up front — e.g. "requires a Neon/Turso-class
serverless driver; no long-lived TCP pool." Never let a user discover a hard runtime
assumption through a cryptic error.

## Fill-in skeleton

```md
# <project>

<one line: what it is>.
<one line: the problem it solves / who it's for>.

## Quickstart

​```bash
<install>
<run>
​```
<one line: what success looks like>

## Install

Prerequisites: <runtime/version, e.g. Node ≥ X, edge runtime, serverless DB driver>.

​```bash
<install command>
​```

## Usage

<one common example, real and minimal>

For advanced usage, see [docs](./docs) (→ technical-writing).

## Configuration

| Var | Required | Description |
| --- | -------- | ----------- |
| `EXAMPLE_KEY` | yes | … (see `.env.example`; never commit secrets — Rule 9) |

## Links

- [Documentation](./docs)
- [Changelog](./CHANGELOG.md)
- [Contributing](./CONTRIBUTING.md)

## License

<SPDX id> — see [LICENSE](./LICENSE).
```
