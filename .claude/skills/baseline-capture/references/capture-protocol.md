Purpose: how to extract a skill's target task and run it clean-room so the captured failure is real, isolated, and reproducible.

# Extracting the target task

A baseline is only as good as the task you run. Pull it from the skill itself, not your imagination.

1. Read the `description` `Use when:` phrases — they are literal user utterances. One of them
   becomes the task prompt.
2. Read the first `## Examples` `**Input:**` — it is the canonical task the author had in mind.
3. Distill the **smallest concrete, stack-specific** task that should trigger the skill. Bad:
   "model some data." Good: "Add an `invoices` table and a tRPC `updateInvoice` mutation that
   lets a user change the amount."
4. The task must exercise the exact failure the skill claims. If `money-modeling` claims float
   defects, the task must involve a money field. If `multitenancy-scoping` claims ownership gaps,
   the task must touch a user-owned row.

# Running clean-room (the isolation contract)

The entire capture is invalid if the skill leaks into the context that produces the output.

- **Fresh context.** Use a new session or a spawned subagent that does NOT have the skill body,
  its references, or its `## Procedure` in context. The point is to observe the *base* model.
- **Realistic priming only.** Provide what a normal user of this stack would: the task, and the
  stack facts from `../../CLAUDE.md` that any project would carry (Next.js App Router, Drizzle,
  tRPC, Clerk, edge). Do NOT provide the skill's specific guidance — that is the variable under test.
- **No leading the witness.** Do not hint at the defect ("remember ownership checks!"). A prompt
  that names the rule contaminates the result as surely as loading the skill.
- **Same model, named.** Record which base model produced the output. Baselines perish across
  model upgrades; `perishable-refresh`-style re-baselining (see Edge Cases) needs the model id.

# The reproducibility record

Keep enough to re-run the capture later. Store alongside the transcript:

- Exact task prompt, verbatim.
- The stack facts supplied (or "standard CLAUDE.md spine").
- Model id and date of the run.
- Number of runs and how many exhibited the defect (for probabilistic failures, run 2–3 times).

# Capturing the output

- Save the model's output **verbatim and unedited**. Do not fix imports, do not summarize, do not
  charitably assume it "meant" the right thing. The literal defect is the artifact.
- Keep the excerpt short but real — enough lines to show the defect in context (the offending
  `real("price")` column, the query missing its `where eq(userId)` clause), not the whole file.
- If the output is correct, that is a valid and important result: the skill over-fits. Do not
  manufacture a defect to justify the skill.
