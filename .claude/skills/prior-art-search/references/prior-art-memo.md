Purpose: the prior-art memo template — capability statement, ranked matches, the adopt/extend/build verdict rule, and the what-was-searched record so the search isn't re-run from scratch.

# Prior-art memo

```
## Prior-art: <capability, one sentence, stack-shaped>
Date: <YYYY-MM-DD>   Searched by: <name/agent>

### Capability
<What is needed, as a behavior not a library. e.g. "format minor-unit money for display">

### Matches (ranked)
| Source                          | Tier | Closeness        | Rule notes                  |
| ------------------------------- | ---- | ---------------- | --------------------------- |
| src/lib/money.ts formatMinor…   | 1    | exact            | already minor-units (R5)    |
| Intl.NumberFormat               | 2    | exact (primitive)| display-edge (R6)           |
| <community lib>                 | 4    | partial          | edge-fit: ? → tech-evaluation |

Closeness = exact | partial | adjacent. Tier per search-tiers.md (1 in-repo … 4 community).

### Verdict: <ADOPT | EXTEND | BUILD>
<One line + the rule below.>

### What was searched (so this isn't re-run blind)
- In-repo: <globs/greps run, what was found/not>
- Primitives: <which Web-standard / Drizzle / Zod / Clerk / shadcn features checked>
- Sibling skills: <which checked>
- Community: <only if tiers 1–3 empty — candidates captured, handed to tech-evaluation>
```

---

# The verdict rule

- **ADOPT** — an existing thing (in-repo helper, stack primitive, sibling pattern) fits as-is
  and is Rule-clean. Use it. No new code, no new dep. Name it precisely.
- **EXTEND** — something close exists but needs generalizing or wrapping. Wrap/generalize the
  existing thing (hand to `refactor` if it's an in-repo change) so there remains **one** shared
  surface, not a parallel copy. If the existing thing violates a rule (untyped, floats money,
  missing ownership check), extend = fix-and-reuse, not adopt-as-is.
- **BUILD** — nothing fits. Justify it: state what was searched (the record above proves the
  tiers were walked) so "build" is a conclusion, not a default. Hand to `vertical-slice` /
  `schema-design`; if a dep is implicated, hand the candidate shortlist to `tech-evaluation`.

# Discipline
- Tier 1 (in-repo) is non-optional — the memo is invalid without the in-repo search record.
- A community candidate is never an ADOPT here; it is a BUILD-with-dep whose dep must clear
  `tech-evaluation` first. This skill finds; it does not approve dependencies.
- If the search resolves a fork (standardize on the existing helper vs a new dep, consolidate
  two drifting in-repo solutions), record it in `DECISIONS.md` with date and one-line rationale.
