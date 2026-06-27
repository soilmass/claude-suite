export const meta = {
  name: 'trigger-fidelity',
  description: 'Blind routing test: fresh agents route natural phrases to a single skill against the real catalog; score against an acceptable set and flag misroutes',
  phases: [{ title: 'Route' }],
}

// Path to the catalog produced by build-catalog.mjs. Override with args:{catalog:"<abs path>"}.
const CATALOG = (typeof args === 'object' && args && args.catalog) || 'claude-suite/tests/trigger-fidelity/.catalog.md'

// CASES: [phrase, [acceptable slugs], note]. A single-element array = one correct answer;
// multiple = a genuinely ambiguous phrase where any listed skill is acceptable. A pick OUTSIDE
// the acceptable set is a real misroute → fix that skill's description / "Do NOT use for:".
const CASES = [
  // --- core + known collision pairs ---
  ['Can you review my code for quality before I open the PR?', ['code-review'], 'vs rule-audit'],
  ['Audit this diff against our rules before I commit.', ['rule-audit'], 'vs code-review'],
  ['Is the type chain unbroken from Drizzle through to the component?', ['type-chain-audit'], 'vs rule-audit'],
  ['This router feels slow — are there N+1 queries?', ['n1-hunter'], 'vs query-optimization'],
  ['Load each post together with its author in one query.', ['drizzle-relational-queries'], 'vs n1-hunter'],
  ['Build the projects feature end to end.', ['vertical-slice'], 'core'],
  ['Design the database tables for users, projects and tasks.', ['schema-design'], 'vs index-strategy'],
  ['Add an index — this filter is slow.', ['index-strategy'], 'vs query-optimization'],
  ['This specific query is slow, diagnose it with EXPLAIN.', ['query-optimization'], 'vs index-strategy'],
  ['Set up the database driver for the edge.', ['neon-turso-driver'], 'core'],
  ['Add a dropdown account menu to the navbar.', ['shadcn-compose'], 'core'],
  ['Paginate the posts list with infinite scroll.', ['pagination-cursor'], 'core'],
  ['How should I store prices for products?', ['money-modeling'], 'core'],
  ['Store event start and end times with timezones.', ['temporal-data'], 'core'],
  ['Make sure every query is scoped to the current organization.', ['multitenancy-scoping'], 'vs vertical-slice'],
  ['Check this page for accessibility.', ['a11y-gate'], 'core'],
  ['Threat-model this feature before launch.', ['security-pass'], 'core'],
  ['Did I commit a secret anywhere?', ['secret-scan'], 'vs env-validation'],
  ['Set up the typed env vars with validation.', ['env-validation'], 'vs secret-scan'],
  ['Set up GitHub Actions CI for this app.', ['ci-pipeline'], 'core'],
  ['Deploy this to Vercel.', ['deploy-edge'], 'core'],
  ['Should we adopt this date library?', ['tech-evaluation'], 'core'],
  ['Generate the API reference for our endpoints.', ['api-docs-from-trpc'], 'vs technical-writing'],
  ['Create a new skill for rate-limiting procedures.', ['skill-create'], 'meta'],
  ['Add a /gates slash command.', ['command-create'], 'meta'],
  ['Add a hook that blocks committing secrets.', ['hook-create'], 'meta'],
  ['We renamed a column — ship the migration safely across deploys.', ['migration-deploy-coordination'], 'vs migration-author'],
  // --- adversarial: vague / two-skill / overlap (acceptable sets) ---
  ['Make this page faster.', ['perf-budget-check', 'bundle-analysis'], 'vague perf'],
  ['Clean up this messy code.', ['code-review', 'refactor'], 'vague cleanup'],
  ['Document this feature for our users.', ['technical-writing'], 'doc trap'],
  ['Make this endpoint secure.', ['security-pass'], 'vague security'],
  ['Review this PR for bugs and rule violations.', ['rule-audit', 'code-review'], 'two-skill'],
  ['The dashboard is slow and ships too much JavaScript.', ['bundle-analysis', 'perf-budget-check'], 'two-skill perf'],
  ['Validate the contact form input.', ['zod-schema-library', 'rhf-advanced'], 'trap: NOT env-validation'],
  ['Cache the product list so the page is fast.', ['data-fetching-cache'], 'overlap vs perf'],
  ['Design the data model and decide its indexes.', ['schema-design', 'index-strategy'], 'two-skill db'],
  ['Set up authentication for the app.', ['clerk-auth-flows', 't3-genesis'], 'overlap auth/genesis'],
  ['Run accessibility checks in the CI pipeline.', ['ci-a11y-test'], 'trap: NOT a11y-gate'],
  ['Has anyone already built a CSV export we can reuse?', ['prior-art-search'], 'vs tech-evaluation'],
  ['This skill ships a fake placeholder baseline — make it real.', ['baseline-capture'], 'meta'],
  ['Are all our skills consistent and well-formed?', ['suite-audit'], 'meta'],
  ['Record that we picked Neon over PlanetScale.', ['decision-log', 'draft-adr'], 'decision overlap'],
  ['Roll the new editor out to 10% of users.', ['feature-flags'], 'core'],
  ['Keep an immutable record of who edited each invoice.', ['audit-log-pattern'], 'vs log-discipline'],
  ['We got a surprise $4k cloud bill — stop that happening.', ['spend-cap'], 'vs log-discipline'],
  ['Scaffold a brand-new app on our stack.', ['t3-genesis'], 'foundation'],
  ['Set up the color and spacing system.', ['design-tokens'], 'foundation'],
  ['Style this button using our theme.', ['tailwind-v4-component-style'], 'vs design-tokens'],
  ['Make the like button feel instant.', ['optimistic-updates'], 'core'],
  ['Show a skeleton while loading and an error screen for this route.', ['error-boundaries'], 'vs component-state-test'],
  ['Backfill the new column across millions of rows.', ['data-backfill'], 'vs migration-author'],
  ['Add logging that does not leak PII.', ['log-discipline'], 'vs observability-setup'],
  ['Trace requests end to end and capture exceptions.', ['observability-setup'], 'vs log-discipline'],
  ['Quick throwaway spike: does SSE work on the edge?', ['spike-research'], 'vs edge-runtime-constraints'],
  ['Summarize this long GitHub discussion thread.', ['summarize-thread'], 'core'],
  ['Should this route run on Node or edge? it uses fs.', ['edge-runtime-constraints'], 'core'],
  ['Make a sequence diagram of the auth flow.', ['diagram-author'], 'core'],
  ['Speed up the slow orders query.', ['query-optimization', 'index-strategy', 'n1-hunter'], 'triple-ambiguous'],
  ['Make sure this feature is truly done before launch.', ['rule-audit', 'security-pass', 'a11y-gate'], 'gate trio'],
  ['Rename the project concept to workspace everywhere.', ['refactor'], 'vs vertical-slice'],
  ['Write a changelog for the release.', ['changelog-from-commits'], 'vs release-notes'],
  ['Write user-facing release notes for v2.', ['release-notes'], 'vs changelog-from-commits'],
  ['Write tests for this tRPC procedure including the ownership check.', ['trpc-integration-test'], 'vs test-strategy'],
  ['What should I test for this feature and at which layer?', ['test-strategy'], 'vs vitest-unit'],
]

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['phrase', 'picked', 'confidence', 'runnerUp', 'reason'],
  properties: {
    phrase: { type: 'string' },
    picked: { type: 'string', description: 'the single skill slug to route this to' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    runnerUp: { type: 'string', description: 'next-best slug or "none"' },
    reason: { type: 'string' },
  },
}

