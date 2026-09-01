# Verification Receipt Integrity Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover the undelivered #1170/#1171 safeguards so cached verification receipts are invalidated by live Verification Commands changes and invalid Test markers are retired safely before replacement execution.

**Architecture:** Add one canonical argv-level Verification Commands projection to the existing receipt fingerprint and persist it on receipts. Thread live issue-body authority through every receipt-validating consumer, then add a narrow exact-identity retirement service used by Test before rerunning invalid evidence. Preserve current provider classifications, execution provenance, docs-only lane decisions, and lifecycle mutation boundaries.

**Tech Stack:** Node.js ESM, `node:test`, AITM issue-body mutation primitives, Git worktrees, GitHub CLI-backed read-back.

## Global Constraints

- Work only in `.worktrees/1481-receipt-integrity` on `codex/defect-1481-receipt-integrity`.
- Use TDD: capture a focused failing test before each production change.
- Derive expected VC authority from the live issue body; never copy the receipt's stored projection into its expected fingerprint.
- Treat a missing legacy projection as invalid and report `vc-set-mismatch`.
- Keep `aitm.verification-receipt/v1` structurally readable; readability is not authority.
- Preserve provider selection, `requiredClassifications`, command classification, execution context, docs-only lane skips, and existing SHA/environment validation.
- Retire only one validated stage/receipt-ID marker through `mutateIssueBody`; ambiguity and failed read-back stop execution.
- Do not create another chained defect or perform unrelated refactoring.

## File Map

- `scripts/task-tracker/lib/verification-receipt.mjs`: canonical VC projection, fingerprint/receipt persistence, live-authority validation helpers.
- `scripts/task-tracker/lib/verification-receipt-retirement.mjs`: pure exact-marker transform plus governed mutation/read-back service.
- `scripts/task-tracker/verbs/test.mjs`: live VC threading, invalid Test receipt retirement, and post-write race validation.
- `scripts/task-tracker/verbs/review.mjs`: Review validation against live VC authority.
- `scripts/task-tracker/verbs/close.mjs`: incorporated-close validation against live VC authority.
- `scripts/task-tracker/lib/docs-only-lane-skip-proof.mjs`: docs-only receipt proof against live VC authority.
- `scripts/task-tracker/lib/stamp-receipt-reuse.mjs`: stamp reuse validation against live VC authority.
- `scripts/task-tracker/lib/estimation/runtime-adapter.mjs`: exact-final-SHA evidence extraction against live VC authority.
- `scripts/task-tracker/lib/develop-exit-sandbox-proof-guard.mjs`: transition refusal when live Test receipt authority is stale.
- `scripts/tests/integration/task-tracker/lib/verification-receipt.test.mjs`: receipt/fingerprint canonicalization and drift regression coverage.
- `scripts/tests/unit/task-tracker/lib/test-verb-receipt-reuse.test.mjs`: Test reuse and fresh-base race coverage.
- `scripts/tests/unit/task-tracker/lib/verification-receipt-retirement.test.mjs`: retirement transform and verified-write coverage.
- `scripts/tests/unit/task-tracker/lib/test-verb-receipt-retirement.test.mjs`: Test integration and no-execution-on-failure coverage.
- `scripts/tests/unit/task-tracker/lib/develop-exit-sandbox-proof-guard.test.mjs`: stale live-authority transition coverage.
- Existing focused consumer tests listed in Task 2: compatibility and default-deny coverage.
- `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`: packaged production-module inventory.

---

### Task 1: Canonical VC Authority in Fingerprints and Receipts

**Files:**

- Modify: `scripts/task-tracker/lib/verification-receipt.mjs`
- Modify: `scripts/tests/integration/task-tracker/lib/verification-receipt.test.mjs`

**Interfaces:**

- Produces: `canonicalVerificationCommandSet(commands, { projectDir }) -> string[][]`
- Changes: `buildVerificationFingerprint({ projectDir, commitSha, configPaths, verificationCommands })`
- Changes: receipts created by `createVerificationReceipt(...)` carry `verificationCommands`
- Changes: `validateVerificationReceipt(...)` reports `vc-set-mismatch` when expected authority is absent or unequal
- Produces: `validateVerificationReceiptCommandAuthority({ body, expectedIssue, expectedStage, expectedCommitSha, projectDir })`

- [ ] **Step 1: Add failing canonicalization and validation tests**

Extend the fixture builder to supply live commands:

```js
const VERIFICATION_COMMANDS = [
  { command: ' npm   run lint ' },
  { command: 'node --test scripts/tests/unit/task-tracker/lib/markers.test.mjs' },
];

const fingerprint = buildVerificationFingerprint({
  projectDir,
  commitSha: SHA,
  verificationCommands: VERIFICATION_COMMANDS,
  configPaths: ['package.json', 'eslint.config.mjs', '.prettierrc.json', 'scripts/run-tests.mjs'],
});
```

Add tests asserting:

```js
assert.deepEqual(fingerprint.verificationCommands, [
  ['node', '--test', 'scripts/tests/unit/task-tracker/lib/markers.test.mjs'],
  ['npm', 'run', 'lint'],
]);
assert.deepEqual(receipt.verificationCommands, fingerprint.verificationCommands);
```

Add table cases that reorder lines or alter whitespace and remain valid, plus add/remove/change and legacy-without-field cases that contain `vc-set-mismatch`. Add a duplicate semantic command case that throws `duplicate Verification Command`. Extend the #1218 provider test to assert provider fields and VC projection coexist.

- [ ] **Step 2: Run the receipt integration test and capture RED**

Run:

```bash
node --test scripts/tests/integration/task-tracker/lib/verification-receipt.test.mjs
```

Expected: FAIL because `fingerprint.verificationCommands` and `receipt.verificationCommands` are absent and changed sets still validate.

- [ ] **Step 3: Implement the canonical projection**

Import the current command authority:

```js
import { COMPLETE_TEST_LANES, parseVerificationCommands } from './verification-commands.mjs';
import {
  isPolicyShapeVerificationRejection,
  validateVerificationCommand,
} from './verification-allowlist.mjs';
```

Add the shared canonicalization helper:

```js
export function canonicalVerificationCommandSet(commands = [], { projectDir } = {}) {
  if (!Array.isArray(commands)) {
    throw new TypeError('verification-receipt: Verification Commands must be an array');
  }
  const canonical = commands.map((entry) => {
    const command = typeof entry === 'string' ? entry : entry?.command;
    const validation = validateVerificationCommand(command, { projectDir });
    if (
      !validation.ok &&
      !(isPolicyShapeVerificationRejection(validation.reason) && Array.isArray(validation.argv))
    ) {
      throw new TypeError(
        `verification-receipt: invalid Verification Command (${validation.reason})`
      );
    }
    return validation.argv;
  });
  canonical.sort((left, right) =>
    canonicalRecordJson(left).localeCompare(canonicalRecordJson(right))
  );
  for (let index = 1; index < canonical.length; index += 1) {
    if (canonicalRecordJson(canonical[index - 1]) === canonicalRecordJson(canonical[index])) {
      throw new TypeError('verification-receipt: duplicate Verification Command');
    }
  }
  return canonical;
}
```

Add `verificationCommands = []` to `buildVerificationFingerprint`, canonicalize it with the real project identity, and return it beside `commitSha`. Copy it into new receipts:

```js
...(fingerprint?.verificationCommands !== undefined
  ? { verificationCommands: structuredClone(fingerprint.verificationCommands) }
  : {}),
```

Permit an absent field during structural parsing, but validate a present field as an array of non-empty string arrays. In `validateVerificationReceipt`, compare canonical JSON and append `reason('vc-set-mismatch', { actual: 'missing' })` for legacy absence or `reason('vc-set-mismatch')` for inequality.

Add `validateVerificationReceiptCommandAuthority` using `parseVerificationCommands(body)` and the shared canonicalization helper. It must validate receipt structure, optional expected SHA prefix, and live VC equality without trusting receipt data as the expected value.

- [ ] **Step 4: Run the focused receipt test and capture GREEN**

Run:

```bash
node --test scripts/tests/integration/task-tracker/lib/verification-receipt.test.mjs
```

Expected: PASS with canonicalization, legacy default-deny, semantic drift, cosmetic stability, and provider compatibility cases green.

- [ ] **Step 5: Commit Task 1**

```bash
git add scripts/task-tracker/lib/verification-receipt.mjs \
  scripts/tests/integration/task-tracker/lib/verification-receipt.test.mjs
git commit -m '[#1481] bind verification receipts to live command authority'
npx aitm commit-trace 1481
```

---

### Task 2: Thread Live VC Authority Through Current Consumers

**Files:**

