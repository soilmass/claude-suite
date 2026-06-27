Purpose: how to measure test *quality* with Stryker on the Vitest unit suite — why coverage isn't
quality, what mutation testing does, scoping to the modules that matter, reading and triaging
survivors, per-module score thresholds, and the cost/runtime tradeoff.

The discipline: **coverage tells you a line ran; the mutation score tells you a regression in it
would be caught.** A green, high-coverage suite with a low mutation score is false confidence.

---

## Coverage vs. mutation score

- **Line/branch coverage** measures *execution*: did a test cause this code to run? A test with **no
  assertions** still earns 100% coverage on everything it touches.
- **Mutation score** measures *detection*: Stryker changes the source (a "mutant"), re-runs the unit
  suite, and asks *did a test fail?* If yes, the mutant is **killed**; if every test still passes, the
  mutant **survived** — a behavior change no test catches. Score = killed / (total non-equivalent).
- **The gap is the whole point.** 94% coverage with a 61% mutation score means roughly a third of
  injected bugs ship past your green suite — the tests execute the code without asserting on the
  result. Keep coverage as a cheap floor (`coverage-gate`); treat mutation score as the real signal.

## What the mutators do

Stryker applies a catalog of small, behavior-changing edits, e.g.:

- **Conditional boundary:** `>` → `>=`, `<` → `<=` (off-by-one bugs — exactly the kind money
  allocation and pagination get wrong).
- **Arithmetic/operator:** `+` → `-`, `*` → `/` (money math, Rule 5).
- **Logical:** `&&` → `||`, negate a condition (ownership/authorization predicates, Rule 2).
- **Statement/call removal:** delete a statement or a method call (a dropped `await`, a skipped
  validation).
- **Literal/boolean:** `true` → `false`, string/number tweaks (Zod refinements, Rule 8).

A test suite that asserts on *results* kills these; one that only asserts "didn't throw" lets them
survive.

## Scope it — mutation is slow

Whole-repo mutation is hours and mostly noise. Point Stryker at **high-blast-radius pure logic** —
the plain functions behind the thin tRPC procedures (`../../CLAUDE.md`: business logic lives in
functions, not procedures), not UI glue or generated code:

- money arithmetic + largest-remainder allocation (Rule 5),
- ownership / authorization predicates (Rule 2),
- date/UTC conversion helpers (Rule 6),
- Zod refinements and transforms (Rule 8).

```jsonc
// stryker.config.json
{
  "testRunner": "vitest",
  "mutate": [
    "src/lib/money/**/*.ts",
    "src/server/**/auth/**/*.ts",
    "!src/**/*.test.ts"
  ],
  "thresholds": { "high": 80, "low": 60, "break": 70 },  // <break% fails the run
  "incremental": true                                     // reuse prior results, mutate only changes
}
```

`incremental: true` (with the committed incremental report file Stryker writes) re-mutates only
changed code on later runs, which is what makes a per-release cadence affordable.

## Reading and triaging survivors

A surviving mutant is a TODO, not noise — work each one:

1. **Missing assertion (the common case).** The test ran the code but didn't check the output. **Fix:**
   add the assertion that pins the behavior the mutant broke. This is the value mutation testing
   delivers — it points at the exact unasserted behavior.
2. **Missing test case.** A branch/edge has no test at all. **Fix:** add the case.
3. **Genuinely equivalent mutant.** The mutation can't change observable behavior (e.g. `<=` vs `<`
   on a bound that's never hit, a dead default). **Fix:** mark it ignored *with a reason*
   (`// Stryker disable next-line` + why). **Interrogate first** — most "equivalent" mutants are
   actually a missing assertion in disguise; reach for this label last.

## Thresholds and cadence

- **Per-module threshold, not a global %.** Money and ownership code should clear a high bar (e.g. 85);
  a global average lets a critical module hide behind well-tested trivia. Set `break` to fail the run
  below the floor.
- **Cadence.** Run **per release** on the scoped modules (incremental), or nightly — **never per-PR on
  the whole tree**. If you want it affordable on every PR, scope it to changed files only; don't lower
  the bar by mutating everything slowly.
- **Record** the scoped globs, thresholds, and any ignored-equivalent mutants in `DECISIONS.md`; tool
  behavior perishes (`perishable-refresh`).
