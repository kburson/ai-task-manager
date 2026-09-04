# Recovery-Backed Partial Close Supersession Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow `--restart-stale-transaction` to supersede a partial delivered-close transaction that is immutably backed by a prior reopened-close recovery, then converge #1490 through one corrected estimation outcome and the ordinary close saga.

**Architecture:** Keep the ordinary stale and reopened authorizers unchanged. Add a separate pure recovery-backed stale authorizer, compose its result with the existing `aitm.delivered-close-supersession/v1` writer, and require the complete reopened-recovery plus stale-supersession chain before enabling estimation correction.

**Tech Stack:** Node.js ES modules, `node:test`, immutable GitHub comment records, AITM close convergence, GitHub CLI test adapters.

## Global Constraints

- Preserve the existing `aitm.reopened-close-recovery/v1` comment byte-for-byte.
- Reuse `--restart-stale-transaction`; do not add a flag or record schema.
- Retain the ordinary stale restart's ToDo/BLOCKED and pending-binding predicates.
- Retain the three-step maximum canonical prefix for stale restart.
- Require exact-SHA Test, human Review, PR, intent, receipt, and live trunk verification.
- Require an OPEN/REOPENED issue in Review, null disposition, clean recorded worktree, and the current session's own post-close binding.
- Refuse absent, ambiguous, malformed, contradictory, dirty, foreign, terminal, or same-SHA evidence before comment or body mutation.
- Permit estimation correction only from the complete immutable two-link chain.
- Preserve ordinary close, ordinary stale restart, ordinary reopened restart, generic marker protection, and existing outcome creation.

---

### Task 0: Align the Governed Acceptance Contract

**Files:**

- Create temporarily, then remove after use: `.tmp/gh/1490-recovery-backed-ac-operation-*.json`
- Update through the governed API: GitHub issue `#1490` acceptance criteria

**Interfaces:**

- Consumes: the fresh live issue body and its `aitm-body-version` marker.
- Produces: acceptance criteria that distinguish unchanged ordinary stale restart from the new recovery-backed composition.

- [ ] **Step 1: Re-read and prove the live acceptance-criteria precondition**

Run:

```bash
gh issue view 1490 --repo kburson/ai-task-manager --json body --jq .body
```

Confirm the existing criterion still says that `--restart-stale-transaction` is
unchanged. Record the current `aitm-body-version`; stop if the section has drifted
in any other way.

- [ ] **Step 2: Amend the contradictory criterion through `issue-body`**

Create a versioned `aitm.issue-body-operation/v1` `replace-exact` operation that
changes only the criterion prose, leaving its existing `aitm-verified` marker
byte-for-byte intact:

```text
The recovery is idempotent across a lost response, reusing the same replacement identity, and ordinary standalone `--restart-stale-transaction`, ordinary close, and generic issue-body marker protection are all unchanged.
```

Run:

```bash
node bin/aitm.mjs issue-body 1490 --operation-file .tmp/gh/1490-recovery-backed-ac-operation-1.json
```

- [ ] **Step 3: Add the recovery-backed acceptance criterion**

Re-read the fresh body/version, then use a second exact replacement operation to
insert this unchecked criterion immediately before `## Verification Commands`:

```text
- [ ] `--restart-stale-transaction` may supersede a partial recovery-backed replacement only when one immutable reopened-recovery record, one canonical prefix of at most three steps, fresh exact-SHA delivery and human-review authority, OPEN/REOPENED Review state, null disposition, a clean recorded worktree, and the current session's own post-close binding all agree; the complete recovery-to-supersession-to-current chain is required for exactly one corrected estimation outcome.
```

Run the governed operation, re-read the persisted section, and remove the two
temporary operation files with `apply_patch`. Do not use direct issue editing.

- [ ] **Step 4: Commit Task 0 trace evidence**

The issue mutation creates no repository delta. Run:

```bash
node bin/aitm.mjs commit-trace 1490
```

---

### Task 1: Pure Recovery-Backed Stale Authorization

**Files:**

- Modify: `scripts/task-tracker/lib/reopened-close-recovery.mjs:423-468,704-748`
- Test: `scripts/tests/unit/task-tracker/lib/reopened-close-recovery.test.mjs`

