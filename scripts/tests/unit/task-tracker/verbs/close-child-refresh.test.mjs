// @story #1669
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { requireCloseChildrenSnapshot } from '../../../../task-tracker/verbs/close.mjs';

test('close rejects an unavailable child inventory before a terminal effect', () => {
  assert.throws(
    () => requireCloseChildrenSnapshot({ status: 'unknown', error: 'transport' }),
    /close-child-authority-unavailable/
  );
  assert.throws(() => requireCloseChildrenSnapshot(null), /close-child-authority-unavailable/);
});

test('close reports every child below Review and preserves Review/Done children', () => {
  const result = requireCloseChildrenSnapshot({
    status: 'ok',
    children: [
      { number: 1701, boardState: 'plan' },
      { number: 1702, boardState: 'develop' },
      { number: 1703, boardState: 'review' },
      { number: 1704, boardState: 'done' },
    ],
  });
  assert.deepEqual(
    result.notReady.map(({ num }) => num),
    [1701, 1702]
  );
  assert.deepEqual(
    result.reviewChildren.map(({ num }) => num),
    [1703]
  );
});

test('close does not accept malformed child rows as an empty inventory', () => {
  assert.throws(
    () => requireCloseChildrenSnapshot({ status: 'ok', children: [{ number: 1701 }] }),
    /close-child-authority-unavailable/
  );
});
