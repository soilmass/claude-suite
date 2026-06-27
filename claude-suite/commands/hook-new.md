---
description: Author a new hook
argument-hint: "[guard]"
---

Invoke the `hook-create` skill to author a new hook for: $ARGUMENTS

Let the skill choose the event, scaffold `hooks/<name>.mjs`, wire it in `settings.json`, and
document it in `hooks/README.md` per the house style. Honor the hook discipline in
`../../CLAUDE.md` — do not hand-write the script outside the skill's procedure.
