// @story #937

import assert from 'node:assert/strict';
import test from 'node:test';

import developState from '../../../../task-tracker/states/develop.mjs';
import { developExitReceiptGuard } from '../../../../task-tracker/lib/develop-exit-receipt-guard.mjs';

const SHA = 'b'.repeat(40);

test('Develop exit consumes only a fresh Develop action receipt', async () => {
  assert.equal(
    developState.exitGuards.some(({ id }) => id === 'develop-exit-sandbox-proof'),
    false
  );
  assert.ok(developState.exitGuards.includes(developExitReceiptGuard));

  const accepted = await developExitReceiptGuard.run({
    toState: 'test',
    issueNumber: 937,
    headSha: SHA,
    body: `<!-- aitm-verification-receipt stage="develop-final" data="invalid" -->`,
    deps: { readDevelopReceipt: () => ({ stage: 'develop-final', commitSha: SHA, ok: true }) },
  });
  assert.deepEqual(accepted, { ok: true });

  const stale = await developExitReceiptGuard.run({
    toState: 'test',
    issueNumber: 937,
    headSha: SHA,
    body: '',
    deps: { readDevelopReceipt: () => ({ stage: 'develop-final', commitSha: 'c'.repeat(40) }) },
  });
  assert.equal(stale.ok, false);
  assert.match(stale.reason, /fresh Develop action receipt/);
});
