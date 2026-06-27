---
name: readme-author
description: >
  Structure a project or package README so a first-time reader gets oriented in
  seconds: a one-line what/why, a copy-pasteable quickstart that actually runs, install
  and usage essentials, and links out to the deeper docs — scannable, not a wall of
  prose. Front-loads the value proposition and a working quickstart, then keeps the body
  shallow so the README stays maintainable and points elsewhere for depth.
  Use when: "write a readme", "readme", "project readme", "document the repo".
  Do NOT use for: deep conceptual guides, tutorials, or API references (use
  technical-writing), or generating a release/changelog from git history (use
  changelog-from-commits).
license: Apache-2.0
metadata:
  version: "0.1"
  source_of_truth: ../../CLAUDE.md
  changelog: >
    v0.1 — initial draft. Encodes the failure class of the unscannable README that buries
    what the project is, ships a quickstart that does not run, and tries to be the full
    docs instead of a map to them.
    Baseline observed (clean-room capture).
---

# readme-author

Turn a repo into a README a stranger can act on in under a minute: what it is and why it
exists, a quickstart that copy-pastes and runs clean, the install/usage essentials, and
links out to the deep docs. The failure this kills is the README that opens with prose
nobody reads, hides the quickstart below a fold of badges, and slowly grows into a stale
second copy of the real documentation. This is a writing/structure skill — it shapes the
map, not the territory. See `../../CLAUDE.md` for the suite's broader voice and
decision-record discipline.

## When to Use

- Authoring the top-level `README.md` for a new repo, app, or library.
- Writing a package README that will render on npm / a registry landing page.
- Rewriting an existing README that has drifted into an unscannable wall of text.
- Adding a per-package README in a monorepo so each workspace explains itself.

## When NOT to Use

- A deep conceptual guide, tutorial, architecture explainer, or API reference — use
  `technical-writing`; the README links *to* those, it does not contain them.
- Generating release notes or a `CHANGELOG.md` from commit history — use
  `changelog-from-commits`; the README links to the changelog, never inlines it.
- The product's marketing landing page or in-app copy — that is a voice/human-pass
  concern (see `../../CLAUDE.md` microcopy notes), not a README.

## Procedure

1. **Identify the audience and the one job (interrogation: medium).** Decide who lands
   here first — a consumer installing the package, a contributor cloning the repo, or an
   evaluator deciding whether to adopt — and the single action they need to take. Wrong
   audience guess produces a README that serves no one. State the call with the user. See
   `references/readme-structure.md`.
2. **Write the what/why in the first two lines.** One sentence on what the project *is*,
   one on the problem it solves — above any badge, TOC, or screenshot. If a reader cannot
   tell in two lines whether this is for them, the README has already failed. See
   `references/readme-structure.md`.
3. **Make the quickstart copy-pasteable and verify it runs.** The shortest path from clone
   to a working result, as a single fenced block a reader can paste. A quickstart that
   does not run is worse than none — actually execute the commands, or mark any step you
   could not verify. See `references/readme-structure.md`.
4. **Keep install and usage minimal, link the rest out.** Prerequisites, install command,
   and the one or two most common usage examples — nothing more. Every "and here's the
   advanced…" urge is a link to `technical-writing` docs, not a new README section. Resist
   re-documenting the whole API inline.
5. **Be honest about state and stack.** Note the runtime/version assumptions (this suite
   ships on the **edge runtime** — say so where it constrains install or usage, per
   `../../CLAUDE.md`), the project status (alpha/stable), and any known limits. Never
   imply support the project does not have.
6. **Add the supporting links and meta last.** Contributing, license, changelog
   (→ `changelog-from-commits`), deeper docs (→ `technical-writing`), and how to get help —
   as a short link list, not prose. See `references/readme-checklist.md`.
7. **Scan-test the result.** Read only the headings and the first line under each: the
   README must still convey what/why/how from that skim alone. Run it past
   `references/readme-checklist.md` before calling it done.

## Composes With

- **Consumes:** `technical-writing` — the deep guides, tutorials, and API references the
  README links out to; the README is the index, those are the chapters.
- **Pairs with:** `changelog-from-commits` — the README links to the changelog it
  produces; keep version history there, never duplicated in the README body.
- **Feeds:** a repo's first-contributor and first-consumer experience; the entry point
  every other doc hangs off.

## Baseline failure (observed 2026-06-26)

> Captured by running the task without this skill (a general-purpose agent, no project
> conventions). The encoded failure class was confirmed.

**Observed run.** Asked to write the README for this very `claude-suite` package, the naive
agent never read `CLAUDE.md`, `DECISIONS.md`, the existing 9KB `README.md`, or any primitive
source — it inferred everything from filenames and a quick `ls`, then wrote a fresh README
that ignored the existing curated one and invented unverified facts (an install method, a
license, primitive counts):

```md
## Install
This is a configuration package, not an npm dependency. Copy the `.claude/` directory ...
cp -r .claude /path/to/your-app/
## License
MIT (or your project's license).
```

By its own admission it described hooks as active when memory notes say they are opt-in/inactive,
guessed command-to-skill mappings, and reported counts ("82 skills, 16 agents") it never
cross-checked. It also missed the house-style structure of the primitives entirely.

**Failure class (confirmed).** Without this skill the agent writes a plausible README from
filenames and assumptions instead of from the repo's source of truth: it overwrites rather
than updates an existing curated README, invents install/license/version facts it never
verified, and ships counts and behavior claims that are wrong. A README that confidently
misstates how the project works is worse than none.

## Examples

- **Input:** "Write a README for our edge-deployed tRPC billing package."
  → **Output:** Two-line what/why ("Type-safe billing procedures for Next.js on the edge");
  a verified `npm i` + minimal `createBillingRouter` usage block; an explicit "requires the
  edge runtime + a serverless DB driver" note (per `../../CLAUDE.md`); links out to the
  full procedure reference (`technical-writing`) and the changelog
  (`changelog-from-commits`) — not inlined.
- **Input:** "Our repo README is a wall of text, fix it."
  → **Output:** Restructured to what/why → quickstart → install → usage → links;
  the API dump pulled out into a `docs/` guide and linked; headings made scannable so the
  skim-test passes.
- **Input:** "Add a README to the `@acme/ui` workspace in our monorepo."
  → **Output:** Package-scoped README: what the workspace provides, install-from-workspace
  quickstart, one shadcn-compose usage example, and a link up to the root README and
  design-token docs.

## Edge Cases

- **The quickstart needs secrets or a live DB** → show the env-var names and a
  `.env.example` reference, never real secret values (Rule 9), and state the setup
  prerequisite plainly instead of pretending it is zero-config.
- **Monorepo with many packages** → keep the root README a map (what each workspace is +
  links), and give each package its own scoped README; do not document every package at
  the root.
- **The project assumes the edge runtime / a specific driver** → call the constraint out
  in prerequisites up front (per `../../CLAUDE.md`), so users do not discover it via a
  cryptic runtime error.
- **Version history requested in the README** → link to the changelog
  (`changelog-from-commits`); never paste release notes into the README body where they
  will rot.

## References

- `references/readme-structure.md` — the canonical section order, the what/why and
  quickstart patterns, length/scannability rules, and a fill-in skeleton.
- `references/readme-checklist.md` — the pre-ship checklist: quickstart-runs, scan-test,
  links-out, honesty-of-state, and no-inlined-docs gates.

## Scripts

Reserved. A script would be justified if the suite wants a link-checker that flags dead
relative links and missing `docs/` targets referenced from a README, or a skim-extractor
that prints just the headings + first lines to mechanize the scan-test.