**Interfaces:**

- Consumes: `validateReopenedCloseRecoveryRecord(record)`, a delivered-close transaction, current accepted SHA, current review authority, and live state.
- Produces: `authorizeRecoveryBackedDeliveredCloseRestart(input)` returning the old/new transaction intent shape consumed by `ensureDeliveredCloseSupersession`.

- [ ] **Step 1: Add the live failure test before production code**

Add fixtures for the first recovery record and its partial replacement, then add this focused test:

```js
test('#1490: a recovery-backed timing-only replacement authorizes stale supersession', () => {
  const recoveryRecord = validRecoveryRecord();
  const activeTransaction = {
    schema: 'aitm.delivered-close/v1',
    transactionId: recoveryRecord.replacementTransactionId,
    issueNumber: ISSUE,
    acceptedSha: recoveryRecord.newAcceptedSha,
    reviewAuthority: recoveryRecord.newReviewAuthority,
    completedSteps: ['timing'],
  };

  const authorization = authorizeRecoveryBackedDeliveredCloseRestart({
    repository: REPO,
    issueNumber: ISSUE,
    recoveryRecord,
    activeTransaction,
    newAcceptedSha: NEWER_SHA,
    newReviewAuthority: 'human-gate',
    live: {
      boardState: 'review',
      issueClosed: false,
      stateReason: 'reopened',
      terminalDisposition: null,
      dirty: false,
      bindingOwnership: { authorized: true, disposition: 'own-post-close-claim' },
    },
  });

  assert.equal(authorization.oldTransaction.transactionId, activeTransaction.transactionId);
  assert.equal(authorization.newAcceptedSha, NEWER_SHA);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/reopened-close-recovery.test.mjs
```

Expected: FAIL because `authorizeRecoveryBackedDeliveredCloseRestart` is not exported.

- [ ] **Step 3: Add fail-closed negative tests**

Use table-driven copies of the valid input and assert `ReopenedCloseRecoveryError` for:

```js
const refusals = [
  ['missing backing', { recoveryRecord: null }, /recovery-backed-record/],
  [
    'foreign replacement id',
    { activeTransaction: { ...active, transactionId: 'foreign' } },
    /recovery-backed-transaction/,
  ],
  [
    'cross-sha replacement',
    { activeTransaction: { ...active, acceptedSha: OLD_SHA } },
    /recovery-backed-transaction/,
  ],
  ['same current sha', { newAcceptedSha: active.acceptedSha }, /fresh-authority/],
  [
    'four completed steps',
    { activeTransaction: { ...active, completedSteps: TERMINAL_CLOSE_STEPS.slice(0, 4) } },
    /terminal-prefix/,
  ],
  [
    'reordered prefix',
    { activeTransaction: { ...active, completedSteps: ['estimation', 'timing'] } },
    /terminal-prefix/,
  ],
  ['plain open issue', { live: { ...live, stateReason: null } }, /live-terminal-state/],
  ['dirty worktree', { live: { ...live, dirty: true } }, /live-terminal-state/],
  [
    'foreign binding',
    { live: { ...live, bindingOwnership: { authorized: false, disposition: 'foreign-claim' } } },
    /live-terminal-state/,
  ],
];
```

For every refusal, assert no persistence collaborator was called in the later wiring tests.

- [ ] **Step 4: Implement the minimal pure authorizer**

Add this exported function beside `authorizeReopenedCloseRestart`:

