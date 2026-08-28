# Governed Delivery Convergence Implementation Plan

<!-- cspell:ignore NDEKTSV RRFFQ preflight idempotence idempotently -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converge the #939 delivery/close incident in #1381 by resolving every
delivery from its immutable accepted SHA, recovering authorized historical
receipts, closing historical deliveries idempotently, and truthfully disposing
of cumulatively retained fixes through an approved `Incorporated` lane.

**Architecture:** Introduce one pure accepted-delivery authority resolver shared
by `deliver` and `close`, while keeping current-head provider mutation and
historical read-only recovery as separate modes. Add canonical incident-ledger,
approval, and issue-local Incorporated records on the existing GitHub-record
envelope, then require the approved ledger before any Incorporated terminal
effect. A deterministic integration harness composes delivery A, branch advance,
delivery B, historical close A, and a no-effect retry through injected provider,
GitHub, Git, project, timing, and binding boundaries.

**Tech Stack:** Node.js 22 ESM, `node:test`, GitHub REST/GraphQL adapters, Git,
AITM canonical GitHub-record envelopes, GitHub Projects v2, Markdown task skills.

## Source Authority

- Normative specification:
  `docs/superpowers/specs/2026-08-23-1381-governed-delivery-convergence-design.md`
  at `bc079275f96e1c01e78b41127809c00e349c2426`.
- Normative blocker-first amendment:
  `docs/superpowers/specs/2026-08-28-1381-blocker-first-convergence-amendment-design.md`
  at `4ae49430cf3a5a58f13a05c81e8cb2e26a72b356`. The amendment takes precedence
  for hierarchy, #1403 disposition, live-ledger execution timing, and terminal
  ordering.
- Accepted co-review evidence:
  `docs/superpowers/reviews/1381/spec/README.md` at
  `bb94111ce582a224a42ccaf0500e59138df71a6a`.
- Specification/review branch:
  `codex/1381-governed-delivery-convergence-spec`.
- Governed implementation branch:
  `codex/1381-governed-delivery-convergence-spec`. #1381 is an independent
  convergence defect; do not move its implementation onto the reused #939
  incident branch.
- The accepted specification remains normative. This plan chooses file names,
  interfaces, task boundaries, and test surfaces without changing its policy.

## Global Constraints

- Issue #1381 is the sole convergence and end-to-end acceptance story; do not
  create successor defects for another delivery or close guard discovered here.
- Do not implement from this plan until its own Codex/Claude co-review is
  accepted and #1381 is hydrated through the governed issue-body mutation path.
- Keep #1403 blocked by #1381 until #1381 reaches Done. #1403 then closes as
  Incorporated through the approved incident ledger; never fabricate a delivery
  receipt for PR #1404.
- Keep #1381 independent of #939. Preserve the related-issue and incident-ledger
  links, but do not restore the native sub-issue edge that created the sibling
  WIP cycle with active #1380.
- Never invoke, wrap, disguise, or fall back to `gh pr merge`.
- Only a current-head delivery may create an intent or emit a sanctioned
  expected-head provider action.
- Historical recovery is read-only with respect to the provider and may append
  only a receipt supported by an existing live intent, exact merged PR, accepted
  lifecycle evidence, standing approval, and fresh trunk verification.
- The accepted Test/Review SHA is immutable issue authority. A valid, clean
  local HEAD is an observation and may be later.
- Select exactly one PR by `headRefOid === acceptedSha`; never select by recency,
  array order, singleton branch history, or current local HEAD.
- Preserve version 1 delivery intents and receipts byte-for-byte and keep their
  strict parsers unchanged.
- Normalize GitHub timestamps only at adapter boundaries. Core canonical-instant
  parsers remain strict.
- `Incorporated` means retained on trunk without complete issue-local governed
  delivery evidence. It never satisfies a delivery receipt gate.
- Ledger, ledger-approval, and Incorporated records are append-only, canonical,
  exact-keyed, bounded, and read back after write.
- Approval of the specification or implementation does not approve a live
  incident ledger. Ledger approval is a separate authenticated human action over
  one exact canonical digest.
- Run every authorization gate before timing, estimation, lifecycle checkbox,
  Done, disposition, GitHub close, label, or binding mutation.
- A fully converged retry performs no provider, record, timing, estimation,
  lifecycle, project, GitHub, label, or binding write.
- Use test-driven development and commit each task independently with `[#1381]`
  attribution.

## Pre-implementation Governance Gate

- [ ] Confirm PR #1404 still points to
      `ec160af0b03df8453fa0a1ad7f91b7138aeda38d`, merged as
      `19c6f54b0354699b988c470a99f122edab3aa2ba`, and has no valid governed intent
      or receipt. Confirm all three #1403 blocker carriers name #1381.
- [ ] Verify the native #939 -> #1381 sub-issue edge is absent from both parent
      and child GraphQL views, while #1381's issue body retains related incident
      provenance.
- [ ] Complete and archive focused review of this blocker-first amendment and
      the amended terminal sequence on the specification/review branch.
- [ ] Re-read the live #1381 body and prepare
      `.tmp/gh/1381-body-operation.json` as an
      `aitm.issue-body-operation/v1` fresh-base operation. The operation must
      explicitly replace the root `## Scope`, `## Acceptance Criteria`,
      `## Story Origin`, `## Verification Commands`, and related verification
      mappings rather than merely appending plan metadata. The replacement must:
      widen the summary to the full converged set; replace `npm run lint:docs`
      with `npm run lint:md`; include the accepted specification, blocker-first
      amendment, and amended plan commit references; remove the `parent: #939`
      claim and every native-child semantic; replace the obsolete PR #1404
      baseline; classify #1403 as Incorporated; preserve all AITM markers; and
      retain the no-successor-defect rule.
- [ ] Make the hydrated root contract state the two-phase acceptance boundary
      without ambiguity: #1381 records and receives exact human approval for the
      immutable ledger, passes `--phase pre-close` verification, delivers, and
      closes independently; only then may the orchestrator execute
      #1403 -> #1388 and finish #939. Downstream rows are approved intended
      outcomes at #1381 close, not falsely completed outcomes. Remove every live
      checkbox or sentence that requires all downstream terminal mutations to
      execute before #1381 closes or requires #1403 to finish through PR #1404
      as an independently Delivered issue.
- [ ] Apply the hydrated body only through:

  ```bash
  npx aitm issue-body 1381 --operation-file .tmp/gh/1381-body-operation.json
  ```

  Expected: output reports `issue-body: updated` with an integer body version,
  or an idempotent verified no-op.

- [ ] Walk #1381 through the sanctioned one-step lifecycle using the
      human-approved refinement fields, `/task plan`, and `/task plan-approve`.
      Do not call `move-state.mjs` directly and do not enter Develop before the
      approved-plan marker is durable.

- [ ] Show exact ancestry, patch, file-content, local/remote-ref, and clean-tree
      evidence before implementation. Continue on
      `codex/1381-governed-delivery-convergence-spec`; preserve the reviewed
      design and plan commits as immutable history on that branch.

---

### Task 1: Shared immutable accepted-delivery authority

**Files:**

- Create: `scripts/task-tracker/lib/delivery-authority.mjs`
- Modify: `scripts/task-tracker/lib/delivery-preflight.mjs`
- Modify: `scripts/task-tracker/lib/close-delivery-receipt.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/delivery-authority.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/deliver-pr-selection.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/close-delivery-receipt.test.mjs`

**Interfaces:**

- Moves `resolveAcceptedDeliveryHead(input)` from the close-specific module into
  `delivery-authority.mjs` without weakening its validation.
- Produces `resolveAcceptedDeliveryAuthority(input)` returning a deeply frozen
  `{ issueNumber, acceptedSha, observedLocalHeadSha, headRelation, pullRequest }`.
