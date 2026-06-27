# README pre-ship checklist — the gates a README passes before it is done

Purpose: a mechanical checklist run against a finished README so the recurring defects
(unverified quickstart, unscannable body, inlined docs, dishonest state) are caught before
it ships.

## 1. What/why gate

- [ ] The first non-title line says what the project **is**.
- [ ] The second line says the **problem** it solves / who it's for.
- [ ] A stranger can self-select in or out from those two lines alone, with no scrolling.
- [ ] No badges, TOC, or background paragraph sits above the what/why.

## 2. Quickstart-runs gate

- [ ] There is a single copy-pasteable quickstart block.
- [ ] Every command in it was actually executed — or any unverifiable step (needs live
      credentials, external service) is explicitly marked as such.
- [ ] Package names, commands, and import paths match the real published artifact.
- [ ] The block ends at a visible, checkable result.

## 3. Scan-test gate

- [ ] Reading only the headings + the first line under each still conveys what/why/how.
- [ ] Every section has a heading; no orphan wall of prose.
- [ ] Lists/tables are used over paragraphs where possible.
- [ ] Body fits roughly one screen (package) or two (repo) before linking out.

## 4. No-inlined-docs gate

- [ ] The full API / config reference is **not** pasted in — it is linked to `docs/`
      (owned by `technical-writing`).
- [ ] Version history is **not** pasted in — it links to the changelog (owned by
      `changelog-from-commits`).
- [ ] Usage shows only the one or two most common cases; advanced cases are links.

## 5. Honesty-of-state gate

- [ ] Runtime/version prerequisites are stated (edge runtime + serverless driver where it
      applies, per `../../CLAUDE.md`).
- [ ] Project status (alpha / beta / stable) is accurate.
- [ ] No claimed feature, platform, or integration the project does not actually support.
- [ ] Known limitations or caveats are noted, not hidden.

## 6. Links + meta gate

- [ ] Deeper docs, changelog, contributing, license, and "get help" are present as a short
      link list, not prose.
- [ ] All relative links resolve (no dead `./docs` / `./CONTRIBUTING.md` targets).
- [ ] License section names the SPDX id and links the LICENSE file.

## 7. Security gate (Rule 9)

- [ ] No real secrets, tokens, or keys in any example or env table — placeholders +
      `.env.example` reference only.
- [ ] No `NEXT_PUBLIC_*` shown holding anything secret.

If any gate fails, fix before shipping. The two most common real failures are gate 2
(quickstart never run) and gate 4 (README grown into a stale second copy of the docs).
