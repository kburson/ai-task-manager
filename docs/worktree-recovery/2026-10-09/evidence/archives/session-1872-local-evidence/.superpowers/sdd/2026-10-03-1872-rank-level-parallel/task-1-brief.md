## Task 1: Characterize strict rank policy with failing tests

Files:

- Create `scripts/tests/unit/task-tracker/lib/epic-rank-wave-policy.test.mjs`.
- Modify `scripts/tests/unit/task-tracker/lib/epic-r4p-orchestration.test.mjs` and `epic-children-gate-blocked.test.mjs` for public admission seams.
- Create `scripts/task-tracker/lib/epic-rank-wave-policy.mjs` only after the regression fails for the intended missing behavior.

Write table-driven cases for every lower board state, CLOSED/NOT_PLANNED, CLOSED with board Review, unknown disposition, pending recovery and missing observations. Prove strict COMPLETED+CLOSED+actual Done success separately. Exercise all target ranks in an opted-in epic, including a rank without a concurrency grant and lower Backlog/R4P. Preserve existing sequential fixtures verbatim and verify no authority retains current budget and ordering.

Implement the pure evaluator returning stable typed codes, blockers and remediation. Freeze graph IDs/ranks/sorted blocker IDs/validated refinement identity while excluding lifecycle progress. Reject duplicate children, partial membership, unreadable graph and changed refinement/dependency data. Tests assert behavior, not a mirror of internal branches.

Run the new unit file red, implement the smallest evaluator, then run it green and the existing focused vc:1 suite.