- `headRelation` is exactly `'current'` when local and accepted SHAs match and
  `'advanced'` when the well-formed local observation is later.
- `delivery-preflight.mjs` consumes the resolver result instead of deriving PR
  identity from the caller's selected array.
- `requireDeliveryReceipt` consumes the same resolved authority and continues to
  validate issue, branch, base, merged state, merge SHA, intent, and receipt.

- [ ] **Step 1: Write the failing pure authority tests**

  Add table-driven tests with this exact success shape:

  ```js
  const authority = resolveAcceptedDeliveryAuthority({
    issueNumber: 1397,
    branch: 'codex/939-full-auto-merge',
    localHeadSha: 'b'.repeat(40),
    testReceiptSha: 'a'.repeat(40),
    reviewReceiptSha: 'a'.repeat(40),
    agentReviewPassed: true,
    pullRequests: [
      {
        number: 1398,
        state: 'MERGED',
        headRefName: 'codex/939-full-auto-merge',
        headRefOid: 'a'.repeat(40),
        baseRefName: 'trunk',
        mergeCommitSha: 'c'.repeat(40),
      },
      {
        number: 1402,
        state: 'MERGED',
        headRefName: 'codex/939-full-auto-merge',
        headRefOid: 'b'.repeat(40),
        baseRefName: 'trunk',
        mergeCommitSha: 'd'.repeat(40),
      },
    ],
  });

  assert.equal(authority.acceptedSha, 'a'.repeat(40));
  assert.equal(authority.observedLocalHeadSha, 'b'.repeat(40));
  assert.equal(authority.headRelation, 'advanced');
  assert.equal(authority.pullRequest.number, 1398);
  assert.ok(Object.isFrozen(authority));
  ```

  Refuse malformed local/Test/Review SHAs, missing Agent Review, divergent
  Test/Review SHAs, zero exact-head PRs, duplicate exact-head PRs, wrong branch,
  wrong base, malformed PR number, and both PR array orders.

- [ ] **Step 2: Run the test and verify the red failure**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/delivery-authority.test.mjs
  ```

  Expected: FAIL because `delivery-authority.mjs` does not exist.

- [ ] **Step 3: Implement the pure resolver**

  Use this public contract and stable error prefix:

  ```js
  export class DeliveryAuthorityError extends TypeError {
    constructor(category) {
      super(`delivery-authority:${category}`);
      this.name = 'DeliveryAuthorityError';
      this.category = category;
    }
  }

  export function resolveAcceptedDeliveryAuthority({
    issueNumber,
    branch,
    localHeadSha,
    testReceiptSha,
    reviewReceiptSha = null,
    agentReviewPassed,
    pullRequests,
  } = {}) {
    const acceptedSha = resolveAcceptedDeliveryHead({
      localHeadSha,
      testReceiptSha,
      reviewReceiptSha,
      agentReviewPassed,
    });
    const exact = pullRequests.filter((pullRequest) => pullRequest?.headRefOid === acceptedSha);
    if (exact.length !== 1) throw new DeliveryAuthorityError('ambiguous-pr');
    const pullRequest = exact[0];
    if (pullRequest.headRefName !== branch) {
      throw new DeliveryAuthorityError('branch-mismatch');
    }
    return deepFreeze({
      issueNumber,
      acceptedSha,
      observedLocalHeadSha: localHeadSha,
      headRelation: localHeadSha === acceptedSha ? 'current' : 'advanced',
      pullRequest: { ...pullRequest },
    });
  }
  ```

  Keep all validation inside the module; the excerpt fixes the interface and
  selection order, while the tests fix the complete refusal set.

- [ ] **Step 4: Replace duplicated selection logic**

  Route both delivery preflight and the close receipt gate through
  `resolveAcceptedDeliveryAuthority`. Remove the delivery singleton fallback
  that accepts one branch PR when no exact local-head PR exists. Preserve
  child-to-epic and authorized local-trunk-lane skips before top-level PR
  resolution.

- [ ] **Step 5: Run Task 1 tests**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/delivery-authority.test.mjs scripts/tests/unit/task-tracker/verbs/deliver-pr-selection.test.mjs scripts/tests/unit/task-tracker/verbs/close-delivery-receipt.test.mjs
  ```

  Expected: PASS with exact-head selection independent of array order and local
  HEAD advancement.

- [ ] **Step 6: Commit Task 1**

  ```bash
  git add scripts/task-tracker/lib/delivery-authority.mjs scripts/task-tracker/lib/delivery-preflight.mjs scripts/task-tracker/lib/close-delivery-receipt.mjs scripts/tests/unit/task-tracker/lib/delivery-authority.test.mjs scripts/tests/unit/task-tracker/verbs/deliver-pr-selection.test.mjs scripts/tests/unit/task-tracker/verbs/close-delivery-receipt.test.mjs
  git commit -m "[#1381] Resolve delivery authority by accepted SHA"
  ```

### Task 2: Historical pending-intent receipt recovery

**Files:**

- Modify: `scripts/task-tracker/lib/delivery-preflight.mjs`
- Modify: `scripts/task-tracker/verbs/deliver.mjs`
- Modify: `scripts/task-tracker/lib/delivery-verification.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/deliver.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/deliver-pr-selection.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/delivery-real-pr-evidence.test.mjs`

**Interfaces:**

- Produces `validateHistoricalRecoveryPreflight(input)` returning frozen
  `{ issue, pr, acceptedSha, observedLocalHeadSha, headRelation, intent }`.
- Extends `runDeliver` results with
  `mode: 'current-head'|'historical-recovery'` while preserving existing
  `status`, `intent`, `receipt`, `action`, `recovery`, and
  `branchDisposition` fields.
- Historical recovery always returns `action: null` and never calls
  `buildProviderAction`.

- [ ] **Step 1: Write the failing historical recovery scenario**

  Seed an issue accepted at SHA A with a valid pending intent for PR A, make PR A
  merged and reachable, then advance the injected branch/local HEAD to SHA B.
  Assert:

  ```js
  const first = await runDeliver({ issueNumber: 1389, cfg, state, deps });
  assert.equal(first.mode, 'historical-recovery');
  assert.equal(first.status, 'delivered');
  assert.equal(first.intent.expectedHeadSha, SHA_A);
  assert.equal(first.receipt.expectedHeadSha, SHA_A);
  assert.equal(first.action, null);
  assert.equal(calls.providerActions, 0);
  assert.equal(calls.receiptCreates, 1);

  const retry = await runDeliver({ issueNumber: 1389, cfg, state, deps });
  assert.equal(retry.status, 'already-delivered');
  assert.equal(retry.action, null);
  assert.equal(calls.providerActions, 0);
  assert.equal(calls.receiptCreates, 1);
  ```

  Add refusals for a historical open PR, no intent, external intent, wrong-SHA
  Test/Review/Agent Review/approval, disabled Full-Auto standing policy, wrong
  intent repository/issue/PR/branch/base/head/method/attribution bytes, merge
  before intent server time, unreachable merge, duplicate receipt, and divergent
  receipt.

- [ ] **Step 2: Run focused tests and verify failure**

  ```bash
  node --test scripts/tests/unit/task-tracker/verbs/deliver.test.mjs scripts/tests/unit/task-tracker/verbs/deliver-pr-selection.test.mjs
  ```

  Expected: FAIL because `runDeliver` still resolves and preflights against local
  HEAD before it can discover historical accepted authority.

