// @story #1787 #1800
import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalRecordJson } from '../../../../task-tracker/lib/github-records/canonical-json.mjs';
import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
} from '../../../../task-tracker/lib/delivery-records.mjs';
import {
  head,
  merge,
  id,
  createdAt,
  original,
  grant,
  originalIntent,
  originalInput,
  pinnedIntent,
  burn,
  burnOid,
  storedFacts,
  receipt,
  input,
} from './pinned-delivery-waiver-fixture.mjs';

// Closing a completed v3/v4 delivery must retain the original burn OID after
// later journal operations advance the issue's ref, without resolving a grant anew.
test('close verifies pinned v3/v4 receipt after grant expiry and journal advancement', async () => {
  const { projectDeliveryRecords } =
    await import('../../../../task-tracker/lib/delivery-records.mjs');
  const { requireDeliveryReceipt, verifyCloseDeliveryReceipt } =
    await import('../../../../task-tracker/lib/close-delivery-receipt.mjs');
  const pullRequest = { ...input(pinnedIntent).pullRequest, headRefName: original.headRef };
  const records = projectDeliveryRecords([
    { id: 'original', createdAt, record: original },
    { id: 'pinned', createdAt: '2026-09-25T12:01:01.000Z', record: pinnedIntent },
    { id: 'receipt', createdAt: '2026-09-25T12:04:00.000Z', record: receipt },
  ]);
  const gateInput = {
    issueNumber: original.issueNumber,
    repository: original.repository,
    lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
    branch: original.headRef,
    acceptedSha: head,
    observedLocalHeadSha: head,
    headRelation: 'current',
    pullRequests: [pullRequest],
    pullRequest,
    records,
  };
  const receiptGate = requireDeliveryReceipt(gateInput);
  const live = input(pinnedIntent);
  const result = await verifyCloseDeliveryReceipt({
    gateInput,
    receiptGate,
    testReceiptSha: head,
    acceptedReviewSha: head,
    deps: {
      attributingCommits: live.attributingCommits,
      fetchOriginTrunk: live.fetchOriginTrunk,
      inspectMergeCommit: live.inspectMergeCommit,
      isAncestor: live.isAncestor,
      resolveDeliveryWaiver: () => {
        throw new Error('current authorization consulted');
      },
      readWaiverJournal: async () => ({
        oid: 'f'.repeat(40),
        operations: new Map([
          [
            pinnedIntent.deliveryOperationId,
            {
              state: 'completed',
              burn,
              burnOid,
              intentPublication: {
                originalIntentId: original.intentId,
                originalIntentDigest: pinnedIntent.originalIntentDigest,
                intentId: pinnedIntent.intentId,
                intentBody: (
                  await import('../../../../task-tracker/lib/delivery-records.mjs')
                ).renderDeliveryIntentComment(pinnedIntent),
              },
              publication: {
                receiptBody: (
                  await import('../../../../task-tracker/lib/delivery-records.mjs')
                ).renderDeliveryReceiptComment(receipt),
              },
            },
          ],
        ]),
      }),
      listWaiverRecords: async () => [{ envelope: grant, createdAt: grant.createdAt }],
      verifyStoredDeliveryWaiverAuthority: async () => {},
    },
  });
  assert.equal(canonicalRecordJson(result.receipt), canonicalRecordJson(receipt));
  assert.equal(result.receipt.burnOid, burnOid);
});

test('close refuses a completed operation whose published receipt bytes differ', async () => {
  const { projectDeliveryRecords } =
    await import('../../../../task-tracker/lib/delivery-records.mjs');
  const { requireDeliveryReceipt, verifyCloseDeliveryReceipt } =
    await import('../../../../task-tracker/lib/close-delivery-receipt.mjs');
  const pullRequest = { ...input(pinnedIntent).pullRequest, headRefName: original.headRef };
  const records = projectDeliveryRecords([
    { id: 'original', createdAt, record: original },
    { id: 'pinned', createdAt: '2026-09-25T12:01:01.000Z', record: pinnedIntent },
    { id: 'receipt', createdAt: '2026-09-25T12:04:00.000Z', record: receipt },
  ]);
  const gateInput = {
    issueNumber: original.issueNumber,
    repository: original.repository,
    lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
    branch: original.headRef,
    acceptedSha: head,
    observedLocalHeadSha: head,
    headRelation: 'current',
    pullRequests: [pullRequest],
    pullRequest,
    records,
  };
  await assert.rejects(
    verifyCloseDeliveryReceipt({
      gateInput,
      receiptGate: requireDeliveryReceipt(gateInput),
      testReceiptSha: head,
      acceptedReviewSha: head,
      deps: {
        attributingCommits: input(pinnedIntent).attributingCommits,
        fetchOriginTrunk: input(pinnedIntent).fetchOriginTrunk,
        inspectMergeCommit: input(pinnedIntent).inspectMergeCommit,
        isAncestor: input(pinnedIntent).isAncestor,
        readWaiverJournal: async () => ({
          operations: new Map([
            [
              pinnedIntent.deliveryOperationId,
              {
                state: 'completed',
                burn,
                burnOid,
                intentPublication: {
                  originalIntentId: original.intentId,
                  originalIntentDigest: pinnedIntent.originalIntentDigest,
                  intentId: pinnedIntent.intentId,
                  intentBody: (
                    await import('../../../../task-tracker/lib/delivery-records.mjs')
                  ).renderDeliveryIntentComment(pinnedIntent),
                },
                publication: { receiptBody: 'tampered' },
              },
            ],
          ]),
        }),
        listWaiverRecords: async () => [{ envelope: grant, createdAt: grant.createdAt }],
        verifyStoredDeliveryWaiverAuthority: async () => {},
      },
    }),
    /burn-mismatch/
  );
});