```js
export function authorizeRecoveryBackedDeliveredCloseRestart(input = {}) {
  const {
    repository,
    issueNumber,
    recoveryRecord,
    activeTransaction,
    newAcceptedSha,
    newReviewAuthority,
    live,
  } = input;
  if (
    !REPOSITORY_RE.test(repository || '') ||
    !Number.isSafeInteger(issueNumber) ||
    issueNumber <= 0
  ) {
    fail('input');
  }
  const backing = validateReopenedCloseRecoveryRecord(recoveryRecord);
  if (backing.issueNumber !== issueNumber || backing.repository !== repository) {
    fail('recovery-backed-record');
  }
  if (
    !hasExactKeys(activeTransaction, CLOSE_TRANSACTION_KEYS) ||
    activeTransaction.schema !== 'aitm.delivered-close/v1' ||
    activeTransaction.issueNumber !== issueNumber ||
    activeTransaction.transactionId !== backing.replacementTransactionId ||
    activeTransaction.acceptedSha !== backing.newAcceptedSha ||
    activeTransaction.reviewAuthority !== backing.newReviewAuthority
  ) {
    fail('recovery-backed-transaction');
  }
  const steps = activeTransaction.completedSteps;
  if (
    !Array.isArray(steps) ||
    steps.length > 3 ||
    !steps.every((step, index) => step === TERMINAL_CLOSE_STEPS[index])
  ) {
    fail('terminal-prefix');
  }
  if (
    !SHA_RE.test(newAcceptedSha || '') ||
    newAcceptedSha === activeTransaction.acceptedSha ||
    !REVIEW_AUTHORITIES.has(newReviewAuthority)
  ) {
    fail('fresh-authority');
  }
  if (
    !isPlainObject(live) ||
    live.boardState !== 'review' ||
    live.issueClosed !== false ||
    live.stateReason !== 'reopened' ||
    live.terminalDisposition !== null ||
    live.dirty !== false ||
    live.bindingOwnership?.authorized !== true ||
    live.bindingOwnership.disposition !== 'own-post-close-claim'
  ) {
    fail('live-terminal-state');
  }
  return deepFreeze({
    repository,
    issueNumber,
    oldTransaction: structuredClone(activeTransaction),
    newAcceptedSha,
    newReviewAuthority,
    reason: 'accepted-sha-corrective-amend',
    live: structuredClone(live),
  });
}
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/reopened-close-recovery.test.mjs
```

Expected: all tests PASS, including the live-shape and refusal matrix.

- [ ] **Step 6: Commit Task 1**

```bash
git add scripts/task-tracker/lib/reopened-close-recovery.mjs scripts/tests/unit/task-tracker/lib/reopened-close-recovery.test.mjs
git commit -m "[#1490] fix(close): authorize recovery-backed stale restart"
```

---

### Task 2: Compose the Stale Restart With Durable Recovery Evidence

**Files:**

- Modify: `scripts/task-tracker/verbs/close.mjs:81-98,1821-1824,2101-2242`
- Modify: `scripts/tests/helpers/close-convergence-wiring-helpers.mjs:80-320`
- Test: `scripts/tests/unit/task-tracker/verbs/close-convergence-wiring.test.mjs:350-530`

**Interfaces:**

- Consumes: `findRecoveryBackedReplacement`, `resolveReopenedBindingOwnership`, and `authorizeRecoveryBackedDeliveredCloseRestart` from Task 1.
- Produces: `reopenedCloseRecoveryRecord` and `deliveredCloseSupersessionRecord` retained through the close saga after the second immutable link is persisted.

- [ ] **Step 1: Extend the wiring harness without changing production behavior**

Add `reopenedRecoveryComments`, `bindingOwnership`, and `issueStateReason` inputs to `runClose`. Route the recovery comments through the same immutable comment inventory used by production and expose calls for recovery-list, supersession-create, body-mutate, and estimation-write ordering.

The default ordinary stale fixture must remain unchanged: no reopened recovery comments, ToDo label present, and `bindingReleaseStatus: 'pending'`.

- [ ] **Step 2: Add the live orchestration test**

Create a completed historical close, its immutable reopened recovery record, and the active `timing`-only replacement. Run:

```js
const run = await runClose({
  boardState: 'review',
  closeSnapshot: { issueClosed: false, stateReason: 'reopened' },
  body: bodyWith(recoveryBackedPartialTransaction()),
  restartStaleTransaction: true,
  acceptedSha: NEWER_SHA,
  liveLabels: [],
  terminalDisposition: null,
  bindingReleaseStatus: 'conflict',
  bindingOwnership: { authorized: true, disposition: 'own-post-close-claim' },
  reopenedRecoveryComments: [reopenedRecoveryComment()],
  gateReviewToDone: false,
  reviewAuthorization: { mode: 'human', standing: true, source: 'test-evidence' },
});

assert.equal(run.exitCode, 0);
assert.equal(run.calls.supersessionCommentCreates, 1);
assert.equal(run.calls.mutations, 1);
assert.equal(readDeliveredCloseTransactions(run.body)[0].acceptedSha, NEWER_SHA);
assert.equal(run.reopenedRecoveryComments[0].body, originalRecoveryCommentBody);
```