- [ ] **Step 3: Reorder delivery reads around accepted authority**

  Implement this orchestration order:

  ```js
  const branch = await getCurrentBranch();
  const observedLocalHeadSha = await getLocalHeadSha();
  const testReceiptSha = await resolveTestReceiptSha({ issue, issueNumber });
  const acceptedReviewSha = await resolveAcceptedReviewSha({
    issue,
    issueNumber,
    expectedHeadSha: testReceiptSha,
  });
  const agentReviewPassed = await resolveAgentReviewPassed({
    issue,
    issueNumber,
    expectedHeadSha: testReceiptSha,
  });
  const pullRequestRefs = await listPullRequests({
    repository: cfg.repo,
    headRef: branch,
  });
  const pullRequests = await Promise.all(
    pullRequestRefs.map(({ number }) =>
      fetchPullRequest({ repository: cfg.repo, prNumber: Number(number) })
    )
  );
  const authority = resolveAcceptedDeliveryAuthority({
    issueNumber,
    branch,
    localHeadSha: observedLocalHeadSha,
    testReceiptSha,
    reviewReceiptSha: acceptedReviewSha,
    agentReviewPassed,
    pullRequests,
  });
  ```

  Resolve approval against `authority.acceptedSha`. Parse delivery records only
  with `authority.pullRequest.number` as context.

- [ ] **Step 4: Separate current-head and historical preflight**

  Keep `validateDeliveryPreflight` as the only provider-authorizing path. It must
  require `headRelation === 'current'`, green current-head checks, clean worktree,
  mergeability, deterministic commit bytes, and the existing action contract.

  `validateHistoricalRecoveryPreflight` must require `headRelation ===
'advanced'`, clean worktree observation, merged exact-head PR, one existing
  non-external live intent, matching accepted lifecycle/approval evidence, and
  no conflicting receipt. It must reject a missing intent rather than invoking
  `verifyExternalDeliveredPullRequest`.

- [ ] **Step 5: Preserve strict live verification and lost-response recovery**

  Pass `acceptedSha` as the source authority and `observedLocalHeadSha` only as
  observation. Continue fetching trunk, verifying merge reachability, exact
  authorized squash title/message, merge method, attribution, and server-time
  ordering. After a receipt POST error, re-read and adopt exactly one
  byte-identical receipt; never accept duplicate durable records.

- [ ] **Step 6: Run Task 2 tests**

  ```bash
  node --test scripts/tests/unit/task-tracker/verbs/deliver.test.mjs scripts/tests/unit/task-tracker/verbs/deliver-pr-selection.test.mjs scripts/tests/unit/task-tracker/lib/delivery-real-pr-evidence.test.mjs
  ```

  Expected: PASS for current delivery, historical recovery, retry adoption, and
  every fail-closed variant.

- [ ] **Step 7: Commit Task 2**

  ```bash
  git add scripts/task-tracker/lib/delivery-preflight.mjs scripts/task-tracker/verbs/deliver.mjs scripts/task-tracker/lib/delivery-verification.mjs scripts/tests/unit/task-tracker/verbs/deliver.test.mjs scripts/tests/unit/task-tracker/verbs/deliver-pr-selection.test.mjs scripts/tests/unit/task-tracker/lib/delivery-real-pr-evidence.test.mjs
  git commit -m "[#1381] Recover historical delivery receipts"
  ```

### Task 3: Historical close authority and terminal idempotence

**Files:**

- Modify: `scripts/task-tracker/verbs/close.mjs`
- Modify: `scripts/task-tracker/lib/close-convergence.mjs`
- Modify: `scripts/task-tracker/lib/close-delivery-receipt.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/close-delivery-gate-input.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/close-delivery-receipt.test.mjs`
- Modify:
  `scripts/tests/unit/task-tracker/verbs/close-convergence-wiring-finalize.test.mjs`
- Create:
  `scripts/tests/unit/task-tracker/verbs/close-delivered-idempotence.test.mjs`

**Interfaces:**

- `loadCloseDeliveryGateInput` returns the Task 1 authority fields plus the
  selected-PR delivery-record projection.
- `verbClose` resolves human or Full-Auto authorization against
  `gateInput.acceptedSha`, never local HEAD.
- A terminal retry returns
  `{ action: 'already-closed', status: 'completed', mutated: false }` when every
  terminal signal and transaction step is already complete.

- [ ] **Step 1: Write the failing reused-branch close regression**

  Model accepted SHA A and receipt A while local HEAD and the same branch are at
  SHA B. Supply PR A and PR B in both orders. Assert the gate selects PR A,
  resolves approval for SHA A, verifies receipt A, and reaches the existing
  terminal pipeline.

- [ ] **Step 2: Write the failing exact retry contract**

  After the first close, rerun the exact close command over a CLOSED/COMPLETED,
  board-Done, `Disposition=Delivered` snapshot with a complete durable close
  transaction. Capture these spies and assert all stay at zero on retry:

  ```js
  assert.deepEqual(calls, {
    providerActions: 0,
    issueRecordCreates: 0,
    timingRows: 0,
    estimationOutcomes: 0,
    lifecycleMutations: 0,
    boardWrites: 0,
    dispositionWrites: 0,
    issueCloses: 0,
    labelWrites: 0,
    bindingReleases: 0,
  });
  ```

  Add partial-close fixtures for each durable transaction phase and assert only
  the missing step runs. Malformed, duplicated, or contradictory terminal
  records must refuse rather than no-op.

- [ ] **Step 3: Run focused tests and verify failure**

  ```bash
  node --test scripts/tests/unit/task-tracker/verbs/close-delivery-gate-input.test.mjs scripts/tests/unit/task-tracker/verbs/close-delivered-idempotence.test.mjs
  ```

  Expected: FAIL until historical authority and exact terminal retry behavior
  are composed.

- [ ] **Step 4: Use accepted authority before terminal convergence**

  Keep ordinary non-terminal Review exit gates first. Then resolve lifecycle
  evidence, Task 1 authority, approval for `acceptedSha`, exact PR records,
  receipt, fresh trunk, and attribution before starting or resuming the terminal
  transaction. Do not compare accepted and local SHAs after authority resolution.

- [ ] **Step 5: Make the completed close retry read-only**

  Extend the existing close-convergence decision so CLOSED/COMPLETED + Done +
  Delivered + complete transaction returns before lifecycle reconciliation,
  timing flush, estimation, board, disposition, issue-close, labels, or binding
  release. Preserve the existing transaction recovery for incomplete terminal
  steps and verify every completed step by durable readback before skipping it.

- [ ] **Step 6: Run Task 3 tests**

  ```bash
  node --test scripts/tests/unit/task-tracker/verbs/close-delivery-gate-input.test.mjs scripts/tests/unit/task-tracker/verbs/close-delivery-receipt.test.mjs scripts/tests/unit/task-tracker/verbs/close-convergence-wiring-finalize.test.mjs scripts/tests/unit/task-tracker/verbs/close-delivered-idempotence.test.mjs
  ```

  Expected: PASS with first-close ordering, historical authority, exact no-effect
  retry, and partial-transaction convergence.

- [ ] **Step 7: Commit Task 3**

  ```bash
  git add scripts/task-tracker/verbs/close.mjs scripts/task-tracker/lib/close-convergence.mjs scripts/task-tracker/lib/close-delivery-receipt.mjs scripts/tests/unit/task-tracker/verbs/close-delivery-gate-input.test.mjs scripts/tests/unit/task-tracker/verbs/close-delivery-receipt.test.mjs scripts/tests/unit/task-tracker/verbs/close-convergence-wiring-finalize.test.mjs scripts/tests/unit/task-tracker/verbs/close-delivered-idempotence.test.mjs
  git commit -m "[#1381] Make delivered close historically idempotent"
  ```

### Task 4: Incident record contracts and Incorporated project field

**Files:**

- Create: `scripts/task-tracker/lib/delivery-incident-records.mjs`
- Modify: `.ai-task-manager/project-fields.json`
- Modify: `scripts/task-tracker/lib/terminal-disposition.mjs`
- Modify: `scripts/gh/init-repair.mjs`
- Create:
  `scripts/tests/unit/task-tracker/lib/delivery-incident-records.test.mjs`