- Modify: `scripts/task-tracker/verbs/test.mjs`
- Modify: `scripts/task-tracker/verbs/review.mjs`
- Modify: `scripts/task-tracker/verbs/close.mjs`
- Modify: `scripts/task-tracker/lib/docs-only-lane-skip-proof.mjs`
- Modify: `scripts/task-tracker/lib/stamp-receipt-reuse.mjs`
- Modify: `scripts/task-tracker/lib/estimation/runtime-adapter.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/test-verb-receipt-reuse.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/review-receipt-reuse.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/stamp-receipt-reuse.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/review-receipt-lane-skip.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/close-incorporated.test.mjs`

**Interfaces:**

- Consumes: `canonicalVerificationCommandSet`, `buildVerificationFingerprint`, and receipt validation from Task 1
- Produces: no new public API; every authority decision supplies a live expected VC projection

- [ ] **Step 1: Add failing Test-reuse regression**

Update test fingerprints to accept commands:

```js
function fingerprint(identity, verificationCommands = []) {
  return {
    commitSha: SHA,
    verificationCommands,
    environment: {/* retain existing fixture environment */},
  };
}
```

Create a valid Test receipt for the original parsed body, then add:

```js
body += '\n- [ ] `node --test scripts/tests/unit/task-tracker/lib/new-command.test.mjs`';
```

Assert `runVerbTest` does not return `already-verified`, creates the sandbox, and schedules the added argv. Also make existing valid-reuse and docs-only tests build expected fingerprints from the current body.

- [ ] **Step 2: Run the reuse test and capture RED**

```bash
node --test scripts/tests/unit/task-tracker/lib/test-verb-receipt-reuse.test.mjs
```

Expected: FAIL because Test still calls `buildFingerprint({ projectDir, commitSha })` without live commands.

- [ ] **Step 3: Thread VC input through Test**

At every Test fingerprint call, pass the already parsed `vcs`:

```js
const currentFingerprint = await buildFingerprint({
  projectDir,
  commitSha: sha,
  verificationCommands: vcs,
});
```

Apply the same argument in the detached sandbox and completed fingerprint calls. Ensure dependency-injected `buildFingerprint` test doubles accept and preserve `verificationCommands`.

- [ ] **Step 4: Add failing consumer authority cases**

In each existing consumer test, create a receipt from body A, validate against body B with an added command, and assert refusal. For incorporated close and estimation, explicitly assert the fallback expected fingerprint is derived from `parseVerificationCommands(body)`, not from `receipt.verificationCommands`.

- [ ] **Step 5: Implement live authority in each consumer**

Use this pattern where a real worktree fingerprint is available:

```js
const verificationCommands = parseVerificationCommands(body);
const fingerprint = await buildFingerprint({
  projectDir,
  commitSha,
  verificationCommands,
});
```

Use this pattern where the consumer validates a durable receipt without rebuilding environment hashes:

```js
const fingerprint = {
  commitSha: expectedSha,
  verificationCommands: canonicalVerificationCommandSet(parseVerificationCommands(body), {
    projectDir,
  }),
  environment: receipt.environment,
};
```

If the consumer has no project directory, pass the current repository root already available in its runtime context. If canonicalization throws, return the consumer's existing refusal form; do not fall back to receipt authority.

- [ ] **Step 6: Run focused consumer tests**

```bash
node --test \
  scripts/tests/unit/task-tracker/lib/test-verb-receipt-reuse.test.mjs \
  scripts/tests/unit/task-tracker/lib/review-receipt-reuse.test.mjs \
  scripts/tests/unit/task-tracker/lib/stamp-receipt-reuse.test.mjs \
  scripts/tests/unit/task-tracker/verbs/review-receipt-lane-skip.test.mjs \
  scripts/tests/unit/task-tracker/verbs/close-incorporated.test.mjs
```

Expected: PASS; valid exact-SHA/provider/docs-only reuse remains green and changed VC authority refuses.

- [ ] **Step 7: Commit Task 2**

