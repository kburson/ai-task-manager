// @story #937

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildTestCursorRequest } from '../../../../task-tracker/lib/test-cursor-request.mjs';

test('direct test and generic promotion converge on the same Develop-to-Test request', () => {
  const direct = buildTestCursorRequest({
    command: 'test',
    currentState: 'develop',
    issue: 937,
    cwd: '/wt',
  });
  const promoted = buildTestCursorRequest({
    command: 'promote',
    currentState: 'develop',
    issue: 937,
    cwd: '/wt',
  });
  assert.deepEqual(direct, promoted);
  assert.deepEqual(direct, {
    issue: 937,
    cwd: '/wt',
    trigger: 'advance-forward',
    requestedTarget: 'test',
    flags: { verb: 'test' },
  });
});

test('rebind and resume wake Test in place through actions-only', () => {
  for (const command of ['rebind', 'resume']) {
    assert.deepEqual(
      buildTestCursorRequest({ command, currentState: 'test', issue: 937, cwd: '/wt' }),
      {
        issue: 937,
        cwd: '/wt',
        trigger: 'actions-only',
        flags: { verb: command },
      }
    );
  }
});

test('task binding dispatches Test residents through verbTest', () => {
  const source = readFileSync(
    new URL('../../../../task-tracker/task-tracker.mjs', import.meta.url),
    'utf8'
  );
  assert.match(source, /state === 'test'[\s\S]*buildTestCursorRequest/);
  assert.match(source, /state === 'test'[\s\S]*verbTest/);
});
