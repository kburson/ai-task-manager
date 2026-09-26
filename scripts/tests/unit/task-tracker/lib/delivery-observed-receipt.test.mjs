// @story #1812
// cspell:ignore ACNTK CVXXBEB
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
  parseDeliveryComment,
  projectDeliveryRecords,
  renderDeliveryIntentComment,
  renderDeliveryReceiptComment,
} from '../../../../task-tracker/lib/delivery-records.mjs';
import { verifyDeliveredPullRequest } from '../../../../task-tracker/lib/delivery-verification.mjs';
import { verifyCloseDeliveryReceipt } from '../../../../task-tracker/lib/close-delivery-receipt.mjs';

const head = 'edaa8e402f340af3ca15b5b36ec845b038040d58';
const merge = 'c862f2ba6e6d1a278fa0525f2a79599a5cc9a818';
const base = '6363654f9b7310b4477e4b27870830ded0a00389';
const tree = 'f6efaa724e7502761c26c8b2d146a5f3b5e43266';
const sourceBase = '1'.repeat(40);
const branch = 'claude/1755-final-acceptance-ad486a';
const title = `Merge pull request #1785 from kburson/${branch}`;
const message = '[#1784] docs(peer-review): record terminal acceptance for the #1755 specification';
const mergedAt = '2026-09-24T00:00:00.000Z';
const createdAt = '2026-09-23T00:00:00.000Z';

function fixture(overrides = {}) {
  const intent = buildDeliveryIntent({
    intentId: '01M3ACNTK2CVXXBEB777ZR3BG7',
    supersedesIntentId: null,
    issueNumber: 1784,
    repository: 'kburson/ai-task-manager',
    prNumber: 1785,
    baseRef: 'trunk',
    headRef: branch,
    expectedHeadSha: head,
    mergeMethod: 'squash',
    attributionTokens: ['#1784'],
    commitTitle: '[#1784] Governed PR delivery',
    commitMessage: `PR #1785\nSource: ${head}\n\nAttribution: [#1784]`,
    provider: 'claude',
    sessionId: 'session-1784',
    clientCreatedAt: createdAt,
  });
  const pullRequest = {
    number: 1785,
    state: 'MERGED',
    merged: true,
    baseRefName: 'trunk',
    headRefName: branch,
    headRefOid: head,
    mergeCommitSha: merge,
    mergeMethod: 'merge',
    mergedAt,
    headRefDeleted: false,
    sourceCommitsComplete: true,
    sourceCommitsHeadSha: head,
    sourceCommits: [{ oid: head, messageHeadline: '[#1784] source' }],
    sourceCommitEvidence: [
      { oid: head, tree: '2'.repeat(40), parents: [sourceBase], message: '[#1784] source' },
    ],
  };
  const deps = {
    fetchOriginTrunk: async () => {},
    isAncestor: async () => true,
    inspectMergeCommit: async () => ({
      parents: [base, head],
      tree,
      commitTitle: title,
      commitMessage: message,
    }),
    compareDeliveryContent: async () => true,
    resolveTrunkHeadSha: async () => '3'.repeat(40),
    attributingCommits: async () => {
      throw new Error('subject fallback is forbidden');
    },
  };
  return {
    acceptedSha: head,
    acceptedReviewSha: head,
    intent,
    intentCreatedAt: createdAt,
    localHeadSha: head,
    pullRequest,
    recovery: false,
    testReceiptSha: head,
    ...deps,
    ...overrides,
  };
}

test('original #1784 squash preference yields observed merge receipt and Close replay', async () => {
  const input = fixture();
  const verified = await verifyDeliveredPullRequest(input);
  const receipt = buildDeliveryReceipt(verified.receiptInput);
  assert.equal(input.intent.mergeMethod, 'squash');
  assert.equal(input.intent.commitTitle, '[#1784] Governed PR delivery');
  assert.equal(receipt.schema, 'aitm.delivery-receipt/v5');
  assert.equal(receipt.mergeMethod, 'merge');
  assert.equal(receipt.observedIntegration.commitTitle, title);
  assert.equal(receipt.observedIntegration.commitMessage, message);
  assert.deepEqual(receipt.metadataWarnings, ['missing-merge-attribution-trailer']);
  const gateInput = {
    acceptedSha: head,
    observedLocalHeadSha: head,
    headRelation: 'current',
    pullRequest: input.pullRequest,
    records: { liveIntent: { record: input.intent, createdAt }, intents: [] },
  };
  const replay = await verifyCloseDeliveryReceipt({
    gateInput,
    receiptGate: { receipt },
    testReceiptSha: head,
    acceptedReviewSha: head,
    deps: input,
  });
  assert.equal(replay.receipt, receipt);
  await assert.rejects(
    () =>
      verifyCloseDeliveryReceipt({
        gateInput,
        receiptGate: { receipt: { ...receipt, sourceDigest: `sha256:${'f'.repeat(64)}` } },
        testReceiptSha: head,
        acceptedReviewSha: head,
        deps: input,
      }),
    (error) => error.message.includes('fresh-receipt-mismatch')
  );
});

