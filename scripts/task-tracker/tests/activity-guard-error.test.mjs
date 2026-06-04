// #273 — when an active task is bound but its kanbanState cache is absent,
// the guard's block message must name the issue and include a concrete
// repair command. Pre-#273 it said "no recorded kanban state" with no path
// forward.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildReason } from '../lib/activity-block-reason.mjs';
import { STATE_MATRIX } from '../activity-policy.mjs';

test('bound issue + absent cache → message includes repair command', () => {
  const reason = buildReason({
    activityClass: 'WRITE_CODE',
    target: 'src/foo.mjs',
    state: null,
    activeIssue: '#273',
    toolName: 'Edit',
    STATE_MATRIX,
  });
  assert.match(reason, /#273/);
  assert.match(reason, /reconcile accept-live 273/);
});

test('no active issue + no state → no-active-task message', () => {
  const reason = buildReason({
    activityClass: 'WRITE_CODE',
    target: 'src/foo.mjs',
    state: null,
    activeIssue: null,
    toolName: 'Edit',
    STATE_MATRIX,
  });
  assert.match(reason, /no active task/);
  assert.match(reason, /\/task start/);
});

test('non-null state + disallowed activity → message suggests promote/demote', () => {
  // #281 — legacy `/task move <id> <state>` advice was wrong (verb retired in
  // favor of promote/demote). Forward suggestion → /task promote; backward →
  // /task demote. WRITE_CODE in refine resolves forward to develop, so the
  // message points the user at promote.
  const reason = buildReason({
    activityClass: 'WRITE_CODE',
    target: 'src/foo.mjs',
    state: 'refine',
    activeIssue: '#273',
    toolName: 'Edit',
    STATE_MATRIX,
  });
  assert.match(reason, /not permitted in state refine/);
  assert.match(reason, /\/task promote/);
  assert.doesNotMatch(reason, /\/task move /);
});
