---
name: feedback_never_verb_help_new
description: RETIRED 2026-06-25 — defect fixed in #547; `/task new help` now prints the help menu, no junk issue.
metadata:
  node_type: memory
  type: feedback
  originSessionId: f943af41-0a7c-4eac-9117-b35177da7860
---

RETIRED 2026-06-25 (removed from MEMORY.md index). The defect this rule papered
over is fixed: #547 added the verb-local `isHelpProbe` guard in
`scripts/task-tracker/verbs/new.mjs`, so a single-token `/task new help` (also
`?`, `--help`, `--?`, `-h`, case-insensitive) now prints the `new` verb help and
creates no issue / clobbers no bind. No behavioral workaround needed.

Bind is still `/task <N>` (alias `/task start <N>`, rebind `/task resume [<N>]`).
Related: [[feedback_task_bind_mandatory]].
