# Cycle-scoped close and binding-generation implementation plan

> **For agentic workers:** Execute serially in the recorded #1499 worktree. No subagents.

**Goal:** Fulfil #1499, Task 4 of epic #1495, without enrolling or mutating any production v2 issue.

**Architecture:** Extend the strict v2 journal with explicit lifecycle-cycle and close records. A pure planner selects exactly one next effect; a runner applies, reads back, and checkpoints that effect using stable cycle-scoped keys. New occupancy claims receive a stable random generation, and cleanup compares the complete expected generation under lock. The public close verb delegates only when strict v2 protocol selection succeeds; v1 remains unchanged.

**Tech stack:** Node 22+, ESM, built-in crypto/fs, existing evidence-v2 journal, synthetic provider, occupancy store, and linked-worktree session state.

## Constraints

Use the recorded #1499 worktree and the accepted #1498 foundation. Preserve all #1490/#1488/#1485/#1226 records, refs, bindings, and worktrees. No production enrollment, recovery, close, delivery, or cleanup. Preserve legacy v1 close and timestamp cleanup behavior. Treat unknown or ambiguous effect outcomes as reconciliation requirements.

### Task 1: Cycle and close record contracts

- [ ] Add strict close record shapes, cycle projection, and governed successor-cycle planning.
- [ ] Preserve completed history and refuse forks, cross-cycle references, and conflicting operations.

### Task 2: Pure close machine and runner

- [ ] Plan one deterministic next effect with stable cycle-scoped keys.
- [ ] Apply, read back, and checkpoint one effect; reconcile every lost-response boundary.

### Task 3: Binding generations

- [ ] Mint a UUID on new claim and preserve it through heartbeat/pause.
- [ ] Compare the complete expected generation under lock; preserve newer and foreign claims.

### Task 4: Public close and regression proof

- [ ] Delegate strict v2 contexts before legacy phase guards and keep unenrolled v1 behavior.
- [ ] Run the crash matrix, legacy close/binding regressions, and governed Test/Review/Done workflow.

Each checkbox is updated only after its observed evidence succeeds.