test('historical authority rejects a replaced burn OID or a missing burn operation', async () => {
  const { projectDeliveryRecords } =
    await import('../../../../task-tracker/lib/delivery-records.mjs');
  const { verifyPinnedDeliveryWaiverAuthority } =
    await import('../../../../task-tracker/lib/close-delivery-receipt.mjs');
  const records = projectDeliveryRecords([
    { id: 'original', createdAt, record: original },
    { id: 'pinned', createdAt: '2026-09-25T12:01:01.000Z', record: pinnedIntent },
    { id: 'receipt', createdAt: '2026-09-25T12:04:00.000Z', record: receipt },
  ]);
  const gateInput = {
    issueNumber: original.issueNumber,
    repository: original.repository,
    records,
  };
  const publication = {
    originalIntentId: original.intentId,
    originalIntentDigest: pinnedIntent.originalIntentDigest,
    intentId: pinnedIntent.intentId,
    intentBody: (
      await import('../../../../task-tracker/lib/delivery-records.mjs')
    ).renderDeliveryIntentComment(pinnedIntent),
  };
  const validOperation = {
    state: 'completed',
    burn,
    burnOid,
    intentPublication: publication,
    publication: {
      receiptBody: (
        await import('../../../../task-tracker/lib/delivery-records.mjs')
      ).renderDeliveryReceiptComment(receipt),
    },
  };
  for (const operation of [null, { ...validOperation, burnOid: 'f'.repeat(40) }]) {
    await assert.rejects(
      verifyPinnedDeliveryWaiverAuthority({
        gateInput,
        intent: pinnedIntent,
        receipt,
        deps: {
          readWaiverJournal: async () => ({
            oid: 'f'.repeat(40),
            operations: new Map(operation ? [[pinnedIntent.deliveryOperationId, operation]] : []),
          }),
          listWaiverRecords: async () => [{ envelope: grant, createdAt: grant.createdAt }],
          verifyStoredDeliveryWaiverAuthority: async () => {},
        },
      }),
      /burn-mismatch/
    );
  }
});

test('PR waiver evidence cannot authorize either no-PR close lane', async () => {
  const { requireDeliveryReceipt } =
    await import('../../../../task-tracker/lib/close-delivery-receipt.mjs');
  const base = {
    issueNumber: original.issueNumber,
    repository: original.repository,
    body: '## User Story\n\nAs an operator I want an exact delivery.\n',
    branch: 'trunk',
    acceptedSha: head,
    pullRequests: [],
    records: {
      intents: [{ record: pinnedIntent }],
      receipts: [{ record: receipt }],
      liveIntent: { record: pinnedIntent },
      matchingReceipt: { record: receipt },
    },
  };
  assert.throws(
    () =>
      requireDeliveryReceipt({
        ...base,
        lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
      }),
    /ambiguous-pr/
  );
  const local = requireDeliveryReceipt({
    ...base,
    lineage: {
      parentIssueNumber: null,
      deliveryTarget: 'trunk',
      localTrunkLaneAuthorized: true,
    },
  });
  assert.deepEqual(local, { skipped: true, receipt: null });
});

