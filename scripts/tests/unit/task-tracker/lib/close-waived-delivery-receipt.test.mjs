// @story #1558
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
  projectDeliveryRecords,
} from '../../../../task-tracker/lib/delivery-records.mjs';
import { buildDeliveryAttributionProposal } from '../../../../task-tracker/lib/delivery-attribution-exception-record.mjs';
import { canonicalSourceInventory } from '../../../../task-tracker/lib/delivery-attribution-exception.mjs';
import { verifyDeliveredPullRequest } from '../../../../task-tracker/lib/delivery-verification.mjs';
import {
  requireDeliveryReceipt,
  verifyCloseDeliveryReceipt,
} from '../../../../task-tracker/lib/close-delivery-receipt.mjs';

const HEAD = 'a'.repeat(40);
const MERGE = 'b'.repeat(40);
const INTENT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const TITLE = '[#1558] Governed PR delivery';
const MESSAGE = `PR #1775\nSource: ${HEAD}\n\nAttribution: [#1558]`;

async function fixture() {
  const commits = [{ oid: HEAD, messageHeadline: 'legacy source' }];
  const sourceDigest = canonicalSourceInventory(commits, HEAD).sourceDigest;
  const mappings = [{ oid: HEAD, messageHeadline: 'legacy source', issueNumber: 1558 }];
  const built = buildDeliveryAttributionProposal({
    exceptionId: '01M2H000000000000000000003',
    operationId: '01M2H000000000000000000002',
    repository: 'kburson/ai-task-manager',
    issueNumber: 1558,
    prNumber: 1775,
    baseRef: 'trunk',
    headRef: 'feature/epic/1558',
    headSha: HEAD,
    sourceDigest,
    mappings,
    attributionTokens: ['#1558'],
    expiresAt: '2026-09-25T00:00:00.000Z',
  });
  const exceptionRecord = {
    schema: 'aitm.delivery-attribution-exception/v1',
    kind: 'grant',
    recordId: '01M2H000000000000000000003',
    predecessorId: null,
    proposal: built.proposal,
    proposalDigest: built.proposalDigest,
    authority: {
      sourceReference: 'codex-session/v1:turn-10',
      statement: 'Authorize this mapping',
      actor: 'kpburson',
      level: 'host-verified-user-message',
    },
    createdAt: '2026-09-23T00:00:00.000Z',
  };
  const intent = buildDeliveryIntent({
    intentId: INTENT_ID,
    supersedesIntentId: null,
    issueNumber: 1558,
    repository: 'kburson/ai-task-manager',
    prNumber: 1775,
    baseRef: 'trunk',
    headRef: 'feature/epic/1558',
    expectedHeadSha: HEAD,
    mergeMethod: 'squash',
    attributionTokens: ['#1558'],
    commitTitle: TITLE,
    commitMessage: MESSAGE,
    provider: 'codex',
    sessionId: 'session-1558',
    clientCreatedAt: '2026-09-24T01:00:00.000Z',
    attributionDisposition: 'waived',
    exceptionRecordId: exceptionRecord.recordId,
    operationId: built.proposal.operationId,
    sourceDigest,
    proposalDigest: built.proposalDigest,
    mappings,
  });
  const pullRequest = {
    number: 1775,
    state: 'MERGED',
    merged: true,
    baseRefName: 'trunk',
    headRefName: 'feature/epic/1558',
    headRefOid: HEAD,
    mergeCommitSha: MERGE,
    mergeCommit: { oid: MERGE },
    mergedAt: '2026-09-24T01:01:00.000Z',
    mergeMethod: 'squash',
    headRefDeleted: false,
  };
  const deps = {
    fetchOriginTrunk: async () => {},
    isAncestor: async () => true,
    inspectMergeCommit: async () => ({
      parents: ['c'.repeat(40)],
      commitTitle: TITLE,
      commitMessage: MESSAGE,
    }),
    attributingCommits: async () => [],
  };
  const sourceInventory = { commits, attributableCommits: commits, verifiedMergeShas: [] };
  const verified = await verifyDeliveredPullRequest({
    acceptedSha: HEAD,
    acceptedReviewSha: HEAD,
    ...deps,
    intent,
    intentCreatedAt: '2026-09-24T01:00:01.000Z',
    localHeadSha: HEAD,
    pullRequest,
    recovery: false,
    testReceiptSha: HEAD,
    waivedEvidence: { sourceInventory, exceptionRecord },
  });
  const receipt = buildDeliveryReceipt(verified.receiptInput);
  const records = projectDeliveryRecords([
    { id: 'intent', createdAt: '2026-09-24T01:00:01.000Z', record: intent },
    { id: 'receipt', createdAt: '2026-09-24T01:01:01.000Z', record: receipt },
  ]);
  const gateInput = {
    issueNumber: 1558,
    lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
    branch: 'feature/epic/1558',
    acceptedSha: HEAD,
    observedLocalHeadSha: HEAD,
    headRelation: 'current',
    pullRequests: [pullRequest],
    pullRequest,
    records,
    sourceInventory,
  };
  return { gateInput, receiptGate: requireDeliveryReceipt(gateInput), deps };
}

test('Close freshly verifies a waived delivery receipt with its live source inventory', async () => {
  const { gateInput, receiptGate, deps } = await fixture();
  const result = await verifyCloseDeliveryReceipt({
    gateInput,
    receiptGate,
    testReceiptSha: HEAD,
    acceptedReviewSha: HEAD,
    deps,
  });
  assert.equal(result.receipt.attributionDisposition, 'waived');
});

test('Close refuses a waived receipt when the live source inventory changes', async () => {
  const { gateInput, receiptGate, deps } = await fixture();
  gateInput.sourceInventory = {
    ...gateInput.sourceInventory,
    commits: [{ oid: HEAD, messageHeadline: 'changed source' }],
  };
  await assert.rejects(
    verifyCloseDeliveryReceipt({
      gateInput,
      receiptGate,
      testReceiptSha: HEAD,
      acceptedReviewSha: HEAD,
      deps,
    }),
    /waived-authority/
  );
});