```bash
git add scripts/task-tracker/verbs/test.mjs \
  scripts/task-tracker/verbs/review.mjs \
  scripts/task-tracker/verbs/close.mjs \
  scripts/task-tracker/lib/docs-only-lane-skip-proof.mjs \
  scripts/task-tracker/lib/stamp-receipt-reuse.mjs \
  scripts/task-tracker/lib/estimation/runtime-adapter.mjs \
  scripts/tests/unit/task-tracker/lib/test-verb-receipt-reuse.test.mjs \
  scripts/tests/unit/task-tracker/lib/review-receipt-reuse.test.mjs \
  scripts/tests/unit/task-tracker/lib/stamp-receipt-reuse.test.mjs \
  scripts/tests/unit/task-tracker/verbs/review-receipt-lane-skip.test.mjs \
  scripts/tests/unit/task-tracker/verbs/close-incorporated.test.mjs
git commit -m '[#1481] validate receipt consumers against live commands'
npx aitm commit-trace 1481
```

---

### Task 3: Exact-Identity Receipt Retirement Service

**Files:**

- Create: `scripts/task-tracker/lib/verification-receipt-retirement.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/verification-receipt-retirement.test.mjs`
- Modify: `scripts/task-tracker/lib/verification-receipt.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`

**Interfaces:**

- Produces: `parseValidatedVerificationReceiptClaims(body, { expectedIssue })`
- Produces: `hasClaimedVerificationReceiptMarker(body, stage)`
- Produces: `retireVerificationReceiptMarker(body, { expectedIssue, stage, receiptId })`
- Produces: `retireVerificationReceipt({ cfg, issueNumber, stage, receiptId, deps })`

- [ ] **Step 1: Add failing retirement tests**

Create fixtures by inserting two valid receipts with different stages. Test:

```js
const result = retireVerificationReceiptMarker(body, {
  expectedIssue: 1481,
  stage: 'test',
  receiptId: testReceipt.receiptId,
});
assert.equal(result.status, 'retired');
assert.equal(parseVerificationReceipt(result.body, 'test'), null);
assert.equal(parseVerificationReceipt(result.body, 'develop-final').receiptId, develop.receiptId);
```

Add idempotent absence, wrong issue, duplicate matching claim, malformed claim, missing identity, verified-write-still-contains-target, and fresh-read-back-still-contains-target cases.

- [ ] **Step 2: Run the new retirement test and capture RED**

```bash
node --test scripts/tests/unit/task-tracker/lib/verification-receipt-retirement.test.mjs
```

Expected: FAIL with module-not-found or missing exports.

- [ ] **Step 3: Add validated claim parsing**

In `verification-receipt.mjs`, export claim offsets without weakening structural validation:

```js
export function parseValidatedVerificationReceiptClaims(body, { expectedIssue } = {}) {
  const claims = [];
  for (const claimMatch of String(body || '').matchAll(RECEIPT_CLAIM_RE)) {
    // exact marker grammar, payload decode, and validateVerificationReceiptStructure
    claims.push({
      marker: claimMatch[0],
      start: claimMatch.index,
      end: claimMatch.index + claimMatch[0].length,
      receipt,
    });
  }
  return claims;
}
```

Make `parseValidatedVerificationReceipts` map this result and add `hasClaimedVerificationReceiptMarker` for malformed-claim detection.

- [ ] **Step 4: Implement the retirement module**

Implement the pure transform with exact stage/ID matching and then the live service:

```js
const write = await mutateIssueBody({
  issueNumber: Number(issueNumber),
  repo: cfg.repo,
  allowMarkerLoss: true,
  mutate: (freshBody) =>
    retireVerificationReceiptMarker(freshBody, {
      expectedIssue: Number(issueNumber),
      stage,
      receiptId,
    }).body,
});
```

Require `write.body`, verify the target is absent there, fetch the live body with bounded `gh issue view`, and verify absence again. Return `{ status, body: liveBody }`.

- [ ] **Step 5: Add the package-boundary assertion and run tests GREEN**

Add `scripts/task-tracker/lib/verification-receipt-retirement.mjs` to the production-module expectation used by the package-boundary test, then run:

```bash
node --test \
  scripts/tests/unit/task-tracker/lib/verification-receipt-retirement.test.mjs \
  scripts/tests/unit/task-tracker/core/package-boundary.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add scripts/task-tracker/lib/verification-receipt.mjs \
  scripts/task-tracker/lib/verification-receipt-retirement.mjs \
  scripts/tests/unit/task-tracker/lib/verification-receipt-retirement.test.mjs \
  scripts/tests/unit/task-tracker/core/package-boundary.test.mjs
git commit -m '[#1481] retire invalid receipt markers by exact identity'
npx aitm commit-trace 1481
```

---

### Task 4: Test Retirement Ordering and Transition Race Guards

**Files:**

