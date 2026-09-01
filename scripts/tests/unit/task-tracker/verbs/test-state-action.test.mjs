// @story #937

import assert from 'node:assert/strict';
import test from 'node:test';

import testState from '../../../../task-tracker/states/test.mjs';
import { testQuickCiAction } from '../../../../task-tracker/lib/resident-actions/test-quick-ci.mjs';

test('Test owns the resumable PR and exact-head quick-CI action', () => {
  assert.deepEqual(testState.residentActions, [testQuickCiAction]);
});

test('Test verification fails closed when both receipt and HEAD are absent', async () => {
  assert.deepEqual(await testQuickCiAction.verify({}, { body: { value: '' } }), {
    status: 'incomplete',
    reason: 'fresh-test-receipt-missing',
  });
});

test('Test action keeps infrastructure waiting and classifies source failure for demotion', async () => {
  const waiting = await testQuickCiAction.run(
    {
      test: {
        startOrObserve: async () => ({
          kind: 'infrastructure',
          deadline: '2026-09-02T00:00:00.000Z',
        }),
      },
    },
    { issue: { value: 937 }, headSha: { value: 'd'.repeat(40) } },
    { correlation: { action: 'test' } }
  );
  assert.deepEqual(waiting, {
    status: 'waiting',
    deadline: '2026-09-02T00:00:00.000Z',
    correlation: { action: 'test' },
  });

  const source = await testQuickCiAction.run(
    { test: { startOrObserve: async () => ({ kind: 'source-failure', reason: 'unit red' }) } },
    { issue: { value: 937 }, headSha: { value: 'd'.repeat(40) } },
    { correlation: { action: 'test' } }
  );
  assert.deepEqual(source, { status: 'failed', reason: 'source-rework-required:unit red' });
});