- [ ] **Step 3: Run the orchestration test and verify RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/verbs/close-convergence-wiring.test.mjs
```

Expected: FAIL with `delivered-close-supersession:live-terminal-state`; no supersession comment or body mutation occurs.

- [ ] **Step 4: Wire explicit recovery-backed selection**

Import Task 1's authorizer and add a retained second-link record:

```js
let reopenedCloseRecoveryRecord = null;
let deliveredCloseSupersessionRecord = null;
```

Inside the `--restart-stale-transaction` branch, after delivery authorization and immutable comment listing, classify the active transaction:

```js
const recoveryBacking = findRecoveryBackedReplacement({
  body: convergeBody,
  comments,
  repository: cfg.repo,
  issueNumber: Number(closeIssueNum),
});
if (recoveryBacking.status === 'ambiguous') {
  throw new Error('delivered-close-supersession:recovery-backing-ambiguous');
}

let authorization;
if (recoveryBacking.status === 'found') {
  const cwd = resolveWorkspaceForIssue({ issueRef: closeTarget, projectDir });
  const dirty = await inspectDirty({ cwd });
  const bindingOwnership = resolveReopenedBindingOwnership({
    projectDir,
    issue: closeTarget,
    sessionId: (ctx.sessionId ?? currentSessionId)(),
    recordedWorktreePath: cwd,
  });
  authorization = authorizeRecoveryBackedDeliveredCloseRestart({
    repository: cfg.repo,
    issueNumber: Number(closeIssueNum),
    recoveryRecord: recoveryBacking.record,
    activeTransaction,
    newAcceptedSha: resolvedDeliveryGate.gateInput.acceptedSha,
    newReviewAuthority: terminalReviewAuthority(),
    live: {
      boardState,
      issueClosed: closeSnapshot.issueClosed,
      stateReason: closeSnapshot.stateReason,
      terminalDisposition: terminalDisposition || null,
      dirty: dirty?.dirty ?? true,
      bindingOwnership,
    },
  });
  reopenedCloseRecoveryRecord = recoveryBacking.record;
} else {
  authorization = authorizeDeliveredCloseRestart({
    repository: cfg.repo,
    issueNumber: Number(closeIssueNum),
    oldTransaction,
    newAcceptedSha: resolvedDeliveryGate.gateInput.acceptedSha,
    newReviewAuthority: terminalReviewAuthority(),
    live: {
      boardState,
      issueClosed: closeSnapshot.issueClosed,
      terminalDisposition: terminalDisposition || null,
      labels,
      bindingStatus: binding?.status,
    },
  });
}
```

After `ensureDeliveredCloseSupersession`, retain the immutable record:

```js
deliveredCloseSupersessionRecord = evidence.record;
```

Do not catch an ordinary authorization error and silently retry another mode. Durable `findRecoveryBackedReplacement` classification chooses the mode before authorization.

- [ ] **Step 5: Add fail-closed orchestration cases**

Add cases proving zero comment/body/outcome mutation for:

- duplicate recovery comments naming the active replacement;
- a recovery record naming another transaction or SHA;
- a four-step or reordered active prefix;
- plain OPEN rather than OPEN/REOPENED;
- dirty worktree;
- foreign or stale post-close binding;
- stale or mismatched current Test, Review, PR, intent, receipt, or trunk evidence; and
- same current and active accepted SHA.

Retain every existing ordinary stale refusal assertion unchanged.

- [ ] **Step 6: Verify Task 2 GREEN**

Run:

```bash
node --test scripts/tests/unit/task-tracker/verbs/close-convergence-wiring.test.mjs scripts/tests/unit/task-tracker/lib/reopened-close-recovery.test.mjs
```

Expected: all tests PASS; ordinary stale restart still uses ToDo/BLOCKED plus pending binding.

- [ ] **Step 7: Commit Task 2**

```bash
git add scripts/task-tracker/verbs/close.mjs scripts/tests/helpers/close-convergence-wiring-helpers.mjs scripts/tests/unit/task-tracker/verbs/close-convergence-wiring.test.mjs
git commit -m "[#1490] fix(close): persist recovery-backed stale supersession"
```

---

### Task 3: Require the Two-Link Chain for Estimation Correction

**Files:**

- Modify: `scripts/task-tracker/verbs/close.mjs:1060-1070,3162-3172`
- Test: `scripts/tests/unit/task-tracker/verbs/close-reopened-recovery-wiring.test.mjs:270-311`
- Test: `scripts/tests/integration/task-tracker/lib/estimation/adaptive-estimation-close.integration.test.mjs:431-523`

**Interfaces:**

- Consumes: the reopened recovery record, delivered-close supersession record, and active replacement transaction retained by Task 2.
- Produces: `permitsReopenedOutcomeCorrection({ recoveryRecord, supersessionRecord, transaction })`, true only for a direct recovery-to-stale-to-current chain.

- [ ] **Step 1: Add the two-link permission test**

Extend the helper test with:

```js
assert.equal(
  permitsReopenedOutcomeCorrection({
    recoveryRecord,
    supersessionRecord,
    transaction: currentTransaction,
  }),
  true
);

