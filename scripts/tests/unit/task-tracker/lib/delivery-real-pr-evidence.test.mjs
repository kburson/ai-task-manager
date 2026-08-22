#!/usr/bin/env node
// @story #939
// cspell:ignore NDEKTSV RRFFQ

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { buildDeliveryRealPrEvidence } from '../../../../task-tracker/lib/delivery-verification.mjs';

const SOURCE_SHA = 'a'.repeat(40);
const MERGE_SHA = 'b'.repeat(40);
const COMMIT_TITLE = '[#939] Governed PR delivery';
const COMMIT_MESSAGE = `PR #1400\nSource: ${SOURCE_SHA}\n\nAttribution: [#939]`;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function providerAction(overrides = {}) {
  return {
    schema: 1,
    intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    action: 'github.merge-pull-request',
    repository: 'kburson/ai-task-manager',
    issueNumber: 939,
    prNumber: 1400,
    baseRef: 'trunk',
    headRef: 'codex/939-full-auto-merge',
    expectedHeadSha: SOURCE_SHA,
    mergeMethod: 'squash',
    commitTitle: COMMIT_TITLE,
    commitMessage: COMMIT_MESSAGE,
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    repository: 'kburson/ai-task-manager',
    issueNumber: 939,
    prNumber: 1400,
    sourceSha: SOURCE_SHA,
    mergeSha: MERGE_SHA,
    mergeMethod: 'squash',
    commitTitle: COMMIT_TITLE,
    commitMessage: COMMIT_MESSAGE,
    commitTitleSha256: sha256(COMMIT_TITLE),
    commitMessageSha256: sha256(COMMIT_MESSAGE),
    providerAction: providerAction(),
    receiptCommentId: 'IC_kwDOExample',
    ciRunUrl: 'https://github.com/kburson/ai-task-manager/actions/runs/123456789',
    branchDisposition: 'retained',
    closeResult: 'closed',
    ...overrides,
  };
}

test('builds a strict, versioned, deeply frozen real-PR evidence object', () => {
  const evidence = buildDeliveryRealPrEvidence(input());
  assert.deepEqual(evidence, {
    schema: 'aitm.delivery-real-pr-evidence/v1',
    ...input(),
  });
  assert.equal(Object.isFrozen(evidence), true);
  assert.equal(Object.isFrozen(evidence.providerAction), true);
});

test('real-PR evidence rejects every partial object', () => {
  for (const key of Object.keys(input())) {
    const partial = input();
    delete partial[key];
    assert.throws(() => buildDeliveryRealPrEvidence(partial), /delivery-real-pr-evidence:/, key);
  }
});

test('real-PR evidence rejects unknown keys', () => {
  assert.throws(
    () => buildDeliveryRealPrEvidence({ ...input(), unknown: true }),
    /delivery-real-pr-evidence:input-keys/
  );
});

test('real-PR evidence rejects partial, unknown, and malformed provider actions', () => {
  const partial = providerAction();
  delete partial.intentId;
  assert.throws(
    () => buildDeliveryRealPrEvidence(input({ providerAction: partial })),
    /delivery-real-pr-evidence:provider-action/
  );
  assert.throws(
    () =>
      buildDeliveryRealPrEvidence(
        input({ providerAction: providerAction({ providerResult: 'merged' }) })
      ),
    /delivery-real-pr-evidence:provider-action/
  );
  assert.throws(
    () => buildDeliveryRealPrEvidence(input({ providerAction: providerAction({ schema: 2 }) })),
    /delivery-real-pr-evidence:provider-action/
  );
});

test('real-PR evidence correlates every provider action authority and commit hash', () => {
  const mismatches = [
    { providerAction: providerAction({ repository: 'other/repository' }) },
    { providerAction: providerAction({ issueNumber: 938 }) },
    { providerAction: providerAction({ prNumber: 1399 }) },
    { providerAction: providerAction({ expectedHeadSha: 'c'.repeat(40) }) },
    { providerAction: providerAction({ mergeMethod: 'merge' }) },
    { providerAction: providerAction({ commitTitle: '[#939] Other title' }) },
    { providerAction: providerAction({ commitMessage: 'other bytes' }) },
    { mergeMethod: 'merge' },
    { commitTitleSha256: '0'.repeat(64) },
    { commitMessageSha256: '0'.repeat(64) },
  ];
  for (const mismatch of mismatches) {
    assert.throws(
      () => buildDeliveryRealPrEvidence(input(mismatch)),
      /delivery-real-pr-evidence:/,
      JSON.stringify(mismatch)
    );
  }
});

test('real-PR evidence validates identities, SHAs, URLs, disposition, and close result', () => {
  const invalid = [
    { repository: 'not-a-repository' },
    { issueNumber: 0 },
    { prNumber: 0 },
    { sourceSha: 'a'.repeat(39) },
    { mergeSha: 'g'.repeat(40) },
    { mergeMethod: 'fast-forward' },
    { commitTitle: '' },
    { commitMessage: '' },
    { commitTitleSha256: 'a'.repeat(63) },
    { commitMessageSha256: 'a'.repeat(63) },
    { providerAction: null },
    { receiptCommentId: '' },
    { ciRunUrl: 'http://example.com/run/1' },
    { branchDisposition: 'unknown' },
    { closeResult: 'pending' },
  ];
  for (const override of invalid) {
    assert.throws(
      () => buildDeliveryRealPrEvidence(input(override)),
      /delivery-real-pr-evidence:/,
      JSON.stringify(override)
    );
  }
});
