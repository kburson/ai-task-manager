// @story #1207
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runAssignedInvariantReconcile } from '../../../verbs/reconcile.mjs';

const cfg = { repo: 'o/r', projectId: 'P1' };

function harness({ state, assignees, moveCode = 0 } = {}) {
  const moves = [];
  return {
    moves,
    deps: {
      getLiveState: async () => state,
      fetchAssignees: async () => assignees,
      runMoveState: async ({ target }) => {
        moves.push(target);
        return moveCode;
      },
    },
  };
}

test('dry-run reports Assigned without assignees and performs no writes', async () => {
  const { deps, moves } = harness({ state: 'assigned', assignees: [] });
  const result = await runAssignedInvariantReconcile({ issueNumber: 51, cfg, deps });
  assert.equal(result.status, 'drift-detected');
  assert.equal(result.kind, 'assigned-without-assignee');
  assert.equal(result.targetState, 'backlog');
  assert.deepEqual(moves, []);
});

test('apply repairs Assigned without assignees by demoting to Backlog', async () => {
  const { deps, moves } = harness({ state: 'assigned', assignees: [] });
  const result = await runAssignedInvariantReconcile({
    issueNumber: 52,
    apply: true,
    cfg,
    deps,
  });
  assert.equal(result.status, 'repaired');
  assert.deepEqual(moves, ['backlog']);
});

test('apply repairs Backlog with assignees by moving to Assigned', async () => {
  const { deps, moves } = harness({ state: 'backlog', assignees: ['alice'] });
  const result = await runAssignedInvariantReconcile({
    issueNumber: 53,
    apply: true,
    cfg,
    deps,
  });
  assert.equal(result.kind, 'backlog-with-assignee');
  assert.equal(result.status, 'repaired');
  assert.deepEqual(moves, ['assigned']);
});

test('later states are invariant-neutral even when unassigned', async () => {
  for (const state of ['refine', 'plan', 'develop', 'test', 'review', 'done']) {
    const { deps, moves } = harness({ state, assignees: [] });
    const result = await runAssignedInvariantReconcile({
      issueNumber: 54,
      apply: true,
      cfg,
      deps,
    });
    assert.equal(result.status, 'compliant', state);
    assert.equal(result.kind, 'out-of-scope', state);
    assert.deepEqual(moves, [], state);
  }
});

test('failed apply reports the central mover exit code', async () => {
  const { deps } = harness({ state: 'backlog', assignees: ['alice'], moveCode: 11 });
  const result = await runAssignedInvariantReconcile({
    issueNumber: 55,
    apply: true,
    cfg,
    deps,
  });
  assert.equal(result.status, 'repair-failed');
  assert.equal(result.exitCode, 11);
});

test('assignee transport failure is an error and never writes', async () => {
  const { deps, moves } = harness({ state: 'assigned', assignees: [] });
  deps.fetchAssignees = async () => {
    throw new Error('offline');
  };
  const result = await runAssignedInvariantReconcile({ issueNumber: 56, cfg, deps });
  assert.equal(result.status, 'error');
  assert.match(result.message, /offline/);
  assert.deepEqual(moves, []);
});