test('reopened recovery admits a correlated v3/v4 current delivery pair', async () => {
  const { authorizeReopenedCloseRestart } =
    await import('../../../../task-tracker/lib/reopened-close-recovery.mjs');
  const { TERMINAL_CLOSE_STEPS } =
    await import('../../../../task-tracker/lib/close-convergence.mjs');
  const priorHead = 'e'.repeat(40);
  const priorIntent = buildDeliveryIntent({
    ...originalInput,
    expectedHeadSha: priorHead,
    commitMessage: originalInput.commitMessage.replaceAll(head, priorHead),
    intentId: id(9),
  });
  const priorReceipt = buildDeliveryReceipt({
    ...storedFacts.baseReceiptInput,
    intentId: priorIntent.intentId,
    expectedHeadSha: priorHead,
  });
  const oldPullRequest = {
    number: original.prNumber,
    merged: true,
    state: 'MERGED',
    headRefOid: priorHead,
    headRefName: original.headRef,
    baseRefName: 'trunk',
    mergeCommitSha: merge,
  };
  const currentPullRequest = { ...oldPullRequest, headRefOid: head };
  const request = {
    repository: original.repository,
    issueNumber: original.issueNumber,
    oldTransaction: {
      schema: 'aitm.delivered-close/v1',
      transactionId: 'old-tx',
      issueNumber: original.issueNumber,
      acceptedSha: priorHead,
      reviewAuthority: 'human-gate',
      completedSteps: [...TERMINAL_CLOSE_STEPS],
    },
    newAcceptedSha: head,
    newReviewAuthority: 'human-gate',
    actor: 'operator',
    live: {
      boardState: 'review',
      issueClosed: false,
      stateReason: 'reopened',
      terminalDisposition: 'Delivered',
      dirty: false,
      bindingOwnership: { authorized: true, disposition: 'own-post-close-claim' },
    },
    evidence: {
      historical: { pullRequest: oldPullRequest, intent: priorIntent, receipt: priorReceipt },
      current: {
        pullRequest: currentPullRequest,
        intent: pinnedIntent,
        receipt,
        originalIntent,
        testReceiptSha: head,
        reviewApprovedSha: head,
        verifiedDelivery: storedFacts.baseReceiptInput,
      },
    },
  };
  const result = authorizeReopenedCloseRestart(request);
  assert.equal(result.evidence.current.receipt.burnOid, burnOid);
  assert.throws(
    () =>
      authorizeReopenedCloseRestart({
        ...request,
        evidence: {
          ...request.evidence,
          current: {
            ...request.evidence.current,
            receipt: { ...receipt, schema: 'aitm.delivery-receipt/v1' },
          },
        },
      }),
    /current-evidence/
  );
});

test('false-delivery recovery admits a correlated v3/v4 current delivery pair', async () => {
  const { authorizeFalseDeliveryCloseRestart } =
    await import('../../../../task-tracker/lib/false-delivery-close-recovery.mjs');
  const { TERMINAL_CLOSE_STEPS } =
    await import('../../../../task-tracker/lib/close-convergence.mjs');
  const currentPullRequest = { ...input(pinnedIntent).pullRequest, headRefName: original.headRef };
  const request = {
    repository: original.repository,
    issueNumber: original.issueNumber,
    auditIssueNumber: 1900,
    recoveryIssueNumber: 1901,
    actor: 'operator',
    currentReviewAuthority: 'human-gate',
    oldTransaction: {
      schema: 'aitm.delivered-close/v1',
      transactionId: 'old-tx',
      issueNumber: original.issueNumber,
      acceptedSha: head,
      reviewAuthority: 'human-gate',
      completedSteps: [...TERMINAL_CLOSE_STEPS],
    },
    historicalNoCommit: {
      id: 'no-commit',
      createdAt: createdAt,
      record: {
        schema: 'aitm.no-commit-delivery/v1',
        result: 'delivered',
        repository: original.repository,
        issueNumber: original.issueNumber,
        issueKind: 'epic',
        acceptedSha: head,
        recordId: id(8),
        deliverableUrl: `https://github.com/${original.repository}/issues/${original.issueNumber}`,
      },
    },
    currentDelivery: {
      pullRequest: currentPullRequest,
      intent: pinnedIntent,
      receipt,
      originalIntent,
      testReceiptSha: head,
      reviewApprovedSha: head,
      verifiedDelivery: storedFacts.baseReceiptInput,
      sourceIntegration: null,
    },
    audit: {
      issueNumber: 1900,
      state: 'CLOSED',
      disposition: 'Delivered',
      deliverableUrl: `https://github.com/${original.repository}/issues/1900`,
      finding: {
        issueNumber: original.issueNumber,
        acceptedSha: head,
        classification: 'false-Done',
        recoveryIssueNumber: 1901,
      },
    },
    recovery: {
      issueNumber: 1901,
      state: 'OPEN',
      boardState: 'develop',
      assignees: ['operator'],
      marker: { auditIssueNumber: 1900, issueNumber: original.issueNumber },
    },
    live: {
      boardState: 'review',
      issueClosed: false,
      stateReason: 'reopened',
      terminalDisposition: 'Delivered',
      dirty: false,
      bindingOwnership: { authorized: true, disposition: 'own-post-close-claim' },
    },
  };
  const result = authorizeFalseDeliveryCloseRestart(request);
  assert.equal(result.currentDelivery.receipt.burnOid, burnOid);
});

