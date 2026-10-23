### Investigation and bounded design

Fresh independent GPT-6.1 Sol / medium review of 7b27ed149e48fd28c8da6e8a1544df52de10fea3..4069e3cbc06b7d89139c2ef3d7d4820132667d65 found a completed-component mismatch. timing-events.mjs scopes cursors by actorId; timing-stage.mjs preserves this contract and durably acknowledges the last new delivered cursor. timing-candidate.mjs incorrectly demands one globally matching event. An older independent actor event and current transition entry sharing an opaque cursor ingest successfully but cannot freeze.

Preserve the scalar wire contract and per-actor uniqueness validation. Require the acknowledged cursor to exist among retained events without inventing global uniqueness. Keep duplicate event identity conflict checks. No schema migration, new clock, transport, historical rewrite, coordinator or activation change is needed. DATE defect #2089 owns a separate transport repair.

Own only scripts/task-tracker/lib/story-cache/timing-candidate.mjs and the existing scripts/tests/unit/task-tracker/lib/story-cache/timing-candidate.test.mjs. First add a real durable ingestion-to-freezing regression: retain an older independent actor event, ingest the current transition pair with a shared cursor, verify acknowledgment and lossless events, then freeze. Observe ingestion-boundary failure before minimal correction. Add an absent-cursor refusal case with no mutation; retain existing altered-history and same-actor conflict coverage. Run the declared three-file verifier, full fast/slow suites and lint/format, then independent GPT-6.1 Sol / medium source review with complete report and rulings. Native Test stays serialized.

Original technical contract Task 5 in docs/superpowers/plans/2026-10-19-2039-local-estimation-transition-cache.md preserves native event/actor/transition IDs and separates durable ingestion from verified publication. Current active plan Task 15 delegates the frozen candidate boundary. This repair maintains those accepted interfaces; deferred consumers remain unfinished.

### Story Intent

- **Beneficiary:** maintainer publishing governed story transitions
- **Capability:** retain actor-scoped timing cursors when freezing a transition
- **Need:** independent actors may supply identical opaque source cursor strings
- **Value or failure prevented:** allow valid measured transitions without discarding historical events or fabricating a new event

All seven semantic questions pass against current Scope, Acceptance Criteria and source: real maintainer, concrete capability and need, evidenced prevented failure, distinct DATE sibling and standalone readability. No formal plan is linked for this standalone bounded repair; this deep dive supplies its intent authority.

### Local effort and preserved history

Agent-produced local allocation is S / 3 hours for reproduction, correction, verification and review repair. No completed cloud issue, comparable, backlog corpus or rubric supplied the estimate. Retain native optional-story/scope refusal, Backlog reconciliation, story authoring, original pending estimate journal, semantic-drift refusal, changed-rationale refusal, exact-original reconciliation, refinement and Start time refusals, and registered event-field repair. Preserve both refused document preparations: generic Python was classified WRITE_CODE; apply_patch target parsing rejected its payload. Neither ran. This document uses the native policy's explicit literal data-only Markdown artifact writer, without changing any guard or identity. Product verification is still pending and native Develop remains required.
