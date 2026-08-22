#!/usr/bin/env node
// @story #939

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildDeliveryRealPrEvidence } from '../../../../task-tracker/lib/delivery-verification.mjs';

const SOURCE_SHA = 'a'.repeat(40);
const MERGE_SHA = 'b'.repeat(40);

function input(overrides = {}) {
  return {
    repository: 'kburson/ai-task-manager',
    issueNumber: 939,
    prNumber: 1400,
    sourceSha: SOURCE_SHA,
    mergeSha: MERGE_SHA,
    providerAction: {
      schema: 1,
      action: 'github.merge-pull-request',
      expectedHeadSha: SOURCE_SHA,
    },
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

test('real-PR evidence validates identities, SHAs, URLs, disposition, and close result', () => {
  const invalid = [
    { repository: 'not-a-repository' },
    { issueNumber: 0 },
    { prNumber: 0 },
    { sourceSha: 'a'.repeat(39) },
    { mergeSha: 'g'.repeat(40) },
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