- Modify:
  `scripts/tests/unit/task-tracker/core/disposition-field-contract.test.mjs`
- Modify:
  `scripts/tests/unit/task-tracker/gh/disposition-install-repair.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/init-repair.test.mjs`

**Interfaces:**

- Envelope `recordType` values are `delivery-incident-ledger`,
  `delivery-incident-ledger-approval`, and `delivery-incident-incorporated`.
- Payload schemas are `aitm.delivery-incident-ledger/v1`,
  `aitm.delivery-incident-ledger-approval/v1`, and
  `aitm.delivery-incident-incorporated/v1`.
- Produces `buildIncidentLedgerPayload`, `buildIncidentLedgerApprovalPayload`,
  `buildIncorporatedPayload`, `renderIncidentRecord`, and
  `projectDeliveryIncidentRecords`.
- Adds exact terminal disposition `Incorporated`.

- [ ] **Step 1: Write strict record-contract tests**

  The ledger payload must have exactly:

  ```js
  {
    schema: 'aitm.delivery-incident-ledger/v1',
    ledgerId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    repository: 'kburson/ai-task-manager',
    incidentIssue: 939,
    convergenceIssue: 1381,
    baselineTrunkSha: 'a'.repeat(40),
    rows: [
      {
        issueNumber: 1382,
        observedGitHubState: 'OPEN',
        observedBoardState: 'Test',
        acceptedSha: 'e810084f0978de511078403406f008d1683fc10a',
        prNumber: 1385,
        prHeadSha: 'ac36528f7cc526f81e34da1350f62e6e7f6a7c34',
        mergeSha: '7c508fb6258390c577ad1091fa4827500e4e70e4',
        intentUrl: null,
        receiptUrl: null,
        approvalMode: null,
        approvalSha: null,
        codeOnTrunk: true,
        codeOnTrunkBasis: 'carrier-pr',
        blocker: 'missing issue-local exact-head delivery authority',
        intendedOutcome: 'incorporated',
      },
    ],
  }
  ```

  Require all 19 reviewed issue rows exactly once, sorted by issue number, with
  explicit `null` values. Reject unknown/missing keys, unsafe issue numbers,
  non-lowercase or partial SHAs, non-HTTPS URLs, unsupported outcomes, duplicate
  issue rows, unsorted rows, rows outside the reviewed set, wrong convergence or
  incident issue, oversized strings/arrays, and mutable return values.

  The reviewed set includes #1403 with `intendedOutcome: 'incorporated'`, PR
  #1404, accepted SHA `ec160af0b03df8453fa0a1ad7f91b7138aeda38d`, carrier
  merge SHA `19c6f54b0354699b988c470a99f122edab3aa2ba`, and blocker text explaining
  that the historical merge method and missing governed intent/receipt prohibit
  ordinary Delivered close.

- [ ] **Step 2: Test approval and Incorporated projection**

  Approval must bind one `ledgerId` and
  `ledgerDigest = hashRecordPayload(ledgerPayload)`. Projection accepts exactly
  one approved ledger tip and refuses missing, forked, stale, unknown, or
  conflicting approval records.

  Incorporated record identity is deterministic over:

  ```text
  repository + issueNumber + convergenceIssue + ledgerId
  ```

  Two Incorporated issues may share one accepted non-head SHA without collision
  because their issue numbers differ. Lock this explicitly with #1382 and #1383.

- [ ] **Step 3: Run record tests and verify failure**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/delivery-incident-records.test.mjs
  ```

  Expected: FAIL because the record module does not exist.

- [ ] **Step 4: Implement records on the canonical envelope**

  Use `createAitmRecordEnvelope`, `hashRecordPayload`, `renderAitmRecord`, and the
  existing GitHub comment store. The payload schema carries the version because
  envelope `recordType` intentionally uses the repository's lowercase-hyphen
  grammar. Readback must compare canonical envelope bytes and payload digest.

- [ ] **Step 5: Add and repair the project option idempotently**

  Add this option without changing existing names, colors, or descriptions:

  ```json
  {
    "name": "Incorporated",
    "color": "BLUE",
    "description": "Implementation retained on trunk without complete issue-local delivery authority"
  }
  ```

  Extend `TERMINAL_DISPOSITIONS`, installation, and `init-repair` tests. Repair
  must create the missing option, adopt an exact existing option, and refuse
  malformed/ambiguous field state without rewriting existing values.

- [ ] **Step 6: Run Task 4 tests**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/delivery-incident-records.test.mjs scripts/tests/unit/task-tracker/core/disposition-field-contract.test.mjs scripts/tests/unit/task-tracker/gh/disposition-install-repair.test.mjs scripts/tests/unit/task-tracker/lib/init-repair.test.mjs
  ```

  Expected: PASS for strict records, shared-SHA non-collision, and idempotent
  project-field repair.

- [ ] **Step 7: Commit Task 4**

  ```bash
  git add scripts/task-tracker/lib/delivery-incident-records.mjs .ai-task-manager/project-fields.json scripts/task-tracker/lib/terminal-disposition.mjs scripts/gh/init-repair.mjs scripts/tests/unit/task-tracker/lib/delivery-incident-records.test.mjs scripts/tests/unit/task-tracker/core/disposition-field-contract.test.mjs scripts/tests/unit/task-tracker/gh/disposition-install-repair.test.mjs scripts/tests/unit/task-tracker/lib/init-repair.test.mjs
  git commit -m "[#1381] Model delivery incident reconciliation records"
  ```

### Task 5: Ledger mutation authority and read-only verifier

**Files:**

- Create: `scripts/task-tracker/lib/delivery-incident-reconciliation.mjs`
- Create: `scripts/task-tracker/verbs/incident-ledger.mjs`
- Create: `scripts/task-tracker/verify-delivery-incident-reconciliation.mjs`
- Modify: `scripts/task-tracker/task-tracker.mjs`
- Modify: `scripts/task-tracker/verbs/help-data.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/catalog.mjs`
- Modify: `skill/shared/router.md`
- Create: `skill/shared/rules/incident-ledger.md`
- Create:
  `scripts/tests/unit/task-tracker/lib/delivery-incident-reconciliation.test.mjs`
- Create: `scripts/tests/unit/task-tracker/verbs/incident-ledger.test.mjs`
- Create:
  `scripts/tests/unit/task-tracker/core/verify-delivery-incident-reconciliation.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/help.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/command-manifest.test.mjs`
- Modify: `scripts/tests/unit/providers/parity.test.mjs`
- Modify: `scripts/tests/unit/providers/skill-version-stamp.test.mjs`

**Interfaces:**

- Adds `/task incident-ledger #1381 --record LEDGER_JSON_PATH` to append and read back
  one observed ledger.
- Adds `/task incident-ledger #1381 --approve LEDGER_ID --digest SHA256_DIGEST` as
  the authenticated human approval action. A successful `--record` invocation
  prints the exact approval command with both immutable values populated.
- Produces `resolveApprovedIncidentLedger({ records, repository,
convergenceIssue, incidentIssue })`.
- Adds a read-only executable verifier with the accepted command:
  `node scripts/task-tracker/verify-delivery-incident-reconciliation.mjs --issue 1381`.
  The default is terminal verification; `--phase pre-close` verifies the
  approved baseline before downstream mutation.

- [ ] **Step 1: Write failing ledger-command tests**

  Assert `--record` validates live issue, project, PR, merge, and freshly fetched
  trunk observations before writing the caller-supplied canonical rows. Assert
  lost comment-create response recovery re-reads and adopts one byte-identical
  record.

  Assert `--approve` authenticates the current GitHub login first, reloads the
  exact ledger by ID, recomputes its digest, compares the supplied digest, then
  writes one approval carrying that login. It must refuse a partial login,
  unknown ledger, mismatched digest, already-approved divergent ledger, or more
  than one approved tip.