- Modify: `scripts/task-tracker/verbs/test.mjs`
- Modify: `scripts/task-tracker/lib/develop-exit-sandbox-proof-guard.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/test-verb-receipt-retirement.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/test-verb-receipt-reuse.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/develop-exit-sandbox-proof-guard.test.mjs`

**Interfaces:**

- Consumes: retirement and live-authority APIs from Tasks 1 and 3
- Produces: Test result `receipt-retirement-failed` with structured reasons
- Produces: Develop-exit refusal `develop-to-test-receipt-<reason>`

- [ ] **Step 1: Add failing Test retirement-order tests**

Create an already-in-Test body with a valid old receipt, then change the VC set. Inject spies and assert:

```js
assert.deepEqual(events.slice(0, 2), ['retire', 'create-worktree']);
assert.equal(parseVerificationReceipt(body, 'test'), null);
```

Add cases where the claim is malformed or `retireVerificationReceipt` throws. Assert:

```js
assert.equal(result.status, 'receipt-retirement-failed');
assert.equal(worktrees, 0);
assert.equal(sandboxRuns, 0);
```

- [ ] **Step 2: Run the retirement integration test and capture RED**

```bash
node --test scripts/tests/unit/task-tracker/lib/test-verb-receipt-retirement.test.mjs
```

Expected: FAIL because Test does not call retirement.

- [ ] **Step 3: Integrate retirement before replacement execution**

Import `hasClaimedVerificationReceiptMarker` and `retireVerificationReceipt`. In the current-state-`test` reuse block:

```js
if (!existingValidation.ok && claimedTestReceipt) {
  if (typeof existingTestReceipt?.receiptId !== 'string') {
    return {
      status: 'receipt-retirement-failed',
      sha,
      reasons: [{ code: 'receipt-retirement-identity-unavailable' }],
    };
  }
  try {
    const retired = await retireReceipt({
      cfg,
      issueNumber: Number(issueNum),
      stage: 'test',
      receiptId: existingTestReceipt.receiptId,
    });
    body = retired.body;
  } catch (error) {
    return {
      status: 'receipt-retirement-failed',
      sha,
      reasons: [{ code: 'receipt-retirement-refused', message: String(error?.message || error) }],
    };
  }
}
```

Post the explicit refusal comment before either return. Ensure this block runs before setup retry, worktree creation, or command planning.

- [ ] **Step 4: Add and implement persisted-body race validation**

Make the evidence mutation result available, require `body` from the real mutation path, and validate:

```js
const persistedAuthority = validateVerificationReceiptCommandAuthority({
  body: evidenceWrite.body,
  expectedIssue: Number(issueNum),
  expectedStage: 'test',
  expectedCommitSha: sha,
  projectDir,
});
```

If invalid, post a comment and return `develop-evidence-invalid` before moving state. Add a test whose mutation result adds a new VC concurrently and assert no move occurs.

- [ ] **Step 5: Add and implement Develop-exit guard coverage**

Extend the guard fixture with a current Test receipt and root VC list. A matching set passes; a changed or legacy set refuses. Implement `runPresenceGate` so it retains the missing-DoD refusal, then calls `validateVerificationReceiptCommandAuthority` only when a Test receipt marker exists.

- [ ] **Step 6: Run Task 4 tests GREEN**

```bash
node --test \
  scripts/tests/unit/task-tracker/lib/test-verb-receipt-retirement.test.mjs \
  scripts/tests/unit/task-tracker/lib/test-verb-receipt-reuse.test.mjs \
  scripts/tests/unit/task-tracker/lib/develop-exit-sandbox-proof-guard.test.mjs
```

Expected: PASS with retirement-before-worktree, fail-closed refusal, race detection, and transition guard cases green.

- [ ] **Step 7: Commit Task 4**

```bash
git add scripts/task-tracker/verbs/test.mjs \
  scripts/task-tracker/lib/develop-exit-sandbox-proof-guard.mjs \
  scripts/tests/unit/task-tracker/lib/test-verb-receipt-retirement.test.mjs \
  scripts/tests/unit/task-tracker/lib/test-verb-receipt-reuse.test.mjs \
  scripts/tests/unit/task-tracker/lib/develop-exit-sandbox-proof-guard.test.mjs
git commit -m '[#1481] retire stale Test evidence before rerun'
npx aitm commit-trace 1481
```

---

### Task 5: Full Verification and Governed Handoff

**Files:**

- Modify only files required by formatting or test corrections within #1481 scope.

