// @story #1670
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { measureFixedActionAuthorityReads } from '../../../helpers/action-authority-cost.mjs';

test('fixed action authority measurement records physical read-port calls for every explain-ready collector', async () => {
  const measured = await measureFixedActionAuthorityReads();
  assert.deepEqual(
    measured.actions.map(({ id }) => id),
    ['bind', 'resume', 'promote', 'test', 'review', 'deliver', 'close']
  );
  for (const action of measured.actions) {
    assert.equal(action.status, 'ready', `${action.id} must measure a complete ready scenario`);
    assert.ok(action.requestCount > 0, action.id);
    assert.equal(action.requestCount, action.requests.length, action.id);
    assert.equal(action.requestCount, action.requestKeys.length, action.id);
    assert.equal(
      new Set(action.requests.map(({ key }) => key)).size,
      action.requestCount,
      action.id
    );
  }
});
