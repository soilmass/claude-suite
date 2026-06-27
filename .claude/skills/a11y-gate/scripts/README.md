# a11y-gate scripts

Running axe is environment-specific (it needs rendered DOM). In this App-Router/edge
setup, run axe-core via Playwright against built routes:

```
# pseudocode — wire to your test runner
import { injectAxe, checkA11y } from "axe-playwright";
await injectAxe(page);
await checkA11y(page, undefined, { detailedReport: true }, true, "wcag2a,wcag2aa,wcag22aa");
```

The script is intentionally not vendored here (it depends on the project's test setup).
Wire it in CI as part of the done-time gate. axe covers only machine-detectable rules —
the SKILL.md manual checklist (`references/manual-checks.md`) covers the rest and is not
optional.