for (const mismatch of [
  { recoveryRecord: { ...recoveryRecord, replacementTransactionId: 'foreign' } },
  { supersessionRecord: { ...supersessionRecord, oldAcceptedSha: OLD_SHA } },
  { supersessionRecord: { ...supersessionRecord, replacementTransactionId: 'foreign' } },
  { transaction: { ...currentTransaction, acceptedSha: OLD_SHA } },
]) {
  assert.equal(
    permitsReopenedOutcomeCorrection({
      recoveryRecord,
      supersessionRecord,
      transaction: currentTransaction,
      ...mismatch,
    }),
    false
  );
}
```

Keep the existing direct reopened-recovery case true when `supersessionRecord` is null.

- [ ] **Step 2: Run the permission test and verify RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/verbs/close-reopened-recovery-wiring.test.mjs
```

Expected: FAIL because the current predicate rejects the current transaction after the second link.

- [ ] **Step 3: Implement the exact direct-or-two-link predicate**

Replace the predicate with:

```js
export function permitsReopenedOutcomeCorrection({
  recoveryRecord,
  supersessionRecord = null,
  transaction,
} = {}) {
  const direct =
    recoveryRecord?.schema === 'aitm.reopened-close-recovery/v1' &&
    transaction?.schema === 'aitm.delivered-close/v1' &&
    recoveryRecord.issueNumber === transaction.issueNumber &&
    recoveryRecord.replacementTransactionId === transaction.transactionId &&
    recoveryRecord.newAcceptedSha === transaction.acceptedSha;
  if (direct) return true;

  return (
    recoveryRecord?.schema === 'aitm.reopened-close-recovery/v1' &&
    supersessionRecord?.schema === 'aitm.delivered-close-supersession/v1' &&
    transaction?.schema === 'aitm.delivered-close/v1' &&
    recoveryRecord.issueNumber === supersessionRecord.issueNumber &&
    supersessionRecord.issueNumber === transaction.issueNumber &&
    recoveryRecord.replacementTransactionId === supersessionRecord.oldTransactionId &&
    recoveryRecord.newAcceptedSha === supersessionRecord.oldAcceptedSha &&
    supersessionRecord.replacementTransactionId === transaction.transactionId &&
    supersessionRecord.newAcceptedSha === transaction.acceptedSha
  );
}
```

Pass `deliveredCloseSupersessionRecord` from the estimation call.

- [ ] **Step 4: Add an end-to-end estimation test**

In the adaptive estimation close integration test, seed:

- the historical active outcome;
- a valid reopened recovery record;
- a valid stale supersession record directly linked to it; and
- the current replacement transaction.

Run the estimation step and assert:

```js
assert.equal(result.status, 'written');
assert.equal(records.length, 2);
assert.equal(records[1].supersedes, records[0].recordId);
assert.deepEqual(
  activeRecords.map(({ recordId }) => recordId),
  [records[1].recordId]
);
assert.equal(secondRetry.status, 'existing');
assert.equal(recordsAfterRetry.length, 2);
```

