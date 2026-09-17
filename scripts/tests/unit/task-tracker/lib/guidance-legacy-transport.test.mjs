// @story #1654
import assert from 'node:assert/strict';
import test from 'node:test';

import { reconcileTransportLedger } from '../../../helpers/guidance-legacy-transport.mjs';

test('guidance legacy transport rejects an empty positive ledger', () => {
  assert.throws(
    () => reconcileTransportLedger([{ id: 'required' }], []),
    /physical transport ledger is empty/
  );
});

test('ledger reconciliation detects a restored native custom-promisify bypass', () => {
  assert.throws(
    () => reconcileTransportLedger([{ id: 'promise-canary' }], [{ requestId: 'other' }]),
    /does not reconcile/
  );
});

test('ledger reconciliation accepts the complete ordered physical ledger', () => {
  assert.deepEqual(
    reconcileTransportLedger(
      [{ id: 'callback' }, { id: 'promise' }],
      [{ requestId: 'callback' }, { requestId: 'promise' }]
    ),
    { requestCount: 2, physicalCount: 2 }
  );
});
