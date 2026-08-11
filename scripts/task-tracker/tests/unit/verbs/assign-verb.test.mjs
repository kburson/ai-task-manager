// @story #1207
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { parseArgs, runAssign } from '../../../verbs/assign.mjs';

const cfg = { repo: 'o/r', assignee: 'configured-user' };

function harness({ state = 'backlog', assignees = [], moveCodes = [], mutationError = null } = {}) {
  const calls = { mutations: [], moves: [] };
  let current = [...assignees];
  return {
    calls,
    deps: {
      resolveLogin: async (login) => login,
      getLiveState: async () => state,
      fetchAssignees: async () => [...current],
      mutateAssignee: async ({ login, remove }) => {
        calls.mutations.push({ login, remove });
        if (mutationError) throw mutationError;
        current = remove
          ? current.filter((entry) => entry !== login)
          : [...new Set([...current, login])];
      },
      runMoveState: async ({ target }) => {
        calls.moves.push(target);
        return moveCodes.length ? moveCodes.shift() : 0;
      },
    },
  };
}

test('add uses configured login and moves Backlog to Assigned', async () => {
  const { calls, deps } = harness();
  const result = await runAssign({ issueNumber: 21, cfg, deps });
  assert.equal(result.status, 'assigned');
  assert.equal(result.login, 'configured-user');
  assert.deepEqual(calls.mutations, [{ login: 'configured-user', remove: false }]);
  assert.deepEqual(calls.moves, ['assigned']);
});

test('add falls back to @me and is idempotent when already assigned', async () => {
  const { calls, deps } = harness({ state: 'assigned', assignees: ['@me'] });
  const result = await runAssign({ issueNumber: 22, cfg: { repo: 'o/r' }, deps });
  assert.equal(result.status, 'already-assigned');
  assert.equal(result.login, '@me');
  assert.deepEqual(calls.mutations, []);
  assert.deepEqual(calls.moves, []);
});

test('existing assignee on Backlog moves to Assigned without a duplicate assignee write', async () => {
  const { calls, deps } = harness({ assignees: ['configured-user'] });
  const result = await runAssign({ issueNumber: 23, cfg, deps });
  assert.equal(result.status, 'assigned');
  assert.deepEqual(calls.mutations, []);
  assert.deepEqual(calls.moves, ['assigned']);
});

test('failed Backlog move compensates only the assignee added by this invocation', async () => {
  const { calls, deps } = harness({ moveCodes: [11] });
  const result = await runAssign({ issueNumber: 24, login: 'alice', cfg, deps });
  assert.equal(result.status, 'move-failed-compensated');
  assert.equal(result.exitCode, 11);
  assert.deepEqual(calls.mutations, [
    { login: 'alice', remove: false },
    { login: 'alice', remove: true },
  ]);
});

test('failed post-add verification compensates the assignee added by this invocation', async () => {
  const { calls, deps } = harness();
  let reads = 0;
  deps.fetchAssignees = async () => {
    reads += 1;
    if (reads === 1) return [];
    throw new Error('verification unavailable');
  };
  const result = await runAssign({ issueNumber: 241, login: 'alice', cfg, deps });
  assert.equal(result.status, 'assignment-verification-failed-compensated');
  assert.deepEqual(calls.mutations, [
    { login: 'alice', remove: false },
    { login: 'alice', remove: true },
  ]);
  assert.deepEqual(calls.moves, []);
});

test('removing the final Assigned assignee demotes before removing', async () => {
  const { calls, deps } = harness({ state: 'assigned', assignees: ['alice'] });
  const result = await runAssign({ issueNumber: 25, login: 'alice', remove: true, cfg, deps });
  assert.equal(result.status, 'unassigned');
  assert.deepEqual(calls.moves, ['backlog']);
  assert.deepEqual(calls.mutations, [{ login: 'alice', remove: true }]);
});

test('removing one of multiple Assigned assignees does not demote', async () => {
  const { calls, deps } = harness({ state: 'assigned', assignees: ['alice', 'bob'] });
  const result = await runAssign({ issueNumber: 26, login: 'alice', remove: true, cfg, deps });
  assert.equal(result.status, 'unassigned');
  assert.deepEqual(calls.moves, []);
});

test('removing the final assignee from a later state never moves backward', async () => {
  const { calls, deps } = harness({ state: 'develop', assignees: ['alice'] });
  const result = await runAssign({ issueNumber: 27, login: 'alice', remove: true, cfg, deps });
  assert.equal(result.status, 'unassigned');
  assert.deepEqual(calls.moves, []);
});

test('failed final-assignee removal restores Assigned while the assignee still exists', async () => {
  const { calls, deps } = harness({
    state: 'assigned',
    assignees: ['alice'],
    mutationError: new Error('edit failed'),
  });
  const result = await runAssign({ issueNumber: 28, login: 'alice', remove: true, cfg, deps });
  assert.equal(result.status, 'remove-failed-restored');
  assert.equal(result.exitCode, 1);
  assert.deepEqual(calls.moves, ['backlog', 'assigned']);
});

test('assignee read failures fail closed before any mutation', async () => {
  const { calls, deps } = harness();
  deps.fetchAssignees = async () => {
    throw new Error('transport failed');
  };
  const result = await runAssign({ issueNumber: 29, cfg, deps });
  assert.equal(result.status, 'error');
  assert.match(result.message, /transport failed/);
  assert.deepEqual(calls.mutations, []);
  assert.deepEqual(calls.moves, []);
});

test('documented positional login is parsed alongside the explicit assignee flag', () => {
  assert.deepEqual(parseArgs(['#30', 'alice']), {
    issueNumber: 30,
    login: 'alice',
    remove: false,
  });
  assert.deepEqual(parseArgs(['31', '--assignee', 'bob', '--remove']), {
    issueNumber: 31,
    login: 'bob',
    remove: true,
  });
});

test('unknown live state fails closed before any assignment mutation', async () => {
  const { calls, deps } = harness({ state: null });
  const result = await runAssign({ issueNumber: 32, login: 'alice', cfg, deps });
  assert.equal(result.status, 'error');
  assert.match(result.message, /live project state/i);
  assert.deepEqual(calls.mutations, []);
  assert.deepEqual(calls.moves, []);
});
