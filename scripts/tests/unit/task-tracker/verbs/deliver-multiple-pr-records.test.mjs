#!/usr/bin/env node
// @story #1406

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
  renderDeliveryIntentComment,
  renderDeliveryReceiptComment,
} from '../../../../task-tracker/lib/delivery-records.mjs';
import { parsedDeliveryRecords } from '../../../../task-tracker/verbs/deliver.mjs';

const ISSUE = 1406;
const REPOSITORY = 'kburson/ai-task-manager';
const PREVIOUS_PR = 1415;
const CURRENT_PR = 1416;
const PREVIOUS_HEAD = 'a'.repeat(40);
const CURRENT_HEAD = 'b'.repeat(40);

function intent({ intentId, prNumber, expectedHeadSha }) {
  return buildDeliveryIntent({
    intentId,
    supersedesIntentId: null,
    issueNumber: ISSUE,
    repository: REPOSITORY,
    prNumber,
    baseRef: 'trunk',
    headRef: 'codex/1406-reviewer-full-permissions',
    expectedHeadSha,
    mergeMethod: 'squash',
    attributionTokens: ['#1406'],
    commitTitle: '[#1406] Governed PR delivery',
    commitMessage: `PR #${prNumber}\nSource: ${expectedHeadSha}\n\nAttribution: [#1406]`,
    provider: 'codex',
    sessionId: 'session-1406',
    clientCreatedAt: '2026-08-25T04:50:54.381Z',
  });
}

test('selects the current PR while retaining valid prior delivery history', () => {
  const priorIntent = intent({
    intentId: '01M0VM3K9D909E3SP8NQDRXH0R',
    prNumber: PREVIOUS_PR,
    expectedHeadSha: PREVIOUS_HEAD,
  });
  const priorReceipt = buildDeliveryReceipt({
    intentId: priorIntent.intentId,
    issueNumber: ISSUE,
    prNumber: PREVIOUS_PR,
    expectedHeadSha: PREVIOUS_HEAD,
    mergeCommitSha: 'c'.repeat(40),
    baseRef: 'trunk',
    mergeMethod: 'squash',
    verifiedTrunkRef: 'origin/trunk',
    provider: 'codex',
    sessionId: 'session-1406',
    verifiedAt: '2026-08-25T04:51:04.000Z',
  });
  const currentIntent = intent({
    intentId: '01M0VQZRSPZ6ZZMPD4JS7P62TB',
    prNumber: CURRENT_PR,
    expectedHeadSha: CURRENT_HEAD,
  });
  const comments = [
    ['prior-intent', '2026-08-25T04:50:54.000Z', renderDeliveryIntentComment(priorIntent)],
    ['prior-receipt', '2026-08-25T04:51:18.000Z', renderDeliveryReceiptComment(priorReceipt)],
    ['current-intent', '2026-08-25T06:40:00.000Z', renderDeliveryIntentComment(currentIntent)],
  ].map(([id, createdAt, body]) => ({ id, createdAt, body }));

  const records = parsedDeliveryRecords(comments, {
    repository: REPOSITORY,
    issueNumber: ISSUE,
    prNumber: CURRENT_PR,
  });

  assert.deepEqual(
    records.map(({ id }) => id),
    ['current-intent']
  );
  assert.equal(records[0].record.intentId, currentIntent.intentId);
});
