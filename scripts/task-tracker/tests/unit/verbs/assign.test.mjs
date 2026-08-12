// @story #1212
import test from 'node:test';
import assert from 'node:assert/strict';

import { runAssign } from '../../../verbs/assign.mjs';

const cfg = { repo: 'acme/widgets', projectId: 'PVT_target' };

function harness(snapshots, { mutationError = null } = {}) {
  const queue = [...snapshots];
  const mutations = [];
  const audits = [];
  let lockCalls = 0;
  return {
    mutations,
    audits,
    get lockCalls() {
      return lockCalls;
    },
    deps: {
      resolveLogin: async (login) => (login === '@me' ? 'Alice' : login),
      fetchSnapshot: async () => {
        assert.ok(queue.length > 0, 'unexpected assignment snapshot read');
        return structuredClone(queue.shift());
      },
      mutateAssignee: async (args) => {
        mutations.push({ action: args.action, login: args.login });
        if (mutationError && mutations.length === mutationError.at)
          throw new Error(mutationError.message);
      },
      postAudit: async (entry) => audits.push(entry),
      withIssueLock: async (options, fn) => {
        lockCalls += 1;
        assert.equal(options.issue, 1212);
        assert.equal(options.verb, 'assign');
        return fn();
      },
      projectDir: '/repo',
    },
  };
}

test('assign claims an unassigned pre-Develop story without changing Status', async () => {
  const h = harness([
    { state: 'plan', assignees: [] },
    { state: 'plan', assignees: ['ALICE'] },
  ]);
  const result = await runAssign({
    issueNumber: 1212,
    cfg,
    target: '@me',
    currentUser: 'alice',
    deps: h.deps,
  });
  assert.equal(result.status, 'assigned');
  assert.deepEqual(result.assignees, ['alice']);
  assert.deepEqual(h.mutations, [{ action: 'add', login: 'alice' }]);
  assert.equal(h.audits.length, 1);
  assert.equal(h.lockCalls, 1);
});

test('assign transfers a locally-owned story to one different owner while preserving Status', async () => {
  const h = harness([
    { state: 'develop', assignees: ['Alice'] },
    { state: 'develop', assignees: ['Alice', 'Bob'] },
    { state: 'develop', assignees: ['bob'] },
  ]);
  const result = await runAssign({
    issueNumber: 1212,
    cfg,
    target: 'BOB',
    currentUser: 'alice',
    deps: h.deps,
  });
  assert.equal(result.status, 'transferred');
  assert.deepEqual(h.mutations, [
    { action: 'add', login: 'bob' },
    { action: 'remove', login: 'alice' },
  ]);
  assert.equal(h.audits[0].from, 'alice');
  assert.equal(h.audits[0].to, 'bob');
});

test('assign refuses foreign and multiple ownership before mutation', async () => {
  for (const assignees of [['bob'], ['alice', 'bob']]) {
    const h = harness([{ state: 'refine', assignees }]);
    const result = await runAssign({
      issueNumber: 1212,
      cfg,
      target: 'carol',
      currentUser: 'alice',
      deps: h.deps,
    });
    assert.match(result.status, /foreign-owner|multiple-owners/);
    assert.deepEqual(h.mutations, []);
  }
});

test('assign treats a thrown add with a matching read-back as ambiguous and never compensates', async () => {
  const h = harness(
    [
      { state: 'plan', assignees: [] },
      { state: 'plan', assignees: ['alice'] },
    ],
    { mutationError: { at: 1, message: '502 after apply' } }
  );
  const result = await runAssign({
    issueNumber: 1212,
    cfg,
    target: 'alice',
    currentUser: 'alice',
    deps: h.deps,
  });
  assert.equal(result.status, 'assignment-ambiguous');
  assert.deepEqual(h.mutations, [{ action: 'add', login: 'alice' }]);
  assert.equal(h.audits.length, 0);
});

test('assign never destructively compensates a successful but provenance-ambiguous add', async () => {
  const h = harness([
    { state: 'plan', assignees: [] },
    { state: 'plan', assignees: ['alice', 'bob'] },
  ]);
  const result = await runAssign({
    issueNumber: 1212,
    cfg,
    target: 'alice',
    currentUser: 'alice',
    deps: h.deps,
  });
  assert.equal(result.status, 'postcondition-refused-uncompensated');
  assert.deepEqual(h.mutations, [{ action: 'add', login: 'alice' }]);
});

test('transfer does not destructively compensate after the prior owner was removed', async () => {
  const h = harness([
    { state: 'develop', assignees: ['alice'] },
    { state: 'develop', assignees: ['alice', 'bob'] },
    { state: 'develop', assignees: ['bob', 'carol'] },
  ]);
  const result = await runAssign({
    issueNumber: 1212,
    cfg,
    target: 'bob',
    currentUser: 'alice',
    operation: 'transfer',
    deps: h.deps,
  });
  assert.equal(result.status, 'transfer-postcondition-refused-uncompensated');
  assert.deepEqual(h.mutations, [
    { action: 'add', login: 'bob' },
    { action: 'remove', login: 'alice' },
  ]);
  assert.deepEqual(h.audits, []);
});

test('assign is idempotent for the requested singleton owner', async () => {
  const h = harness([{ state: 'ready-for-plan', assignees: ['ALICE'] }]);
  const result = await runAssign({
    issueNumber: 1212,
    cfg,
    target: 'alice',
    currentUser: 'alice',
    deps: h.deps,
  });
  assert.equal(result.status, 'already-assigned');
  assert.deepEqual(h.mutations, []);
  assert.deepEqual(h.audits, []);
});
