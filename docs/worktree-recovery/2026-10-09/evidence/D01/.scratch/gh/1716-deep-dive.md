### Files examined and planned changes

- `scripts/task-tracker/verbs/plan-approve.mjs`: parse the explicit repair flag, gather current issue/comment evidence, enforce later-stage repair predicates, and write the automated marker through the existing fresh-base mutation path.
- `scripts/task-tracker/lib/plan-approval-audit.mjs`: render and recognize a canonical Full-Auto repair audit that names the durable evidence basis while remaining compatible with ordinary Full-Auto approval audits.
- `scripts/task-tracker/lib/workflow-policy/exception-record.mjs`: reuse the existing strict record resolver; no schema relaxation is planned.
- `scripts/task-tracker/lib/timing-ladder.mjs` and existing marker readers: reuse their lifecycle grammar rather than adding a second timing or marker parser.
- `scripts/task-tracker/verbs/help-data.mjs` and `scripts/task-tracker/lib/command-surface/catalog.mjs`: document the new explicit flag and its refusal boundary.
- `scripts/tests/unit/task-tracker/verbs/plan-approve.test.mjs`: cover evidence-derived success, refusal, retry, and byte preservation.
- `scripts/tests/unit/task-tracker/lib/plan-approval-audit.test.mjs`: cover the new canonical repair audit and legacy audit compatibility if the verb tests do not already exercise the complete matcher.

### Root-cause confirmation

The existing `plan-approve` runner permits a non-Plan repair only when an approval marker already exists and merely lacks an adaptive forecast binding. A missing marker always reaches the wrong-state refusal. Agent Review then classifies the missing marker as unknown and requires a Full-Auto audit, but the only canonical audit producer requires an approval timestamp. The resulting cycle has no sanctioned writer even though the revoked workflow-exception chain, Plan entry/completion history, and current planning evidence are durable.

### Implementation sequence

1. Add a single explicit `--repair-from-evidence` argument; ordinary `plan-approve` behavior remains unchanged.
2. For the repair flag, accept only Develop, Test, or Review with no existing approval marker and explicit Full-Auto authority.
3. Read all issue comments and strictly resolve the workflow-exception chain. Require a revoked head whose historical policy covered `approval.plan`; active, invalid, ambiguous, stale-scope, or unrelated records refuse.
4. Require a Plan entry marker, a Timing Log containing `plan:completed` followed by Develop entry, a deep-dive completion marker and section, non-empty flat Plan Metadata, and a concrete Planned Estimate comment. Refuse any surviving Plan-cancelled marker or Review-rejection history that targets planning rather than implementation.
5. Reuse the fresh-base body mutation to stamp `mode="full-auto"` at the repair timestamp without changing any Plan Adjustment bytes.
6. Post a canonical Full-Auto repair audit naming the revoked exception record and the evidence predicates. A retry after either write reconciles the marker and audit idempotently.
7. Document the flag and run the focused and repository-wide verification commands already declared on the issue.

### Test additions

- Focused verb tests will prove a complete evidence bundle succeeds and records Full-Auto rather than human provenance.
- Table-driven refusal tests will remove each required predicate in turn and cover active/invalid exceptions, non-Full-Auto invocation, cancellation, and unsupported states.
- Retry tests will simulate marker-write success followed by audit failure, then prove one audit and no duplicate marker.
- Preservation tests will compare a Plan Adjustment block before and after repair byte-for-byte.
- Existing normal Plan approval, adaptive-lineage repair, and required-comment tests remain unchanged and green.

The root acceptance criteria and verification-command lists remain authoritative; this narrative does not duplicate them.

### Risks and mitigations

- A broad later-stage approval path could launder an unplanned implementation. The explicit flag, revoked `approval.plan` waiver requirement, strict lifecycle sequence, and current planning-evidence checks keep the path narrow.
- A stale exception could be applied after scope drift. The existing workflow-exception resolver and current scope identity remain mandatory.
- A partial write could leave a marker without an audit. The repair is re-entrant and recomputes evidence before reconciling the missing audit.
- Tight coupling to comment prose could drift. Existing parsers and canonical audit builders remain the single sources of truth.

### Dependency map

Depends on: none.

Blocks: `kburson/ai-peer-review#61`, whose Agent Review cannot truthfully complete until automated Plan-approval provenance is reconstructable.
