// @story #1813
// cspell:ignore ACNTK CVXXBEB
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { createDefaultDeliverDeps, runDeliver } from '../../../task-tracker/verbs/deliver.mjs';
import { verifyCloseDeliveryReceipt } from '../../../task-tracker/lib/close-delivery-receipt.mjs';
import {
  buildDeliveryIntent,
  renderDeliveryIntentComment,
} from '../../../task-tracker/lib/delivery-records.mjs';
import { makeHarness, cfg } from '../../unit/task-tracker/verbs/deliver-test-harness.mjs';

test('actual #1784 intent and #1785 merge deliver and replay without consuming its historical waiver', async () => {
  const acceptedHead = 'edaa8e402f340af3ca15b5b36ec845b038040d58';
  const mergeSha = 'c862f2ba6e6d1a278fa0525f2a79599a5cc9a818';
  const firstParent = '6363654f9b7310b4477e4b27870830ded0a00389';
  const tree = 'f6efaa724e7502761c26c8b2d146a5f3b5e43266';
  const sourceBase = firstParent;
  const sourceMessage = execFileSync('git', ['show', '-s', '--format=%B', acceptedHead], {
    encoding: 'utf8',
  }).trimEnd();
  const sourceHeadline = sourceMessage.split('\n')[0];
  const branch = 'claude/1755-final-acceptance-ad486a';
  const commitTitle = `Merge pull request #1785 from kburson/${branch}`;
  const commitMessage =
    '[#1784] docs(peer-review): record terminal acceptance for the #1755 specification';
  const createdAt = '2026-09-23T00:00:00.000Z';
  const intent = buildDeliveryIntent({
    intentId: '01M3ACNTK2CVXXBEB777ZR3BG7',
    supersedesIntentId: null,
    issueNumber: 1784,
    repository: cfg().repo,
    prNumber: 1785,
    baseRef: 'trunk',
    headRef: branch,
    expectedHeadSha: acceptedHead,
    mergeMethod: 'squash',
    attributionTokens: ['#1784'],
    commitTitle: '[#1784] Governed PR delivery',
    commitMessage: `PR #1785\nSource: ${acceptedHead}\n\nAttribution: [#1784]`,
    provider: 'claude',
    sessionId: 'session-1784',
    clientCreatedAt: createdAt,
  });
  const historicalWaiver = {
    id: 'prior-waiver',
    createdAt,
    updatedAt: createdAt,
    body: 'Historical method waiver request; no grant consumed.',
  };
  const harness = makeHarness({
    issueNumber: 1784,
    prNumber: 1785,
    branch,
    head: acceptedHead,
    prHead: acceptedHead,
    mergeCommitSha: mergeSha,
    prState: 'MERGED',
    mergedAt: '2026-09-24T00:00:00.000Z',
    prMergeMethod: 'merge',
    historyMergeMethod: 'merge',
    commitSubjects: [sourceHeadline],
    prSourceCommits: [{ oid: acceptedHead, messageHeadline: sourceHeadline }],
    prSourceEvidence: [{ oid: acceptedHead, tree, parents: [sourceBase], message: sourceMessage }],
    comments: [
      {
        id: 'original-intent',
        createdAt,
        updatedAt: createdAt,
        body: renderDeliveryIntentComment(intent),
      },
      historicalWaiver,
    ],
  });
  const gitDeps = createDefaultDeliverDeps({ projectDir: process.cwd(), cfg: cfg() });
  harness.deps.inspectMergeCommit = gitDeps.inspectMergeCommit;
  harness.deps.isAncestor = gitDeps.isAncestor;
  harness.deps.compareDeliveryContent = gitDeps.compareDeliveryContent;
  harness.deps.resolveLocalTrunkHeadSha = async () => mergeSha;
  harness.deps.resolveTrunkHeadSha = harness.deps.resolveLocalTrunkHeadSha;
  const delivered = await runDeliver({
    issueNumber: 1784,
    cfg: cfg(),
    state: { active: '#1784', entryStartTs: createdAt },
    deps: harness.deps,
  });
  assert.equal(delivered.status, 'delivered');
  assert.equal(delivered.receipt.schema, 'aitm.delivery-receipt/v5');
  assert.equal(delivered.receipt.mergeMethod, 'merge');
  assert.equal(delivered.receipt.observedIntegration.commitTitle, commitTitle);
  assert.equal(delivered.receipt.observedIntegration.commitMessage, commitMessage);
  assert.equal(
    harness.data.comments.some(({ id }) => id === 'prior-waiver'),
    true
  );
  assert.equal(harness.calls.createIssueComment, 1);
  const pullRequest = await harness.deps.fetchPullRequest({ prNumber: 1785 });
  const replay = await verifyCloseDeliveryReceipt({
    gateInput: {
      acceptedSha: acceptedHead,
      observedLocalHeadSha: acceptedHead,
      headRelation: 'current',
      pullRequest,
      records: { liveIntent: { record: intent, createdAt }, intents: [] },
    },
    receiptGate: { receipt: delivered.receipt },
    testReceiptSha: acceptedHead,
    acceptedReviewSha: acceptedHead,
    deps: harness.deps,
  });
  assert.equal(replay.receipt, delivered.receipt);
});