function prompt(phrase) {
  return `You are a router. A user said: "${phrase}"

Read the skill catalog at ${CATALOG} (every skill + its "Use when:"/"Do NOT use for:" description).
Pick the SINGLE skill whose description best matches the user's intent, exactly as an assistant
deciding which skill to invoke. The phrase may be vague or span two skills — pick the best single
match and reflect uncertainty in confidence. Return picked (slug), confidence, runnerUp (slug or
"none"), and a one-line reason. Use ONLY the catalog and the phrase.`
}

log(`Trigger-fidelity: routing ${CASES.length} phrases (catalog: ${CATALOG})...`)

const results = await parallel(CASES.map(([phrase]) => () =>
  agent(prompt(phrase), { label: `route:${phrase.slice(0, 26)}`, phase: 'Route', schema: SCHEMA, agentType: 'general-purpose' })
))

const rows = results.map((r, i) => {
  const [phrase, acceptable, note] = CASES[i]
  const picked = r?.picked ?? '(none)'
  return { phrase, acceptable, picked, ok: acceptable.includes(picked), confidence: r?.confidence ?? '-', runnerUp: r?.runnerUp ?? '-', note, reason: r?.reason ?? '' }
})

const hits = rows.filter((r) => r.ok).length
const misroutes = rows.filter((r) => !r.ok)
log(`In acceptable set: ${hits}/${CASES.length}; misroutes: ${misroutes.length}`)

return {
  total: CASES.length,
  passed: `${hits}/${CASES.length}`,
  misroutes: misroutes.map((r) => ({ phrase: r.phrase, picked: r.picked, acceptable: r.acceptable, runnerUp: r.runnerUp, confidence: r.confidence, reason: r.reason })),
  lowConfidence: rows.filter((r) => r.confidence === 'low').map((r) => ({ phrase: r.phrase, picked: r.picked, ok: r.ok })),
  all: rows.map((r) => `${r.ok ? 'OK ' : 'XX '} "${r.phrase}" -> ${r.picked} [${r.acceptable.join('|')}] ${r.confidence} ru:${r.runnerUp}`),
}
