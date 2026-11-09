## Deep-Dive Analysis (2026-09-19)

The live Plan-to-Develop path confirms the defect. `planApprovedGuard` treats a current `approval.plan` workflow-policy decision with outcome `waived` as success. Both `promote.mjs` and the authoritative `move-state/guard-execution.mjs` keep that decision only in a transient `guardCtx`. `runGuardExecution` then returns only `{ exit: null }`, so `move-state-core.mjs` cannot carry the decision into the durable entry marker, sentinel, or `aitm.transition-commit/v1` comment. Later exception revocation therefore removes current eligibility while leaving no transition-bound record of the historical authorization.

### Files to edit

- Create `scripts/task-tracker/lib/plan-transition-authority.mjs` for the strict typed schema, resolver, parser, immutable GitHub comment writer/read-back, and completed-transition verifier.
- Modify `scripts/task-tracker/lib/move-state/guard-execution.mjs` to retain the exact Plan authority decision that made the guard pass.
- Modify `scripts/task-tracker/lib/move-state/move-state-core.mjs` to allocate the transition identity before guard execution and require durable Plan authority before the Plan-to-Develop board mutation.
- Modify `scripts/task-tracker/lib/move-state/transition-commit.mjs` only as needed to expose matching completed-transition evidence without weakening its existing schema or best-effort repair behavior.
- Modify `scripts/task-tracker/lib/plan-approval-evidence-repair.mjs` and `scripts/task-tracker/verbs/plan-approve.mjs` so modern transition authority can drive automatic Full-Auto convergence while legacy issues continue to use the #1716 reconstruction path.
- Create `scripts/tests/unit/task-tracker/lib/plan-transition-authority.test.mjs` for the #61 reproduction and the typed-record/transaction boundary.
- Extend `scripts/tests/unit/task-tracker/verbs/plan-approve.test.mjs` for automatic convergence and legacy repair compatibility.

### Implementation sequence

1. Add failing tests for strict `satisfied`, `waived`, and disabled-gate/non-approval outcomes; exact exception revision and scope binding; transition identity; malformed-record rejection; and matching-completion verification.
2. Implement the minimal pure authority resolver and canonical record codec.
3. Add a failing movement test proving a waived Plan exit cannot mutate board state until its authority record is created and read back, while an abandoned authority intent cannot prove a completed transition.
4. Thread one transition ID through guard evaluation, authority persistence, entry marker, sentinel, and transition commit. Fail closed before the board write when authority persistence or read-back fails.
5. Add the revoke-after-transition regression: current policy changes prospectively, while the matching historical record remains `waived` and verifiable.
6. Add failing plan-approval tests for modern automatic convergence and the unchanged #1716 legacy `--repair-from-evidence` route, then implement the narrow consumer change.
7. Run the focused tests, lint/format, standard suite, and slow suite; stamp each acceptance criterion and Functional DoD item only from reviewed command output.

### Test additions

- `scripts/tests/unit/task-tracker/lib/plan-transition-authority.test.mjs`: proves the exact #61 sequence, strict authority schema, pre-mutation persistence, retry/orphan behavior, and prospective revocation semantics.
- `scripts/tests/unit/task-tracker/verbs/plan-approve.test.mjs`: proves modern durable authority triggers machine-evidence convergence without a human approval claim and that legacy #1716 recovery remains compatible.

### Risks

- Creating the transition ID before guard execution can leave an unused ID after refusal; consumers must require matching completion evidence rather than treating an authority-intent record alone as proof.
- GitHub comment creation is non-transactional with the board write. The safe ordering is durable authority first and board mutation second; orphan records are acceptable only when they are explicitly non-completing.
- `analysisToDevelopment=false` must remain distinguishable from an approval. The implementation must not convert a disabled gate into `satisfied` or a human/Full-Auto approval marker.
- Existing transition-commit parsing and replay repair must remain backward compatible with v1 records.
- Automatic convergence must reuse the complete #1716 evidence predicates and remain fail-closed on scope drift or incomplete planning evidence.

### Sibling sub-issues

None. The schema, movement integration, and consumer convergence form one transactional invariant and should be reviewed together.

## Dependency Map

Depends on: #1716 (legacy evidence-repair behavior to preserve)

Blocks: none