test('Close rejects changes to any observed receipt authority', async () => {
  const input = fixture();
  const receipt = buildDeliveryReceipt((await verifyDeliveredPullRequest(input)).receiptInput);
  const gateInput = {
    acceptedSha: head,
    observedLocalHeadSha: head,
    headRelation: 'current',
    pullRequest: input.pullRequest,
    records: { liveIntent: { record: input.intent, createdAt }, intents: [] },
  };
  const changed = {
    method: { ...receipt, mergeMethod: 'squash' },
    parent: {
      ...receipt,
      observedIntegration: { ...receipt.observedIntegration, parents: [sourceBase, head] },
    },
    tree: {
      ...receipt,
      observedIntegration: { ...receipt.observedIntegration, tree: '4'.repeat(40) },
    },
    title: {
      ...receipt,
      observedIntegration: { ...receipt.observedIntegration, commitTitle: 'changed' },
    },
    message: {
      ...receipt,
      observedIntegration: { ...receipt.observedIntegration, commitMessage: 'changed' },
    },
    head: { ...receipt, expectedHeadSha: '5'.repeat(40) },
    digest: { ...receipt, sourceDigest: `sha256:${'6'.repeat(64)}` },
    proof: {
      ...receipt,
      observedIntegration: {
        ...receipt.observedIntegration,
        contentProof: {
          ...receipt.observedIntegration.contentProof,
          sourceBase: '7'.repeat(40),
        },
      },
    },
  };
  for (const [field, candidate] of Object.entries(changed)) {
    await assert.rejects(
      () =>
        verifyCloseDeliveryReceipt({
          gateInput,
          receiptGate: { receipt: candidate },
          testReceiptSha: head,
          acceptedReviewSha: head,
          deps: input,
        }),
      (error) => error.message.includes('fresh-receipt-mismatch'),
      field
    );
  }
});

test('observed receipt refuses incomplete source, changed content, and unreachable trunk', async () => {
  const incomplete = fixture();
  incomplete.pullRequest.sourceCommitsComplete = false;
  const changed = fixture({ compareDeliveryContent: async () => false });
  const unreachable = fixture({ isAncestor: async () => false });
  for (const candidate of [incomplete, changed, unreachable]) {
    await assert.rejects(
      () => verifyDeliveredPullRequest(candidate),
      (error) =>
        error.category === 'merge-method-evidence' || error.category === 'trunk-reachability'
    );
  }
});

test('observed wording may vary but the issue claim cannot conflict', async () => {
  const custom = fixture({
    inspectMergeCommit: async () => ({
      parents: [base, head],
      tree,
      commitTitle: 'Integrate reviewed change',
      commitMessage: '[#1784] reviewed change landed',
    }),
  });
  const receipt = buildDeliveryReceipt((await verifyDeliveredPullRequest(custom)).receiptInput);
  assert.equal(receipt.observedIntegration.commitTitle, 'Integrate reviewed change');
  const conflict = fixture({
    inspectMergeCommit: async () => ({
      parents: [base, head],
      tree,
      commitTitle: 'Integrate reviewed change',
      commitMessage: '[#1784] reviewed change landed with [#9999]',
    }),
  });
  await assert.rejects(
    () => verifyDeliveredPullRequest(conflict),
    (error) => error.category === 'attribution'
  );
});

test('v5 intent and receipt project as one immutable operation', async () => {
  const input = fixture();
  const receipt = buildDeliveryReceipt((await verifyDeliveredPullRequest(input)).receiptInput);
  const context = { repository: input.intent.repository, issueNumber: 1784, prNumber: 1785 };
  const intentComment = parseDeliveryComment(
    {
      id: 'intent',
      createdAt,
      body: renderDeliveryIntentComment(input.intent),
    },
    context
  );
  const receiptComment = parseDeliveryComment(
    {
      id: 'receipt',
      createdAt: mergedAt,
      body: renderDeliveryReceiptComment(receipt),
    },
    context
  );
  const projected = projectDeliveryRecords([intentComment, receiptComment]);
  assert.equal(projected.matchingReceipt.record, projected.receipts[0].record);
  assert.equal(projected.matchingReceipt.record.schema, 'aitm.delivery-receipt/v5');
  assert.throws(
    () =>
      projectDeliveryRecords([
        intentComment,
        receiptComment,
        {
          ...receiptComment,
          id: 'duplicate',
        },
      ]),
    (error) => error.message.includes('duplicate-receipt')
  );
});