Add a cross-link mismatch and assert `estimation-outcome:correction-predecessor` before any new record is written.

- [ ] **Step 5: Verify Task 3 GREEN**

Run:

```bash
node --test scripts/tests/unit/task-tracker/verbs/close-reopened-recovery-wiring.test.mjs scripts/tests/integration/task-tracker/lib/estimation/adaptive-estimation-close.integration.test.mjs
```

Expected: all tests PASS; direct recovery, two-link recovery, and retry are idempotent.

- [ ] **Step 6: Commit Task 3**

```bash
git add scripts/task-tracker/verbs/close.mjs scripts/tests/unit/task-tracker/verbs/close-reopened-recovery-wiring.test.mjs scripts/tests/integration/task-tracker/lib/estimation/adaptive-estimation-close.integration.test.mjs
git commit -m "[#1490] fix(close): carry outcome correction through supersession"
```

---

### Task 4: Full Verification, Issue Evidence, Review, and Delivery

**Files:**

- Modify only if generated characterization baselines require exact line updates: `scripts/tests/fixtures/state-engine-policy-baseline.mjs`
- Update governed issue evidence through `node bin/aitm.mjs`; do not hand-edit the issue body.

**Interfaces:**

- Consumes: Tasks 1-3 complete at one clean commit head.
- Produces: exact-SHA Test and Review receipts, a governed PR delivery receipt, one immutable stale supersession link, one corrected estimation outcome, and Done state.

- [ ] **Step 1: Run focused regression lanes**

```bash
node --test \
  scripts/tests/unit/task-tracker/lib/reopened-close-recovery.test.mjs \
  scripts/tests/unit/task-tracker/lib/delivered-close-supersession.test.mjs \
  scripts/tests/unit/task-tracker/verbs/close-convergence-wiring.test.mjs \
  scripts/tests/unit/task-tracker/verbs/close-reopened-recovery-wiring.test.mjs \
  scripts/tests/integration/task-tracker/lib/estimation/adaptive-estimation-close.integration.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 2: Run full repository verification**

```bash
npm run format:check
npm run lint
npm test
npm run test:slow
git diff --check
```

Expected: every command exits 0 with no new warnings or failures.

- [ ] **Step 3: Refresh commit and acceptance evidence**

```bash
node bin/aitm.mjs commit-trace 1490
node bin/aitm.mjs ac-stamp '<each exact Acceptance Criteria label>'
node bin/aitm.mjs ensureChecked '<each exact Acceptance Criteria label>'
node bin/aitm.mjs test 1490
```

Expected: the clean exact SHA moves Develop to Test.

- [ ] **Step 4: Obtain independent review and move to Review**

Request read-only review of the final diff, resolve every Critical or Important finding through a new Test cycle, then run:

```bash
node bin/aitm.mjs review 1490
```

Expected: Review state with a human approval prompt.

- [ ] **Step 5: After explicit human approval, deliver through the governed provider transaction**

```bash
node bin/aitm.mjs start 1490
node bin/aitm.mjs approve 1490 --human
git push origin codex/defect-1490-squash-delivery-proof
node bin/aitm.mjs deliver 1490
```

If and only if delivery emits one valid exit-20 provider-action envelope, invoke the sanctioned GitHub merge integration with its exact bytes once, then rerun `deliver` until it returns a live-verified receipt.

- [ ] **Step 6: Run the recovery-backed stale close**

```bash
node bin/aitm.mjs close 1490 --restart-stale-transaction
```

Expected: one immutable delivered-close supersession record links the partial recovery replacement to the current accepted SHA, one corrected estimation outcome supersedes the historical outcome, and the normal saga closes the issue in Done.

- [ ] **Step 7: Verify terminal state**

```bash
gh issue view 1490 --repo kburson/ai-task-manager --json state,stateReason,labels,projectItems
git fetch origin
git status --short
```

Expected: CLOSED/COMPLETED, project status Done, Delivered disposition evidence, exact delivery receipt on `origin/trunk`, and a clean retained worktree.