test('deliver explanation projects a verified pinned waiver as v3 without effects', async () => {
  const { evaluateAction } =
    await import('../../../../task-tracker/lib/action-decision/evaluate.mjs');
  const { createObservationAttempt } =
    await import('../../../../task-tracker/lib/action-decision/observations.mjs');
  const { renderDeliveryIntentComment, renderDeliveryReceiptComment } =
    await import('../../../../task-tracker/lib/delivery-records.mjs');
  const body =
    '## User Story\n\nAs an operator I want an exact delivery waiver.\n\n## Scope\n\nThis merged pull request.\n\n## Acceptance Criteria\n\n- [x] Delivery is verified.\n';
  const pullRequest = {
    ...input(pinnedIntent).pullRequest,
    headRefName: original.headRef,
    isDraft: false,
    mergeable: 'MERGEABLE',
  };
  const preflightInput = {
    issue: {
      number: original.issueNumber,
      state: 'OPEN',
      projectState: 'Review',
      body,
      assignees: ['operator'],
      agentReviewPassed: true,
      reviewAuthorization: { mode: 'full-auto', standing: true, source: 'test' },
    },
    binding: { issueNumber: original.issueNumber, branch: original.headRef, timerState: 'running' },
    lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
    pullRequests: [pullRequest],
    localHeadSha: head,
    testReceiptSha: head,
    acceptedReviewSha: head,
    checks: {
      readable: true,
      required: [{ name: 'ci', headSha: head, status: 'COMPLETED', conclusion: 'SUCCESS' }],
    },
    dirtyPaths: [],
    config: {
      repo: original.repository,
      assignee: 'operator',
      trunkRef: 'origin/trunk',
      repositoryMergeMethods: ['squash'],
      fullAutoMerge: { mechanism: 'provider-action', mergeMethod: 'squash' },
    },
    commitSubjects: [original.commitTitle],
  };
  const comments = [
    { id: 'original', createdAt, body: renderDeliveryIntentComment(original) },
    {
      id: 'pinned',
      createdAt: '2026-09-25T12:01:01.000Z',
      body: renderDeliveryIntentComment(pinnedIntent),
    },
    {
      id: 'receipt',
      createdAt: '2026-09-25T12:04:00.000Z',
      body: renderDeliveryReceiptComment(receipt),
    },
  ];
  let writes = 0;
  const attempt = createObservationAttempt({
    repository: original.repository,
    issue: original.issueNumber,
    boundaryId: `action:deliver:${original.issueNumber}`,
    now: () => '2026-09-25T12:05:00.000Z',
    read: async (request) => ({
      ...request,
      value:
        request.resource === 'issue-body'
          ? { number: original.issueNumber, body }
          : {
              preflightInput,
              providerActionAvailable: false,
              manualReviewDecision: { status: 'authorized' },
              comments,
              mergedProof: {
                status: 'verified',
                expectedHeadSha: head,
                mergeCommitSha: merge,
                trunkHeadSha: 'f'.repeat(40),
                metadataWarnings: [],
                deliveryDisposition: 'waived',
                category: 'merge-method',
                requirementId: 'delivery.verification.merge-method',
              },
            },
    }),
  });
  const decision = await evaluateAction({
    actionId: 'deliver',
    repository: original.repository,
    issue: original.issueNumber,
    inputs: { state: 'review', head, body },
    attempt,
    deps: {
      effectAttempts: () => {
        writes += 0;
        return [];
      },
    },
  });
  assert.equal(decision.schema, 'aitm.action-decision/v3', JSON.stringify(decision));
  assert.deepEqual(decision.deliveryExceptions, [
    {
      category: 'merge-method',
      requirementId: 'delivery.verification.merge-method',
      outcome: 'waived',
    },
  ]);
  assert.equal(writes, 0);
  const { readOnlyMergedProof } =
    await import('../../../../task-tracker/lib/action-decision/deliver.mjs');
  const proof = await readOnlyMergedProof({
    issue: original.issueNumber,
    preflightInput,
    comments: [
      ...comments,
      {
        id: 'grant',
        createdAt: grant.createdAt,
        body: (
          await import('../../../../task-tracker/lib/github-records/record-envelope.mjs')
        ).renderAitmRecord({ envelope: grant }),
      },
    ],
    deps: {
      fetchRemoteTrunkHeadSha: async () => 'f'.repeat(40),
      resolveLocalTrunkHeadSha: async () => 'f'.repeat(40),
      isAncestor: input(pinnedIntent).isAncestor,
      inspectMergeCommit: input(pinnedIntent).inspectMergeCommit,
      attributingCommits: input(pinnedIntent).attributingCommits,
      readWaiverJournal: async () => ({
        operations: new Map([
          [
            pinnedIntent.deliveryOperationId,
            {
              state: 'completed',
              burn,
              burnOid,
              intentPublication: {
                originalIntentId: original.intentId,
                originalIntentDigest: pinnedIntent.originalIntentDigest,
                intentId: pinnedIntent.intentId,
                intentBody: renderDeliveryIntentComment(pinnedIntent),
              },
              publication: { receiptBody: renderDeliveryReceiptComment(receipt) },
            },
          ],
        ]),
      }),
      verifyStoredDeliveryWaiverAuthority: async () => {},
      effectAttempts: () => {
        throw new Error('effect requested');
      },
    },
  });
  assert.equal(proof.status, 'verified', JSON.stringify(proof));
  assert.equal(proof.deliveryDisposition, 'waived');
});

