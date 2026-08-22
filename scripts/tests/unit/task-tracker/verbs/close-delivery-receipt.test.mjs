// @story #939
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
  projectDeliveryRecords,
} from '../../../../task-tracker/lib/delivery-records.mjs';
import {
  requireDeliveryReceipt,
  resolveAcceptedDeliveryHead,
} from '../../../../task-tracker/lib/close-delivery-receipt.mjs';

const HEAD = 'a'.repeat(40);
const MERGE = 'b'.repeat(40);
// cspell:disable-next-line
const INTENT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

function parsed(record, id, createdAt) {
  return { id, createdAt, record };
}

function validRecords({ expectedHeadSha = HEAD, prNumber = 1400 } = {}) {
  const intent = buildDeliveryIntent({
    intentId: INTENT_ID,
    supersedesIntentId: null,
    issueNumber: 939,
    repository: 'kburson/ai-task-manager',
    prNumber,
    baseRef: 'trunk',
    headRef: 'codex/939-full-auto-merge',
    expectedHeadSha,
    mergeMethod: 'squash',
    attributionTokens: ['#939'],
    commitTitle: '[#939] Governed PR delivery',
    commitMessage: `PR #${prNumber}\nSource: ${expectedHeadSha}\n\nAttribution: [#939]`,
    provider: 'codex',
    sessionId: 'session-1',
    clientCreatedAt: '2026-08-22T00:00:00.000Z',
  });
  const receipt = buildDeliveryReceipt({
    intentId: INTENT_ID,
    issueNumber: 939,
    prNumber,
    expectedHeadSha,
    mergeCommitSha: MERGE,
    baseRef: 'trunk',
    mergeMethod: 'squash',
    verifiedTrunkRef: 'origin/trunk',
    provider: 'codex',
    sessionId: 'session-1',
    verifiedAt: '2026-08-22T00:02:00.000Z',
  });
  return projectDeliveryRecords([
    parsed(intent, 'intent-comment', '2026-08-22T00:00:01.000Z'),
    parsed(receipt, 'receipt-comment', '2026-08-22T00:02:01.000Z'),
  ]);
}

function input(overrides = {}) {
  return {
    issueNumber: 939,
    lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
    branch: 'codex/939-full-auto-merge',
    acceptedSha: HEAD,
    pullRequests: [
      {
        number: 1400,
        state: 'MERGED',
        merged: true,
        headRefName: 'codex/939-full-auto-merge',
        headRefOid: HEAD,
        baseRefName: 'trunk',
        mergeCommitSha: MERGE,
      },
    ],
    records: validRecords(),
    ...overrides,
  };
}

test('valid exact-head delivery receipt authorizes close', () => {
  const result = requireDeliveryReceipt(input());
  assert.equal(result.skipped, false);
  assert.equal(result.receipt.expectedHeadSha, HEAD);
  assert.ok(Object.isFrozen(result));
});

test('accepted delivery head requires current Test and Agent Review evidence', () => {
  assert.equal(
    resolveAcceptedDeliveryHead({
      localHeadSha: HEAD,
      testReceiptSha: HEAD,
      reviewReceiptSha: HEAD,
      agentReviewPassed: true,
    }),
    HEAD
  );
  for (const overrides of [
    { testReceiptSha: null },
    { agentReviewPassed: false },
    { testReceiptSha: 'c'.repeat(40) },
    { reviewReceiptSha: 'c'.repeat(40) },
  ]) {
    assert.throws(
      () =>
        resolveAcceptedDeliveryHead({
          localHeadSha: HEAD,
          testReceiptSha: HEAD,
          reviewReceiptSha: null,
          agentReviewPassed: true,
          ...overrides,
        }),
      /accepted-evidence/
    );
  }
});

test('missing, malformed, duplicate, conflicting, and mismatched receipt evidence fails closed', () => {
  const valid = validRecords();
  const duplicate = {
    ...valid,
    receipts: [...valid.receipts, structuredClone(valid.receipts[0])],
  };
  const conflict = structuredClone(duplicate);
  conflict.receipts[1].record.mergeCommitSha = 'd'.repeat(40);
  const cases = [
    ['missing', { records: { ...validRecords(), matchingReceipt: null } }],
    ['malformed', { records: {} }],
    ['duplicate', { records: duplicate }],
    ['conflicting', { records: conflict }],
    ['head-mismatch', { acceptedSha: 'c'.repeat(40) }],
    ['pr-mismatch', { pullRequests: [{ ...input().pullRequests[0], number: 1401 }] }],
    ['branch-mismatch', { pullRequests: [{ ...input().pullRequests[0], headRefName: 'other' }] }],
    [
      'not-merged',
      { pullRequests: [{ ...input().pullRequests[0], merged: false, state: 'OPEN' }] },
    ],
    ['ambiguous-pr', { pullRequests: [...input().pullRequests, ...input().pullRequests] }],
    [
      'merge-commit-missing',
      { pullRequests: [{ ...input().pullRequests[0], mergeCommitSha: null }] },
    ],
    [
      'merge-commit-missing',
      { pullRequests: [{ ...input().pullRequests[0], mergeCommitSha: 'short' }] },
    ],
    [
      'merge-commit-mismatch',
      { pullRequests: [{ ...input().pullRequests[0], mergeCommitSha: 'd'.repeat(40) }] },
    ],
  ];
  for (const [category, overrides] of cases) {
    assert.throws(() => requireDeliveryReceipt(input(overrides)), new RegExp(category));
  }
});

test('child merge-back and explicit no-PR local trunk lane skip the PR receipt gate', () => {
  assert.deepEqual(
    requireDeliveryReceipt(
      input({
        lineage: { parentIssueNumber: 1200, deliveryTarget: 'epic/1200' },
        records: null,
        pullRequests: [],
      })
    ),
    { skipped: true, receipt: null }
  );
  assert.deepEqual(
    requireDeliveryReceipt(
      input({
        branch: 'trunk',
        lineage: {
          parentIssueNumber: null,
          deliveryTarget: 'trunk',
          localTrunkLaneAuthorized: true,
        },
        pullRequests: [],
        records: null,
      })
    ),
    { skipped: true, receipt: null }
  );
});

test('close contains no PR mutation or provider-action wait/retry path', () => {
  const source = readFileSync(
    new URL('../../../../task-tracker/verbs/close.mjs', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(source, /enableFullAutoMergeForClose\s*\(/);
  assert.doesNotMatch(source, /AITM_PROVIDER_ACTION_REQUIRED|provider-action.*(?:wait|retry)/i);
  assert.doesNotMatch(source, /parseTestStartedMarker/);
  assert.match(source, /number,state,mergedAt,mergeCommit,headRefName,headRefOid,baseRefName/);
  assert.match(source, /mergeCommitSha:\s*pr\.mergeCommit\?\.oid\s*\?\?\s*null/);
  assert.match(source, /ctx\.requireDeliveryReceipt\s*\|\|\s*requireDeliveryReceipt/);
});
