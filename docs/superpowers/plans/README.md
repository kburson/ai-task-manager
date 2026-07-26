# Superpowers Plans

This directory contains executable implementation plans derived from approved
specs. Plans are written for agents that may have little local context: they
name files, interfaces, tests, verification commands, and commit boundaries.

Once a plan is referenced by a GitHub issue, PR, release note, or child issue,
treat it as an audit artifact:

- Do not delete it.
- Do not rewrite completed or dispatched task instructions in place.
- Prefer additive revision notes when execution discovers a necessary change.
- If the work is substantially replanned, create a new dated plan and link it
  from the old plan and the affected issues.

Issue bodies should reference both the plan path and a commit SHA that contains
the exact version used for decomposition. Child issues may point at a specific
task inside a plan, but the epic should pin the full plan and spec for historical
recovery.
