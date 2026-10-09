Invert rule-loading into script-querying. The skill currently loads prose rule files from `skill/shared/rules/` so the agent knows what a stage requires — but those rules describe machinery that already exists in code. The agent pays tokens to read a description of a gate the gate itself could report in one line.

This epic adds a read-only query API over the existing guard registry. No new state machinery, no change to what any gate enforces.

**In scope**

- A probe mode for `runGuards` that evaluates a transition's guards without performing it and returns every refusal rather than short-circuiting.
- A `remediation` field on the Guard contract: the command that clears the refusal. Designed against Epic D's verdict schema so the two do not diverge, then populated for the blocking exit guards first.
- `aitm next --explain` — current state, unmet exit gates, remediation commands. Terse, stable, machine-readable.
- `aitm close --explain` and `review --explain` over `close-gates`.
- Slimming `rules/state-walk.md` to a pointer at the query command, with the measured token delta as the acceptance evidence.

**Out of scope**

- Changing which gates run or what they enforce.
- The `aitm.yml` pipeline configuration (Epic C) and the external gate plugin API (Epic D). This epic ships against today's hardcoded eight-stage pipeline and stays correct when that becomes configurable.

**Sequencing**

Independent of Epics B, C, and D; intended to ship first. The one coupling is that the `remediation` field must be shaped against Epic D's gate verdict schema rather than retrofitted to it later.

Design: `docs/superpowers/specs/2026-09-08-aitm-yml-pipeline-engine-design.md` (Epic A section).
