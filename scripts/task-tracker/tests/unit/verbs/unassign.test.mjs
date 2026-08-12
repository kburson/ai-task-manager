// @story #1212
import test from 'node:test';
import assert from 'node:assert/strict';

import { runUnassign } from '../../../verbs/unassign.mjs';

const cfg = { repo: 'acme/widgets', projectId: 'PVT_target' };

function harness(snapshots, { mutationError = null } = {}) {
  const queue = [...snapshots];
  const mutations = [];
  const audits = [];
  return {
    mutations,
    audits,
    deps: {
      fetchSnapshot: async () => {
        assert.ok(queue.length > 0, 'unexpected assignment snapshot read');
        return structuredClone(queue.shift());
      },
      mutateAssignee: async (args) => {
        mutations.push({ action: args.action, login: args.login });
        if (mutationError) throw new Error(mutationError);
      },
      postAudit: async (entry) => audits.push(entry),
      withIssueLock: async (_options, fn) => fn(),
      projectDir: '/repo',
    },
  };
}

test('unassign removes the local singleton only before Develop and preserves Status', async () => {
  for (const state of ['backlog', 'refine', 'ready-for-plan', 'plan']) {
    const h = harness([
      { state, assignees: ['Alice'] },
      { state, assignees: [] },
    ]);
    const result = await runUnassign({
      issueNumber: 1212,
      cfg,
      currentUser: 'alice',
      deps: h.deps,
    });
    assert.equal(result.status, 'unassigned');
    assert.deepEqual(h.mutations, [{ action: 'remove', login: 'alice' }]);
    assert.equal(h.audits.length, 1);
  }
});

test('unassign refuses Develop Test and Review without mutating ownership or Status', async () => {
  for (const state of ['develop', 'test', 'review']) {
    const h = harness([{ state, assignees: ['alice'] }]);
    const result = await runUnassign({
      issueNumber: 1212,
      cfg,
      currentUser: 'alice',
      deps: h.deps,
    });
    assert.equal(result.status, 'in-flight-unassign-refused');
    assert.deepEqual(h.mutations, []);
  }
});

test('unassign refuses foreign multiple and absent ownership without mutation', async () => {
  for (const assignees of [['bob'], ['alice', 'bob'], []]) {
    const h = harness([{ state: 'plan', assignees }]);
    const result = await runUnassign({
      issueNumber: 1212,
      cfg,
      currentUser: 'alice',
      deps: h.deps,
    });
    assert.notEqual(result.status, 'unassigned');
    assert.deepEqual(h.mutations, []);
  }
});

test('unassign treats a thrown removal with empty read-back as ambiguous, not success', async () => {
  const h = harness(
    [
      { state: 'plan', assignees: ['alice'] },
      { state: 'plan', assignees: [] },
    ],
    { mutationError: 'connection reset after apply' }
  );
  const result = await runUnassign({
    issueNumber: 1212,
    cfg,
    currentUser: 'alice',
    deps: h.deps,
  });
  assert.equal(result.status, 'assignee-removal-ambiguous');
  assert.equal(h.audits.length, 0);
});

test('unassign fails closed when Status changes around the ownership mutation', async () => {
  const h = harness([
    { state: 'plan', assignees: ['alice'] },
    { state: 'develop', assignees: [] },
  ]);
  const result = await runUnassign({
    issueNumber: 1212,
    cfg,
    currentUser: 'alice',
    deps: h.deps,
  });
  assert.equal(result.status, 'status-drift-refused');
  assert.deepEqual(h.mutations, [{ action: 'remove', login: 'alice' }]);
  assert.equal(h.audits.length, 0);
});
