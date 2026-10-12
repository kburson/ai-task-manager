### Confirmed problem and bounded design

The delivery review for #1988 has one timing objection: its actor update at the start of Develop and the genuine stop at the end span more than the suspicious-gap threshold. The same native Codex session remained in progress. Read-only timestamp inspection found 573 real tool calls in that interval; its longest tool-only gap is 26.6 minutes. The native reasoning records within that gap occur less than a minute apart. No reasoning content was read or exposed in this inspection.

The existing recovery helper in scripts/task-tracker/lib/heal-timing-continuity.mjs already proves session identity, chronological ordering, an immutable completed transcript prefix and unbroken observation coverage before adding neutral checkpoints. Its endpoint check allows only update-to-update and refuses the actual update-to-stop as ambiguous-actor-window. Its coverage points include only actual tool calls, so accepting the endpoint alone would still reject timestamped model activity as an unexplained gap. The current Review validator is correct to require a supported repair; this work changes the repair producer, not the gate.

### Files, sequence and regression proof

Own the helper above and scripts/tests/unit/task-tracker/lib/heal-timing-continuity.test.mjs. First add a real helper/transport test ending in the existing recorded stop and watch its refusal. Add a native reasoning timestamp gap case with genuine periodic tool anchors and watch unexplained-transcript-gap. Permit the recorded stop endpoint, and build separate presence coverage from tool-call and native reasoning timestamps. Continue deriving every emitted checkpoint from an actual tool call ID and its original transcript line. Never use reasoning text as an identity or persist it in observations.

Keep original timing rows byte-identical, preserve Unknown active/idle values and all word markers, and assert before/after actor engagement is identical. Keep true user messages, task-complete, abort/end, non-monotonic records, missing presence, insufficient tool checkpoint anchors, duplicate identities and stale source/transcript hashes as refusals before writes. The existing focused command at root vc:1 is the behavioral proof. Run full exact-head fast/slow CI, lint and format as the normal workflow requires; no fabricated evidence or duration claims.

### Recovery and ownership

Use the real helper on #1988 only after a fresh dry-run provides original comment, source and immutable transcript-prefix hashes, then apply through its locked exact read-back protocol. This is a standalone prerequisite blocking #1988; no original #1908 child, accepted plan, specification or branch is rewritten. Dependency map: depends on none; blocks #1988 and therefore #1908 delivery. No parallel implementer is needed. The bounded human estimate remains 2h/S. All seven Story Intent checks pass: a concrete delivery owner needs truthful recovery to finish review, the public outcome and failure are specific, the existing flow is known, and the work is distinct from estimate-publication behavior.

### Story Intent

- **Beneficiary:** delivery owner
- **Capability:** recover truthful timing for continuous Codex work
- **Need:** the repair helper rejects genuine stop endpoints and overlooks timestamped model activity
- **Value or failure prevented:** I can finish review without invented pauses, durations or word counts

### Native environment metadata ruling

The real dry-run also found a user-role response_item whose native content_item_kinds is exclusively environments.environment_context. This is a machine environment update, not human input. Exempt only that exact nonempty metadata array from the user-role interruption check. Missing, unknown or mixed metadata and event_msg user_message remain interruptions. Do not infer this exemption from user text or count environment updates as presence.
