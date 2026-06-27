---
description: Run a systematic debugging loop
argument-hint: "[symptom]"
---

Debug the reported symptom systematically: $ARGUMENTS

No single skill — follow the loop:

1. **Reproduce** — get a reliable, minimal repro before changing anything.
2. **Isolate** — bisect the inputs or commits to narrow where it breaks (the `bisect` skill
   helps when a known-good and known-bad commit exist).
3. **Hypothesize** — form exactly one hypothesis about the cause.
4. **Test it** — confirm or kill the hypothesis with a targeted check; loop back to 3 if killed.
5. **Fix** — make the smallest change that addresses the confirmed cause.
6. **Regression test** — invoke the `test-author` skill to add a test that fails without the fix.

If the symptom is a TypeScript or Next.js build error, hand off to the `build-error-resolver`
agent. Honor the nine rules in `../../CLAUDE.md` throughout.