- [ ] **Step 2: Write failing verifier tests**

  Inject all live reads and assert the default verifier performs zero writes. It
  must compare the approved rows with GitHub issue state, project state,
  accepted evidence, exact PR head, merge SHA, fresh trunk reachability, intent
  and receipt URLs, approval mode/SHA, outcome records, and terminal disposition.
  Mismatches use the stable refusals `delivery-incident:missing-authority`,
  `delivery-incident:extra-row`, `delivery-incident:stale-observation`,
  `delivery-incident:ambiguous-authority`, or
  `delivery-incident:conflicting-authority`.

  Add explicit phase tests. `--phase pre-close` must require #1381 to be
  independent of #939, one approved ledger tip, live observations matching each
  row, #1403 classified only as Incorporated, and the exact blocker order. It
  emits `pending-authorized` for an approved downstream row whose terminal
  outcome is intentionally not yet present and refuses any row already mutated
  contrary to its approved outcome. The default terminal phase requires the
  matching terminal record and disposition for every row. Both phases are
  read-only, and the same approved ledger remains resolvable after #1381 is
  closed.

- [ ] **Step 3: Run focused tests and verify failure**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/delivery-incident-reconciliation.test.mjs scripts/tests/unit/task-tracker/verbs/incident-ledger.test.mjs scripts/tests/unit/task-tracker/core/verify-delivery-incident-reconciliation.test.mjs
  ```

  Expected: FAIL because the reconciliation surfaces do not exist.

- [ ] **Step 4: Implement explicit mutation modes**

  Keep record and approval as distinct invocations. Neither mode may execute an
  issue disposition, delivery, provider action, or close. Route both writes
  through the canonical GitHub comment store and exact readback. The approval
  payload must include `approvedBy`, canonical server `approvedAt`, `ledgerId`,
  and exact `ledgerDigest`; local time is diagnostic only.

- [ ] **Step 5: Implement the read-only verifier**

  The verifier defaults to no mutation and prints canonical JSON with exact
  keys `schema`, `repository`, `convergenceIssue`, `ledgerId`, `ledgerDigest`,
  `baselineTrunkSha`, `verifiedTrunkSha`, `outcomes`, and `ok`.
  `schema` is `aitm.delivery-incident-verification/v1`; `outcomes` contains one
  sorted `{ issueNumber, intendedOutcome, status, evidence }` result for every
  reviewed issue. The script exits nonzero for missing, extra, stale,
  ambiguous, or conflicting authority. In pre-close phase, `ok: true` means the
  approved baseline and pending authorization graph are internally consistent;
  it never means downstream outcomes have executed. In terminal phase,
  `ok: true` means every approved outcome is present and verified. Reject any
  phase other than `pre-close` or `terminal`.

- [ ] **Step 6: Add routing and help parity**

  Help must distinguish observation recording, authenticated approval, and
  read-only verification. It must state that co-review is not ledger approval
  and that no mode closes an issue or manufactures delivery evidence. Add the
  JIT task-skill route and rule so every provider adapter shares the same
  record/approval boundary without provider-specific prose.

- [ ] **Step 7: Run Task 5 tests**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/delivery-incident-reconciliation.test.mjs scripts/tests/unit/task-tracker/verbs/incident-ledger.test.mjs scripts/tests/unit/task-tracker/core/verify-delivery-incident-reconciliation.test.mjs scripts/tests/unit/task-tracker/verbs/help.test.mjs scripts/tests/unit/task-tracker/core/command-manifest.test.mjs scripts/tests/unit/providers/parity.test.mjs scripts/tests/unit/providers/skill-version-stamp.test.mjs
  ```

  Expected: PASS with mutation/read-only separation and help parity.

- [ ] **Step 8: Commit Task 5**

  ```bash
  git add scripts/task-tracker/lib/delivery-incident-reconciliation.mjs scripts/task-tracker/verbs/incident-ledger.mjs scripts/task-tracker/verify-delivery-incident-reconciliation.mjs scripts/task-tracker/task-tracker.mjs scripts/task-tracker/verbs/help-data.mjs scripts/task-tracker/lib/command-surface/catalog.mjs skill/shared/router.md skill/shared/rules/incident-ledger.md scripts/tests/unit/task-tracker/lib/delivery-incident-reconciliation.test.mjs scripts/tests/unit/task-tracker/verbs/incident-ledger.test.mjs scripts/tests/unit/task-tracker/core/verify-delivery-incident-reconciliation.test.mjs scripts/tests/unit/task-tracker/verbs/help.test.mjs scripts/tests/unit/task-tracker/core/command-manifest.test.mjs scripts/tests/unit/providers/parity.test.mjs scripts/tests/unit/providers/skill-version-stamp.test.mjs
  git commit -m "[#1381] Add approved incident ledger verification"
  ```

### Task 6: Ledger-authorized Incorporated close lane

**Files:**

- Create: `scripts/task-tracker/lib/incorporated-close.mjs`
- Create: `scripts/task-tracker/lib/incident-epic-close.mjs`
- Modify: `scripts/task-tracker/lib/close-disposition.mjs`
- Modify: `scripts/task-tracker/verbs/close.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/incorporated-close.test.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/incident-epic-close.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/close-disposition.test.mjs`
- Create: `scripts/tests/unit/task-tracker/verbs/close-incorporated.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/help.test.mjs`

**Interfaces:**

- Extends the existing surface with
  `/task close #N --as incorporated --of #1381`.
- Produces `authorizeIncorporatedClose(input)` as a pure read decision and
  `runIncorporatedClose(input)` as the re-entrant mutation orchestrator.
- Produces `authorizeIncidentEpicClose(input)` as a pure pre-terminal guard for
  ordinary close of the ledger's incident issue. It derives the required
  non-native terminal set from the approved ledger instead of pretending all
  convergence targets are native epic children.
- Returns `{ status: 'incorporated'|'already-incorporated', issueNumber,
convergenceIssue, ledgerId, recordId, mutatedSteps }`.

- [ ] **Step 1: Write failing argument and authorization tests**

  Require `--of` for Incorporated and normalize it to `#1381`. Refuse any
  convergence issue other than the approved ledger owner. Before any mutation,
  require exactly one approved `incorporated` row for the target and verify the
  target issue, source evidence, carrier PR, carrier merge SHA, fresh trunk
  reachability, and the row's incomplete-delivery explanation.

  Add #1403-specific tests proving that PR #1404 is carrier evidence only: a
  stale approval marker, merged PR, or trunk reachability cannot substitute for
  its approved Incorporated row, and no delivery receipt is created. Add
  ordering tests proving an Incorporated close refuses before the target's live
  blocker reaches Done and succeeds only after all three blocker carriers are
  consistently cleared by the sanctioned unblock path.

  Refuse missing/unapproved/forked/stale ledgers, duplicate rows, conflicting
  issue-local Incorporated records, and any valid exact-head delivery receipt.
  Assert every mutation spy remains zero on refusal.

- [ ] **Step 2: Write failing re-entry tests**

  The first valid call must execute in this order:

  ```text
  authorize approved ledger and live evidence
    -> append/read back issue-local Incorporated record
    -> flush timing
    -> write Disposition=Incorporated
    -> write Status=Done
    -> close GitHub issue with completed semantics and read back
    -> post audit result
    -> release binding
  ```

  A retry adopts the deterministic issue-local record and converges only missing
  terminal effects. A fully converged retry returns `already-incorporated` with
  an empty `mutatedSteps` array.

