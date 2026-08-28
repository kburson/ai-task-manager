// @story #939
import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSingleDeliveredEvidence } from '../../../../task-tracker/lib/delivery-incident-reconciliation.mjs';
import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
  renderDeliveryIntentComment,
  renderDeliveryReceiptComment,
} from '../../../../task-tracker/lib/delivery-records.mjs';

test('delivered evidence selects the one pair matching the accepted head across reused-branch history', () => {
  const issueNumber = 1381;
  const repository = 'kburson/ai-task-manager';
  const deliveries = [
    {
      prNumber: 1424,
      head: 'b'.repeat(40),
      merge: 'c'.repeat(40),
      intentId: '01ARZ3NDEKTSV4RRFFQ69G5FA1',
    },
    {
      prNumber: 1427,
      head: 'd'.repeat(40),
      merge: 'e'.repeat(40),
      intentId: '01ARZ3NDEKTSV4RRFFQ69G5FA2',
    },
  ];
  const comments = deliveries.flatMap(({ prNumber, head, merge, intentId }, index) => {
    const intent = buildDeliveryIntent({
      intentId,
      supersedesIntentId: null,
      issueNumber,
      repository,
      prNumber,
      baseRef: 'trunk',
      headRef: 'codex/1381-governed-delivery-convergence-spec',
      expectedHeadSha: head,
      mergeMethod: 'squash',
      attributionTokens: ['#1381'],
      commitTitle: '[#1381] Governed PR delivery',
      commitMessage: `PR #${prNumber}\nSource: ${head}\n\nAttribution: [#1381]`,
      provider: 'codex',
      sessionId: 'incident-convergence',
      clientCreatedAt: `2026-08-28T00:0${index}:00.000Z`,
    });
    const receipt = buildDeliveryReceipt({
      intentId,
      issueNumber,
      prNumber,
      expectedHeadSha: head,
      mergeCommitSha: merge,
      baseRef: 'trunk',
      mergeMethod: 'squash',
      verifiedTrunkRef: 'origin/trunk',
      provider: 'codex',
      sessionId: 'incident-convergence',
      verifiedAt: `2026-08-28T00:0${index}:30.000Z`,
    });
    return [
      {
        id: `intent-${index}`,
        url: `https://github.com/kburson/ai-task-manager/issues/1381#issuecomment-intent-${index}`,
        body: renderDeliveryIntentComment(intent),
        createdAt: `2026-08-28T00:0${index}:00.000Z`,
      },
      {
        id: `receipt-${index}`,
        url: `https://github.com/kburson/ai-task-manager/issues/1381#issuecomment-receipt-${index}`,
        body: renderDeliveryReceiptComment(receipt),
        createdAt: `2026-08-28T00:0${index}:30.000Z`,
      },
    ];
  });

  assert.throws(
    () => resolveSingleDeliveredEvidence({ comments, repository, issueNumber }),
    /stale-observation/
  );
  const selected = resolveSingleDeliveredEvidence({
    comments,
    repository,
    issueNumber,
    expectedHeadSha: deliveries[1].head,
  });
  assert.equal(selected.prNumber, deliveries[1].prNumber);
  assert.equal(selected.expectedHeadSha, deliveries[1].head);
  assert.equal(selected.mergeCommitSha, deliveries[1].merge);
});
