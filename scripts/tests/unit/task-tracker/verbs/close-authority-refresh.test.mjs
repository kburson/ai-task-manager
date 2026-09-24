// @story #1669
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as closeModule from '../../../../task-tracker/verbs/close.mjs';

const HEAD = 'a'.repeat(40);
const assertCloseDeliveryAuthorityStable = closeModule.assertCloseDeliveryAuthorityStable;

test('close exposes a fresh authority comparison for terminal effects', () => {
  assert.equal(typeof assertCloseDeliveryAuthorityStable, 'function');
});

function authority() {
  return {
    authorization: { mode: 'full-auto', approvedSha: HEAD },
    gateInput: {
      body: '<!-- changing derived DoD marker is not delivery authority -->',
      acceptedSha: HEAD,
      lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
      branch: 'feature/epic/1558',
      reviewAuthority: { outcome: 'passed', acceptedSha: HEAD },
      observedLocalHeadSha: HEAD,
      headRelation: 'current',
      pullRequests: [{ number: 70, headRefOid: HEAD, state: 'MERGED' }],
      records: { liveIntent: { record: { intentId: 'intent-1', expectedHeadSha: HEAD } } },
      noCommitRecords: null,
    },
    receipt: { mode: 'pr', receipt: { intentId: 'intent-1', expectedHeadSha: HEAD } },
    testReceiptSha: HEAD,
    acceptedReviewSha: HEAD,
    recoveryReviewApprovedSha: HEAD,
  };
}

test('a derived body marker alone does not invalidate a fresh close delivery gate', () => {
  const before = authority();
  const after = authority();
  after.gateInput.body = '<!-- newly stamped derived DoD marker -->';
  assert.doesNotThrow(() => assertCloseDeliveryAuthorityStable(before, after));
});

test('revoked review authority refuses before a terminal close effect', () => {
  const before = authority();
  const after = authority();
  after.gateInput.reviewAuthority.outcome = 'missing';
  assert.throws(() => assertCloseDeliveryAuthorityStable(before, after), /close-authority-drift/);
});

test('same intent ID with changed authorized bytes refuses before a terminal close effect', () => {
  const before = authority();
  const after = authority();
  after.gateInput.records.liveIntent.record.expectedHeadSha = 'b'.repeat(40);
  assert.throws(() => assertCloseDeliveryAuthorityStable(before, after), /close-authority-drift/);
});

test('changed PR head or delivery receipt refuses before a terminal close effect', () => {
  const before = authority();
  const changedHead = authority();
  changedHead.gateInput.pullRequests[0].headRefOid = 'b'.repeat(40);
  assert.throws(
    () => assertCloseDeliveryAuthorityStable(before, changedHead),
    /close-authority-drift/
  );
  const changedReceipt = authority();
  changedReceipt.receipt.receipt.expectedHeadSha = 'b'.repeat(40);
  assert.throws(
    () => assertCloseDeliveryAuthorityStable(before, changedReceipt),
    /close-authority-drift/
  );
});