- [ ] **Step 3: Write the failing incident-epic close guard tests**

  For incident issue #939 and convergence issue #1381, require #1380, #1382,
  #1383, and #1384 to have the approved terminal outcome and current terminal
  project/issue state before any ordinary #939 close mutation. Cover each of the
  four as the sole pending row, multiple pending rows, missing/forked approval,
  a terminal state that contradicts the ledger outcome, and the all-terminal
  success case. Assert every provider, record, timing, estimation, lifecycle,
  board, issue-close, label, and binding mutation spy remains zero on refusal.
  Keep the existing native-child guard additive; neither guard substitutes for
  the other.

- [ ] **Step 4: Run focused tests and verify failure**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/incorporated-close.test.mjs scripts/tests/unit/task-tracker/lib/incident-epic-close.test.mjs scripts/tests/unit/task-tracker/verbs/close-incorporated.test.mjs
  ```

  Expected: FAIL because the Incorporated lane and incident-epic guard do not
  exist.

- [ ] **Step 5: Implement the pure authorization boundaries**

  Consume `resolveApprovedIncidentLedger`, the target's accepted evidence,
  carrier PR/merge/trunk observations, and projected delivery records. Return a
  frozen authorization object containing only canonical values required by the
  issue-local record. Do not let cumulative trunk presence pass the ordinary
  delivery receipt gate.

  Implement `authorizeIncidentEpicClose` against the same approved ledger
  projection. Wire it in `close.mjs` after native-child/read-only authority
  resolution but before every terminal mutation when the target is the
  ledger's `incidentIssue`. Require the exact approved outcomes for #1380,
  #1382, #1383, and #1384 and their matching live terminal states. Return a
  frozen authorization on success and stable refusal details naming every
  pending or contradictory issue.

- [ ] **Step 6: Implement re-entrant terminal mutation**

  Reuse `writeTerminalDisposition`, `writeTerminalStatusDone`, timing flush,
  GitHub close/readback, audit comment, and binding-release boundaries. Do not
  tick or invent Test, Review, Agent Review, approval, intent, receipt, or
  Delivered evidence. Record the exact completed step set so partial retries do
  not replay completed writes.

- [ ] **Step 7: Run Task 6 tests**

  ```bash
  node --test scripts/tests/unit/task-tracker/lib/incorporated-close.test.mjs scripts/tests/unit/task-tracker/lib/incident-epic-close.test.mjs scripts/tests/unit/task-tracker/lib/close-disposition.test.mjs scripts/tests/unit/task-tracker/verbs/close-incorporated.test.mjs scripts/tests/unit/task-tracker/verbs/help.test.mjs
  ```

  Expected: PASS for authorization-before-mutation, exact re-entry, valid receipt
  refusal, all #939 incident-child pending combinations, and CLI help.

- [ ] **Step 8: Commit Task 6**

  ```bash
  git add scripts/task-tracker/lib/incorporated-close.mjs scripts/task-tracker/lib/incident-epic-close.mjs scripts/task-tracker/lib/close-disposition.mjs scripts/task-tracker/verbs/close.mjs scripts/tests/unit/task-tracker/lib/incorporated-close.test.mjs scripts/tests/unit/task-tracker/lib/incident-epic-close.test.mjs scripts/tests/unit/task-tracker/lib/close-disposition.test.mjs scripts/tests/unit/task-tracker/verbs/close-incorporated.test.mjs scripts/tests/unit/task-tracker/verbs/help.test.mjs
  git commit -m "[#1381] Gate Incorporated and incident terminal close"
  ```

### Task 7: Deterministic reused-branch integration harness

**Files:**

- Create:
  `scripts/tests/integration/task-tracker/verbs/deliver-close.integration.test.mjs`
- Modify: `scripts/tests/helpers/close-convergence-wiring-helpers.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/full-auto-close-doctrine.test.mjs`

**Interfaces:**

- Uses production delivery/incident parsers, authority selection, preflight,
  verification, receipt gate, approval resolver, close convergence, and
  Incorporated authorization.
- Injects only GitHub, Git, project, provider, timer, estimation, body, and
  binding I/O boundaries.
- Produces a stable side-effect ledger for every step and retry.

- [ ] **Step 1: Build the failing A→B reused-branch scenario**

  Drive this exact state sequence:

  ```text
  issue A / SHA A / PR A open / branch at A
    -> deliver A creates intent A and emits action A once
    -> provider snapshot merges PR A
    -> deliver A writes receipt A once
  same branch advances to SHA B
  issue B / SHA B / PR B open / branch at B
    -> deliver B creates intent B and emits action B once
    -> provider snapshot merges PR B
    -> deliver B writes receipt B once
  branch remains at B
    -> close A selects PR A and receipt A from accepted SHA A
    -> retry close A
    -> every mutating count remains unchanged
  ```

  Assert the first close records approval provenance and standing-policy state.
  With standing Full-Auto disabled, the same close must fail before terminal
  effects so operational policy refusal is distinguishable from a code defect.

- [ ] **Step 2: Add the interrupted historical recovery scenario**

  Interrupt after intent A and provider merge, before receipt A. Advance the
  branch to B, retry delivery A, and assert one receipt, zero provider calls, and
  `already-delivered` on the next retry.

- [ ] **Step 3: Add adversarial variants**

  Cover zero/duplicate exact-head PRs, both PR orders, malformed/forked intents,
  duplicate/divergent receipts, wrong lifecycle or approval SHA, disabled
  standing policy, wrong PR/merge/method/attribution, unreadable trunk,
  malformed provider timestamps, partial terminal transactions, missing or
  stale ledgers, and Incorporated attempted over a valid receipt.

  Include #1382 and #1383 as two incorporated rows sharing
  `e810084f0978de511078403406f008d1683fc10a`; assert their issue-local keys and
  terminal records remain distinct.

  Add amendment-gate scenarios proving the approved ledger still authorizes
  Phase B after #1381 is Done, the chain refuses to advance while its current
  blocker is not Done, and #939 refuses terminal close while any of #1380,
  #1382, #1383, or #1384 remains non-terminal. The #1381 fixture must have no
  native #939 parent edge.

- [ ] **Step 4: Run the integration test and verify failure**

  ```bash
  node --test scripts/tests/integration/task-tracker/verbs/deliver-close.integration.test.mjs
  ```

  Expected: FAIL until Tasks 1–6 compose through the production decision seams.

- [ ] **Step 5: Complete only the minimal integration wiring**

  Add injected seams to existing production entry points where the harness
  cannot observe an I/O boundary. Do not add a second workflow engine, parser,
  authority source, or provider path. Assert authorization event order, not only
  final state.

- [ ] **Step 6: Run Task 7 tests**

  ```bash
  node --test scripts/tests/integration/task-tracker/verbs/deliver-close.integration.test.mjs scripts/tests/unit/task-tracker/core/full-auto-close-doctrine.test.mjs
  ```

  Expected: PASS with exactly two provider actions, one receipt per PR, one
  historical close, and zero additional effects on the close retry.

- [ ] **Step 7: Commit Task 7**

  ```bash
  git add scripts/tests/integration/task-tracker/verbs/deliver-close.integration.test.mjs scripts/tests/helpers/close-convergence-wiring-helpers.mjs scripts/tests/unit/task-tracker/core/full-auto-close-doctrine.test.mjs
  git commit -m "[#1381] Prove reused-branch delivery convergence"
  ```

### Task 8: Workflow, architecture, help, and repository verification

**Files:**

- Modify: `docs/guides/workflow.md`
- Modify: `docs/guides/architecture-overview.md`
- Modify: `docs/guides/settings-guide.md`
- Modify: `scripts/task-tracker/verbs/help-data.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/catalog.mjs`
- Modify: `skill/shared/rules/deliver.md`
- Modify: `scripts/maintenance/lint-doc-anchors.mjs`
- Modify: `scripts/tests/unit/inspect/delivery-doc-parity.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/help.test.mjs`
- Modify: `scripts/tests/unit/providers/parity.test.mjs`
- Modify: `scripts/tests/unit/providers/skill-version-stamp.test.mjs`

**Interfaces:**

- Documents and tests the current-head, historical-recovery, historical-close,
  Incorporated, ledger, verifier, partial-close, and retry contracts.
- Keeps CLI help and API/command catalog descriptions byte-consistent with the
  implemented surfaces.

- [ ] **Step 1: Write failing help and documentation parity tests**

  Require exact terms for `accepted SHA`, `historical receipt recovery`,
  `no provider action`, `Incorporated`, `approved incident ledger`, `--of`, and
  `already-closed`. Require documentation to reject cumulative inclusion as a
  delivery receipt.

- [ ] **Step 2: Run focused parity tests and verify failure**

  ```bash
  node --test scripts/tests/unit/inspect/delivery-doc-parity.test.mjs scripts/tests/unit/task-tracker/verbs/help.test.mjs scripts/tests/unit/providers/parity.test.mjs scripts/tests/unit/providers/skill-version-stamp.test.mjs
  ```

  Expected: FAIL until help and documentation describe the new modes.

- [ ] **Step 3: Update operator and architecture documentation**

  Document:

  - `Review -> deliver -> receipt -> close`;
  - current-head provider action versus historical no-action recovery;
  - exact accepted-head PR selection on a reused branch;
  - approval provenance and Full-Auto standing-policy revalidation;
  - adapter timestamp normalization versus strict core parsing;
  - Delivered, Incorporated, Replaced, Discarded, and Duplicate;
  - approved ledger authority, record readback, and reconciliation;
  - partial terminal recovery and fully read-only retry;
  - explicit refusal to infer exact delivery from cumulative inclusion.

  Update the shared deliver rule so an `AITM_DELIVERY_RESULT` with
  `mode=historical-recovery` never triggers a host provider call, while a
  current-head `AITM_PROVIDER_ACTION_REQUIRED` retains the exact sanctioned
  provider contract. Bump and verify the rule/skill version stamps through the
  repository parity mechanism.

- [ ] **Step 4: Run the reviewed focused verification contract**

  ```bash
  node --test scripts/tests/integration/task-tracker/verbs/deliver-close.integration.test.mjs
  node --test scripts/tests/unit/task-tracker/verbs/deliver-pr-selection.test.mjs
  node --test scripts/tests/unit/task-tracker/verbs/close-delivery-gate-input.test.mjs scripts/tests/unit/task-tracker/verbs/close-delivery-receipt.test.mjs scripts/tests/unit/task-tracker/verbs/close-convergence-wiring-finalize.test.mjs
  node --test scripts/tests/unit/task-tracker/lib/delivery-real-pr-evidence.test.mjs
  node --test scripts/tests/unit/task-tracker/lib/delivery-incident-records.test.mjs scripts/tests/unit/task-tracker/lib/delivery-incident-reconciliation.test.mjs scripts/tests/unit/task-tracker/lib/incorporated-close.test.mjs
  node scripts/task-tracker/verify-delivery-incident-reconciliation.mjs --help
  npm run lint:md
  ```

  Expected: all focused tests and Markdown lint PASS; verifier help exits zero
  and documents the live command without reading or mutating GitHub. Task 9 runs
  the live verifier after the approved ledger and outcome records exist.

- [ ] **Step 5: Run full repository verification**

  ```bash
  npm test
  npm run test:slow
  npm run lint
  npm run format:check
  git log --oneline -1
  ```

  Expected: all commands PASS; the final log entry carries `[#1381]`.

- [ ] **Step 6: Commit Task 8**

  ```bash
  git add docs/guides/workflow.md docs/guides/architecture-overview.md docs/guides/settings-guide.md scripts/task-tracker/verbs/help-data.mjs scripts/task-tracker/lib/command-surface/catalog.mjs skill/shared/rules/deliver.md scripts/maintenance/lint-doc-anchors.mjs scripts/tests/unit/inspect/delivery-doc-parity.test.mjs scripts/tests/unit/task-tracker/verbs/help.test.mjs scripts/tests/unit/providers/parity.test.mjs scripts/tests/unit/providers/skill-version-stamp.test.mjs
  git commit -m "[#1381] Document governed delivery convergence"
  ```

### Task 9: Blocker-first live reconciliation and terminal closure

**Files:**

- Create during execution:
  `.tmp/plan/1381-delivery-incident-ledger.json` (ignored live input).
- Create during execution:
  `.superpowers/sdd/task-9-live-acceptance.md` (ignored working evidence).
- Publish durable records to issues through the governed commands from Tasks 5
  and 6; do not add a tracked evidence snapshot that can drift from GitHub.

**Interfaces:**

- Consumes the merged #1381 implementation, approved live ledger, sanctioned
  provider integration, and all issue-local historical evidence.
- Produces a Delivered close for independent #1381, then one verified outcome
  per dependency-chain issue, followed by the final #939 child and epic results.

- [ ] **Step 1: Deliver #1381 normally**

  After Test, Agent Review, approval, exact-head CI, and clean-worktree gates,
  run `npx aitm deliver 1381`, execute only the emitted sanctioned provider
  action with its exact expected head and commit bytes, rerun delivery to obtain
  the receipt, and preserve the implementation PR/source/merge/CI/intent/receipt
  references. Do not put an issue auto-closing keyword in the PR body.

- [ ] **Step 2: Record and explicitly approve the live ledger**

  Re-read every issue/PR/project/trunk observation. Write the canonical ledger:

  ```bash
  npx aitm incident-ledger 1381 --record .tmp/plan/1381-delivery-incident-ledger.json
  ```

  Present its record ID, digest, full row diff, and emitted exact approval
  command to the human. Only after explicit approval, run that emitted command
  byte-for-byte. The implementation worker must not reconstruct, infer, or
  substitute either immutable value.

- [ ] **Step 3: Verify the blocker-first ledger before terminal mutation**

  Preserve #1378, #1379, #1386, and #1387 as superseded and #1399/#1401 as
  Delivered. Confirm the approved ledger contains exactly one row for every
  reviewed issue, names #1403 as Incorporated, and records the dependency order
  #1381 -> #1403 -> #1397 -> #1395 -> #1393 -> #1392 -> #1390 -> #1389 ->
  #1388. Do not rewrite closed historical records, dispositions, or timing.

  Run the explicit pre-close verifier:

  ```bash
  node scripts/task-tracker/verify-delivery-incident-reconciliation.mjs --issue 1381 --phase pre-close
  ```

  Expected: `ok: true`; every not-yet-executed downstream outcome is reported
  as `pending-authorized`, the dependency graph is exact, #1381 has no native
  #939 parent, and the invocation performs no writes. A terminal-mode success is
  neither expected nor permitted at this point.

- [ ] **Step 4: Close independent #1381**

  Publish a #1381 execution summary linking its implementation PR, exact source
  and merge SHAs, CI, intent, receipt, approved ledger ID/digest, hierarchy
  correction, and the still-pending chain outcomes. Run ordinary close through
  #1381's exact-head receipt. Retry the same close once and prove it performs no
  provider, record, timing, estimation, lifecycle, board, disposition,
  issue-close, label, or binding write.

- [ ] **Step 5: Close #1403 as Incorporated**

  Verify #1381 Done automatically removed all three #1403 blocker carriers; if
  any carrier remains, run the sanctioned unblock verb and verify label, board
  field, and body marker removal. Bind #1403 in its recorded worktree. Require
  the approved Incorporated ledger row, PR #1404 exact source SHA
  `ec160af0b03df8453fa0a1ad7f91b7138aeda38d`, carrier merge
  `19c6f54b0354699b988c470a99f122edab3aa2ba`, fresh trunk reachability, and no
  valid delivery receipt. Run:

  ```bash
  npx aitm close 1403 --as incorporated --of 1381
  ```

  Preserve the stale later-HEAD human approval marker as observable incident
  history; do not rewrite it into accepted-SHA approval evidence.

- [ ] **Step 6: Execute the real reused-branch acceptance for #1397**

  Verify #1403 Done unblocks #1397. Use #1397 as issue A/PR #1398 and
  already-delivered #1401/PR #1402 as issue B. Bind #1397 in its recorded
  governed worktree and confirm the shared branch is at B or later. Revalidate
  approval authority for SHA A, record its provenance and standing-policy state,
  close #1397 from immutable SHA A, then rerun the exact close command. Capture
  before/after counts proving no duplicate provider, record, timing, estimation,
  lifecycle, board, disposition, issue-close, label, or binding effect.

- [ ] **Step 7: Close #1395 and #1393 through existing receipts**

  Verify each predecessor's Done transition removes the next blocker carriers.
  Revalidate accepted-SHA approval provenance and close #1395, then #1393,
  through their existing exact-head receipts from their recorded governed
  worktrees. Do not create replacement receipts or relocate issue bindings.

- [ ] **Step 8: Recover and close #1392**

  Bind #1392 in its recorded governed worktree. Capture provider-action counts,
  run read-only historical delivery recovery for PR #1391, verify exactly one
  new receipt and zero provider calls, revalidate current human or standing
  Full-Auto authority for the accepted SHA, record the approval mode/source and
  policy state, then run ordinary close.

- [ ] **Step 9: Close #1390 as Incorporated**

  Verify #1392 Done unblocks #1390, bind #1390 in its recorded worktree, and run
  the approved ledger outcome:

  ```bash
  npx aitm close 1390 --as incorporated --of 1381
  ```

- [ ] **Step 10: Recover and close #1389**

  Verify #1390 Done unblocks #1389. Bind #1389 in its recorded governed
  worktree, recover the historical receipt for PR #1385 with zero provider
  calls, revalidate accepted-SHA approval, and run ordinary close.

- [ ] **Step 11: Close #1388 as Incorporated**

  Verify #1389 Done unblocks #1388, bind #1388 in its recorded worktree, and run:

  ```bash
  npx aitm close 1388 --as incorporated --of 1381
  ```

- [ ] **Step 12: Finish #939 children, including #1384**

  After #1388 reaches Done, resume #939 orchestration. Bind each target in its
  recorded governed worktree and apply only its approved ledger outcome:

  ```bash
  npx aitm close 1380 --as incorporated --of 1381
  npx aitm close 1382 --as incorporated --of 1381
  npx aitm close 1383 --as incorporated --of 1381
  npx aitm close 1384 --as incorporated --of 1381
  ```

  Verify one distinct issue-local record per issue and no delivery receipt. In
  particular, #1382 and #1383 must not collide despite their shared accepted
  SHA. Re-read #939's complete native child graph and refuse to proceed while any
  other governed child is non-terminal.

- [ ] **Step 13: Verify the full ledger**

  Confirm every approved ledger row has its truthful terminal result and run:

  ```bash
  node scripts/task-tracker/verify-delivery-incident-reconciliation.mjs --issue 1381
  ```

  Expected: `ok: true`, one outcome for all 19 baseline issues, no missing or
  extra rows, and no mutation.

- [ ] **Step 14: Deliver and close #939**

  First execute a fail-closed #939 authority checkpoint in its recorded reused
  worktree. Fetch `origin/trunk`; show the exact local branch, local and remote
  heads, ahead/behind counts, merge-base ancestry, clean-tree state, accepted
  Test/Review SHA, candidate PRs with exact `headRefOid`, and the complete patch
  and file-content delta against `origin/trunk`. Resolve exactly one truthful
  current-head delivery path with CI, approval, attribution, durable intent,
  sanctioned expected-head provider action, independent merged/trunk
  verification, and receipt. If the recorded branch cannot be synchronized
  without rewriting or discarding unique work, or no unique exact-head PR path
  exists, stop with the concrete authority conflict; do not select by recency,
  cumulative inclusion, or branch name alone.

  Then publish a #939 summary linking #1381, every dependency-chain close,
  unchanged historical result, Incorporated record, recovered receipt,
  approval provenance, reused-branch idempotence proof, and full-ledger
  verification. Complete the epic's remaining Test, Review, approval, delivery,
  and ordinary close gates. Retry close once and verify no duplicate terminal
  effects. Do not close, promote, or mutate any incident issue outside the
  approved ledger outcome or the verified #939 child graph.

## Claude Review Advisories Carried Forward

| Finding | Plan treatment                                                                                                 |
| ------- | -------------------------------------------------------------------------------------------------------------- |
| F-001   | Pre-implementation hydration and Task 8 use `npm run lint:md`; the nonexistent `lint:docs` alias is not added. |
| F-002   | The hydrated #1381 summary names the full converged set, including #1380, #1382, and #1383.                    |
| F-003   | Tasks 7 and 9 record approval provenance and standing Full-Auto policy state for each live close.              |
| F-004   | Tasks 4, 7, and 9 prove #1382/#1383 shared-SHA rows remain issue-keyed and collision-free.                     |

## Specification Coverage

| Accepted requirement                                 | Plan coverage                 |
| ---------------------------------------------------- | ----------------------------- |
| Immutable accepted SHA and exact-head PR authority   | Tasks 1–3                     |
| Current-head provider action remains protected       | Task 2                        |
| Historical pending-intent receipt recovery           | Task 2                        |
| Historical close and fully idempotent retry          | Task 3                        |
| GitHub adapter normalization and strict core parsing | Tasks 2 and 7                 |
| Squash attribution from authorized merge bytes       | Task 2                        |
| Incorporated disposition and project repair          | Tasks 4 and 6                 |
| Canonical ledger and explicit human approval         | Tasks 4 and 5                 |
| Phase-aware read-only reconciliation verifier        | Tasks 5 and 9                 |
| Reused branch A→B acceptance                         | Tasks 7 and 9                 |
| Truthful disposition for every incident issue        | Task 9                        |
| Documentation and help parity                        | Task 8                        |
| No successor guard defects                           | Global constraints and Task 9 |
| #1381 independent-scope gate                         | Tasks 5 and 7                 |
| Post-#1381 approved-ledger authority                 | Tasks 5, 7, and 9             |
| #1403 carrier-only Incorporated authorization        | Tasks 4, 6, 7, and 9          |
| Blocker-ordered chain refusal                        | Tasks 6, 7, and 9             |
| #939 child-terminal refusal and authority checkpoint | Tasks 7 and 9                 |

## Final Self-review Checklist

- [ ] Every accepted specification requirement maps to at least one task.
- [ ] Every Claude advisory maps to an explicit plan step.
- [ ] No task authorizes a provider action for an advanced historical head.
- [ ] Delivery and close use the same accepted-SHA resolver and field names.
- [ ] Ledger, approval, Incorporated, intent, and receipt records remain distinct.
- [ ] #1381 remains independent of #939 and no task restores the removed native
      sub-issue edge.
- [ ] #1381 closes before #1403, and every later chain issue closes only after
      its recorded blocker reaches Done.
- [ ] #1403 uses Incorporated with PR #1404 carrier evidence and never receives
      an invented delivery receipt.
- [ ] #939 finalization includes #1380, #1382, #1383, and #1384 after #1388.
- [ ] Every implementation task starts red, ends green, and has an independent
      `[#1381]` commit boundary.
- [ ] Focused verification uses only commands present in `package.json`.
- [ ] Live mutation remains after reviewed implementation, explicit ledger
      approval, and standing-policy revalidation.
