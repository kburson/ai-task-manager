### Task 1: Qualify the retained repairs through the missing checkpoint entrypoint

#### Story Intent

- **Beneficiary:** delivery owner
- **Capability:** execute the UTC, actor, linked-source and schema qualification contract on the retained repair HEAD
- **Need:** the missing checkpoint file lets the declared command run only schema coverage
- **Value or failure prevented:** a zero exit cannot silently claim behaviors that never executed

**Files:**

- Create: scripts/tests/integration/task-tracker/lib/criteria-revision-ci-checkpoint-repair.test.mjs
- Reuse: scripts/tests/integration/task-tracker/lib/native-actor-candidate-capture.test.mjs
- Reuse: scripts/tests/integration/task-tracker/lib/native-stage-phase-11-prefix-after-intent-write.test.mjs
- Reuse: scripts/tests/integration/task-tracker/lib/native-linked-plan-source.test.mjs
- Reuse: scripts/tests/integration/task-tracker/lib/native-linked-plan-source-transaction.test.mjs
- Preserve: scripts/tests/unit/task-tracker/lib/criteria-revision/schema.test.mjs
- Inspect; change only if an owned regression requires it: scripts/task-tracker/lib/move-state/audit-timing.mjs, scripts/task-tracker/lib/criteria-revision/schema.mjs, scripts/task-tracker/lib/criteria-revision/records.mjs

**Interfaces:** Consume original Node test entrypoints and retained source. Produce a focused verification entrypoint with real UTC and Chicago phase behavior, raw-zero/actor refusal and complete linked-source behavior. It must not become another production adapter or construct mutation authority.

- [ ] **Step 1: Record the unfulfilled verification contract.** Run the live VC and verify the checkpoint file's absence. Expected: file presence check fails; VC currently executes only 19 schema tests. Record that the existing production corrections already pass owned local cases; do not delete or rewrite them to manufacture a red test.
- [ ] **Step 2: Add the focused entrypoint.** Run the complete native actor capture file under UTC, the original phase-11 case under America/Chicago, and complete basic/transaction linked-source files in isolated subprocesses. Assert actual subprocess success and nonzero complete-case counts. Use unchanged budgets and original fixtures. The source mutation this catches is returning to signed-negative-zero production, weakening raw-zero refusal, or breaking current/source/restart validation.
- [ ] **Step 3: Run the declared focused VC.** Expected: the checkpoint behaviors actually execute and the 19 schema cases pass. Any failure receives source-backed diagnosis inside the owned three production surfaces before claiming repair.
- [ ] **Step 4: Qualify exact child HEAD on Linux and run ordinary required checks.** Preserve actual failures and ownership; do not mark aggregate CI green from focused success. The same source cases must pass their unchanged budget on actual CI Node/Linux.
- [ ] **Step 5: Commit and review.** Commit with #1919 attribution, retain current-HEAD evidence, request a fresh branch review, and report CODE_COMPLETE only when its declared completion obligations actually hold.

**Verification Commands:**

Run: `node --test scripts/tests/integration/task-tracker/lib/criteria-revision-ci-checkpoint-repair.test.mjs scripts/tests/unit/task-tracker/lib/criteria-revision/schema.test.mjs`

Expected: checkpoint cases plus all 19 schema cases pass; no empty selected profile.

Run: `npm test`

Run: `npm run test:slow`

Run: `npm run lint`

Run: `npm run format:check`

Run: `git log --oneline -1`

Expected: actual declared checks pass on the accepted HEAD, or concrete inherited failures remain explicitly reported and unclaimed. Configured exact-head CI receipts can cover declared full-suite commands only through the repository's legitimate verification-provider contract.