test('close explanation distinguishes a verified pinned waiver without effects', async () => {
  const { collectCloseReadiness } =
    await import('../../../../task-tracker/lib/action-decision/close.mjs');
  const { createObservationAttempt } =
    await import('../../../../task-tracker/lib/action-decision/observations.mjs');
  const { computeScopeIdentity } =
    await import('../../../../task-tracker/lib/workflow-policy/scope-identity.mjs');
  const { projectDeliveryRecords } =
    await import('../../../../task-tracker/lib/delivery-records.mjs');
  const body =
    '## User Story\n\nAs an operator I want exact close.\n\n## Scope\n\nThis issue.\n\n## Acceptance Criteria\n\n- [x] Verified.\n\n<!-- aitm-last-known-state state="review" ts="2026-09-25T12:04:00.000Z" -->';
  const pullRequest = { ...input(pinnedIntent).pullRequest, headRefName: original.headRef };
  const records = projectDeliveryRecords([
    { id: 'original', createdAt, record: original },
    { id: 'pinned', createdAt: '2026-09-25T12:01:01.000Z', record: pinnedIntent },
    { id: 'receipt', createdAt: '2026-09-25T12:04:00.000Z', record: receipt },
  ]);
  const delivery = {
    mode: 'ordinary',
    gateInput: {
      issueNumber: original.issueNumber,
      repository: original.repository,
      body,
      branch: original.headRef,
      acceptedSha: head,
      lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
      pullRequests: [pullRequest],
      records,
    },
  };
  const values = {
    'issue-body': { number: original.issueNumber, body, state: 'OPEN' },
    'project-board': { state: 'review' },
    worktree: { matches: true, headSha: head },
    [`evidence:${original.issueNumber}:1`]: delivery,
    [`evidence:${original.issueNumber}:2`]: {
      status: 'attributed',
      tip: {
        objectComplete: true,
        shallow: false,
        sha: head,
        ref: 'refs/heads/trunk',
        remote: 'origin',
      },
    },
    [`evidence:${original.issueNumber}:3`]: { complete: true, children: [] },
  };
  const attempt = createObservationAttempt({
    repository: original.repository,
    issue: original.issueNumber,
    boundaryId: `action:close:${original.issueNumber}`,
    now: () => '2026-09-25T12:05:00.000Z',
    read: async (request) => ({
      ...request,
      value: values[request.identity] ?? values[request.resource],
    }),
  });
  let writes = 0;
  const result = await collectCloseReadiness({
    issue: original.issueNumber,
    attempt,
    ports: {
      scope: computeScopeIdentity({
        repository: original.repository,
        issue: original.issueNumber,
        body,
      }),
      cfg: { repo: original.repository },
      head,
      evaluatedAt: '2026-09-25T12:05:00.000Z',
      runGuards: async () => ({ ok: true, status: 'ready', refusals: [], humanDecision: null }),
      verifyWaiverReceipt: async () => ({ outcome: 'waived', receipt }),
      writeIssue: () => {
        writes += 1;
      },
    },
  });
  assert.equal(result.status, 'ready', JSON.stringify(result));
  assert.deepEqual(result.deliveryExceptions, [
    {
      category: 'merge-method',
      requirementId: 'delivery.verification.merge-method',
      outcome: 'waived',
    },
  ]);
  assert.equal(writes, 0);
});
