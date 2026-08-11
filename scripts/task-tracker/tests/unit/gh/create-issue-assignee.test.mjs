// @story #1207
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  buildTetherArgs,
  initialStateForAssignee,
  stampInitialEntry,
} from '../../../../gh/create-issue.mjs';

test('explicit assignee selects Assigned for entry marker and project tether', () => {
  assert.equal(initialStateForAssignee('alice'), 'assigned');
  const body = stampInitialEntry('## Issue\n', 'alice', '2026-08-11T00:00:00Z');
  assert.match(body, /entered-assigned/);
  assert.match(body, /aitm-last-known-state state="assigned"/);
  assert.deepEqual(buildTetherArgs(42, { assignee: 'alice' }), [
    expectTetherScript(),
    '--issue',
    '42',
    '--status',
    'assigned',
  ]);
});

test('omitted assignee remains Backlog for entry marker and project tether', () => {
  assert.equal(initialStateForAssignee(null), 'backlog');
  assert.match(stampInitialEntry('## Issue\n', null, '2026-08-11T00:00:00Z'), /entered-backlog/);
  assert.match(buildTetherArgs(43, {})[4], /^backlog$/);
});

function expectTetherScript() {
  return buildTetherArgs(1, {})[0];
}
