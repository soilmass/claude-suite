---
description: Pre-deploy checklist for the edge
argument-hint: ""
allowed-tools: Bash, Read, Grep, Glob
---

Run the pre-deploy checklist for the edge runtime. This is an orchestration — run every check
in order, and **run all of them even if one finds issues** so nothing is masked:

1. Invoke the `deploy-edge` skill — verify edge-runtime compatibility (no Node-only APIs, the
   edge-compatible DB driver and `clerkMiddleware` wired per `../../CLAUDE.md`).
2. Invoke the `migration-deploy-coordination` skill — confirm any pending Drizzle migration is
   expand-contract safe and ordered correctly against this deploy.
3. Run the `rollback-runbook` checks — confirm a tested rollback path and a working `down` for
   each migration in this release.

Collate into one go / no-go report with the blocking items called out first.