**Interfaces:**

- Consumes all prior tasks
- Produces exact-SHA verification evidence and `CODE_COMPLETE` handoff

- [ ] **Step 1: Run the root focused recovery command**

```bash
node --test \
  scripts/tests/integration/task-tracker/lib/verification-receipt.test.mjs \
  scripts/tests/unit/task-tracker/lib/test-verb-receipt-reuse.test.mjs \
  scripts/tests/unit/task-tracker/lib/verification-receipt-retirement.test.mjs \
  scripts/tests/unit/task-tracker/lib/test-verb-receipt-retirement.test.mjs \
  scripts/tests/unit/task-tracker/lib/develop-exit-sandbox-proof-guard.test.mjs
```

Expected: all test files pass with zero failures.

- [ ] **Step 2: Format and inspect the exact diff**

```bash
npx prettier --write \
  scripts/task-tracker/lib/verification-receipt.mjs \
  scripts/task-tracker/lib/verification-receipt-retirement.mjs \
  scripts/task-tracker/lib/develop-exit-sandbox-proof-guard.mjs \
  scripts/task-tracker/lib/docs-only-lane-skip-proof.mjs \
  scripts/task-tracker/lib/stamp-receipt-reuse.mjs \
  scripts/task-tracker/lib/estimation/runtime-adapter.mjs \
  scripts/task-tracker/verbs/test.mjs \
  scripts/task-tracker/verbs/review.mjs \
  scripts/task-tracker/verbs/close.mjs \
  scripts/tests/integration/task-tracker/lib/verification-receipt.test.mjs \
  scripts/tests/unit/task-tracker/lib/test-verb-receipt-reuse.test.mjs \
  scripts/tests/unit/task-tracker/lib/verification-receipt-retirement.test.mjs \
  scripts/tests/unit/task-tracker/lib/test-verb-receipt-retirement.test.mjs \
  scripts/tests/unit/task-tracker/lib/develop-exit-sandbox-proof-guard.test.mjs
git diff --check
git status --short
```

Expected: no whitespace errors and only #1481 files modified.

- [ ] **Step 3: Run repository quality gates**

```bash
npm run lint
npm run format:check
npm test
npm run test:slow
```

Expected: every command exits 0; fast lane reports all discovered fast files passed and slow lane reports all discovered slow files passed.

- [ ] **Step 4: Commit any scoped verification corrections**

If formatting or a scoped test correction changed files:

```bash
git add scripts/task-tracker/lib/verification-receipt.mjs \
  scripts/task-tracker/lib/verification-receipt-retirement.mjs \
  scripts/task-tracker/lib/develop-exit-sandbox-proof-guard.mjs \
  scripts/task-tracker/lib/docs-only-lane-skip-proof.mjs \
  scripts/task-tracker/lib/stamp-receipt-reuse.mjs \
  scripts/task-tracker/lib/estimation/runtime-adapter.mjs \
  scripts/task-tracker/verbs/test.mjs \
  scripts/task-tracker/verbs/review.mjs \
  scripts/task-tracker/verbs/close.mjs \
  scripts/tests/integration/task-tracker/lib/verification-receipt.test.mjs \
  scripts/tests/unit/task-tracker/lib/test-verb-receipt-reuse.test.mjs \
  scripts/tests/unit/task-tracker/lib/verification-receipt-retirement.test.mjs \
  scripts/tests/unit/task-tracker/lib/test-verb-receipt-retirement.test.mjs \
  scripts/tests/unit/task-tracker/lib/develop-exit-sandbox-proof-guard.test.mjs
git commit -m '[#1481] test: complete receipt integrity verification'
npx aitm commit-trace 1481
```

If the tree is already clean, do not create an empty commit.

- [ ] **Step 5: Run governed Test and stamp issue evidence**

Run the issue's focused AC verifier for each AC through `npx aitm ac-stamp`, then execute:

```bash
npx aitm test 1481
```

Expected: Develop finalization and Test sandbox pass at the exact branch HEAD, root VC and Functional DoD evidence are written, and #1481 reaches Test.

- [ ] **Step 6: Verify handoff state and report terminal agent status**

```bash
git status --short --branch
npx aitm board 1481
node node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs words-count
```

Expected: clean branch, board state Test, and final word marker captured. Report `CODE_COMPLETE` with duration and word delta. Do not run `/task review` or `/task close`; those are reserved for the orchestrator/human by the pickup directive.
