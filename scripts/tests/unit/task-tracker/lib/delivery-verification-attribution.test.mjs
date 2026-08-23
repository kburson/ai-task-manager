#!/usr/bin/env node
// @story #1393
// cspell:ignore NDEKTSV RRFFQ

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { buildDeliveryIntent } from '../../../../task-tracker/lib/delivery-records.mjs';
import {
  verifyDeliveredPullRequest,
  verifyExternalDeliveredPullRequest,
} from '../../../../task-tracker/lib/delivery-verification.mjs';

const HEAD = 'a'.repeat(40);
const MERGE_HEAD = 'b'.repeat(40);
const MERGED_AT = '2026-08-23T06:01:54.000Z';
const ATTRIBUTION_TOKENS = ['#1380', '#1392', '#939'];
const COMMIT_TITLE = '[#1392] Governed PR delivery';
const COMMIT_MESSAGE = `PR #1391\nSource: ${HEAD}\n\n` + 'Attribution: [#1392] [#1380] [#939]';

function intent(commitMessage = COMMIT_MESSAGE) {
  return buildDeliveryIntent({
    intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    supersedesIntentId: null,
    issueNumber: 1392,
    repository: 'kburson/ai-task-manager',
    prNumber: 1391,
    baseRef: 'trunk',
    headRef: 'codex/939-full-auto-merge',
    expectedHeadSha: HEAD,
    mergeMethod: 'squash',
    attributionTokens: ATTRIBUTION_TOKENS,
    commitTitle: COMMIT_TITLE,
    commitMessage,
    provider: 'codex',
    sessionId: 'session-1393',
    clientCreatedAt: '2026-08-23T06:00:00.000Z',
  });
}

function externalIntentInput() {
  return {
    intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
    supersedesIntentId: null,
    issueNumber: 1392,
    repository: 'kburson/ai-task-manager',
    prNumber: 1391,
    baseRef: 'trunk',
    headRef: 'codex/939-full-auto-merge',
    expectedHeadSha: HEAD,
    mergeMethod: 'squash',
    attributionTokens: ATTRIBUTION_TOKENS,
    provider: 'external',
    sessionId: 'session-1393',
    clientCreatedAt: MERGED_AT,
  };
}

function liveInput(commitMessage = COMMIT_MESSAGE) {
  return {
    acceptedReviewSha: HEAD,
    attributingCommits() {
      throw new Error('delivery verification must not use generic subject-only attribution');
    },
    async fetchOriginTrunk() {},
    async inspectMergeCommit() {
      return {
        parents: ['c'.repeat(40)],
        commitTitle: COMMIT_TITLE,
        commitMessage,
      };
    },
    intentCreatedAt: '2026-08-23T06:00:01.000Z',
    async isAncestor() {
      return true;
    },
    localHeadSha: HEAD,
    pullRequest: {
      number: 1391,
      state: 'MERGED',
      merged: true,
      baseRefName: 'trunk',
      headRefName: 'codex/939-full-auto-merge',
      headRefOid: HEAD,
      mergeCommit: { oid: MERGE_HEAD },
      mergedAt: MERGED_AT,
      mergeMethod: 'squash',
      headRefDeleted: false,
    },
    recovery: false,
    testReceiptSha: HEAD,
  };
}

test('verifies multi-issue squash attribution from exact inspected commit bytes', async () => {
  const verified = await verifyDeliveredPullRequest({
    ...liveInput(),
    intent: intent(),
  });

  assert.equal(verified.receiptInput.mergeCommitSha, MERGE_HEAD);
  assert.equal(verified.intent.commitMessage, COMMIT_MESSAGE);
});

test('external recovery accepts one canonical inspected attribution line', async () => {
  const input = liveInput();
  delete input.intentCreatedAt;
  delete input.recovery;

  const verified = await verifyExternalDeliveredPullRequest({
    ...input,
    intentInput: externalIntentInput(),
  });

  assert.equal(verified.intent.provider, 'external');
  assert.equal(verified.intent.commitMessage, COMMIT_MESSAGE);
});

test('external recovery rejects noncanonical inspected attribution lines', async () => {
  const invalidMessages = [
    `PR #1391\nSource: ${HEAD}`,
    `${COMMIT_MESSAGE}\nAttribution: [#1392] [#1380] [#939]`,
    `PR #1391\nSource: ${HEAD}\n\nAttribution: [#1392] [#939] [#1380]`,
    `PR #1391\nSource: ${HEAD}\n\nAttribution: #1392 #1380 #939`,
    `${COMMIT_MESSAGE} [#1400]`,
  ];

  for (const commitMessage of invalidMessages) {
    const input = liveInput(commitMessage);
    delete input.intentCreatedAt;
    delete input.recovery;
    await assert.rejects(
      () =>
        verifyExternalDeliveredPullRequest({
          ...input,
          intentInput: externalIntentInput(),
        }),
      /delivery-verification:attribution/
    );
  }
});
