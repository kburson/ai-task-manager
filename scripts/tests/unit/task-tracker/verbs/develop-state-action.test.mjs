// @story #937

import assert from 'node:assert/strict';
import test from 'node:test';

import developState from '../../../../task-tracker/states/develop.mjs';
import { developVerificationAction } from '../../../../task-tracker/lib/resident-actions/develop-verification.mjs';

test('Develop owns exact-head implementation verification as a resident action', () => {
  assert.deepEqual(developState.residentActions, [developVerificationAction]);
});

test('Develop verification runs the finalizer and persists its receipt', async () => {
  const writes = [];
  const receipt = { stage: 'develop-final', commitSha: 'a'.repeat(40) };
  const result = await developVerificationAction.run(
    {
      develop: {
        finalize: async () => ({ ok: true, receipt }),
        persistReceipt: async (input) => writes.push(input),
      },
    },
    { issue: { value: 937 }, headSha: { value: 'a'.repeat(40) } },
    { correlation: { action: 'develop' } }
  );

  assert.equal(result.status, 'complete');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].receipt, receipt);
});
