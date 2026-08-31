// @story #1117 #1455

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseActionLedgerArgs,
  verbActionLedger,
} from '../../../../task-tracker/verbs/action-ledger.mjs';

test('action-ledger parses audit, gc, and approved reconcile modes', () => {
  assert.deepEqual(parseActionLedgerArgs(['1455', 'audit']), { issue: 1455, mode: 'audit' });
  assert.deepEqual(parseActionLedgerArgs(['1455', 'gc', '--comment', '42']), {
    issue: 1455,
    mode: 'gc',
    commentId: '42',
  });
  assert.deepEqual(
    parseActionLedgerArgs([
      '1455',
      'reconcile',
      '--accept-live',
      '--reason',
      'deleted event',
      '--approved-by',
      'kendrick',
    ]),
    {
      issue: 1455,
      mode: 'reconcile',
      acceptLive: true,
      reason: 'deleted event',
      approvedBy: 'kendrick',
    }
  );
});

test('verb routes one selected mode through its runtime', async () => {
  const calls = [];
  const result = await verbActionLedger(
    { rest: ['1455', 'audit'], cfg: { repo: 'o/r' } },
    { runtime: { audit: async (input) => (calls.push(input), { status: 'clean' }) } }
  );
  assert.equal(calls[0].issue, 1455);
  assert.equal(result.status, 'clean');
});
