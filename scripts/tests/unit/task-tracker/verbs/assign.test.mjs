// @story #1212
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatOwnershipAudit,
  formatOwnershipRefusal,
  runAssign,
} from '../../../../task-tracker/verbs/assign.mjs';

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
  assert.equal(h.audits.length, 2);
  assert.deepEqual(
    h.audits.map((audit) => audit.phase),
    ['intent', 'completed']
  );
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
  assert.equal(h.audits[1].phase, 'completed');
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
  assert.equal(h.audits.length, 1, 'durable intent precedes any ownership mutation');
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
  assert.equal(h.audits.length, 1, 'durable transfer intent survives a refused postcondition');
});

test('assign never mutates when the durable audit reservation fails', async () => {
  const h = harness([{ state: 'plan', assignees: [] }]);
  h.deps.postAudit = async () => {
    throw new Error('comment transport unavailable');
  };
  await assert.rejects(
    runAssign({
      issueNumber: 1212,
      cfg,
      target: 'alice',
      currentUser: 'alice',
      deps: h.deps,
    }),
    /comment transport unavailable/
  );
  assert.deepEqual(h.mutations, []);
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

test('assign retries a pending completion audit without repeating ownership mutation', async () => {
  const intent = formatOwnershipAudit({
    issueNumber: 1212,
    from: null,
    to: 'alice',
    state: 'plan',
    phase: 'intent',
    tx: 'assign-retry-1',
  });
  const h = harness([{ state: 'plan', assignees: ['alice'] }]);
  h.deps.listAuditBodies = async () => [intent];
  const result = await runAssign({
    issueNumber: 1212,
    cfg,
    target: 'alice',
    currentUser: 'alice',
    deps: h.deps,
  });
  assert.equal(result.status, 'assigned');
  assert.deepEqual(h.mutations, []);
  assert.deepEqual(
    h.audits.map((audit) => audit.phase),
    ['completed']
  );
});

test('assign reports audit-pending after verified mutation when completion write fails', async () => {
  const h = harness([
    { state: 'plan', assignees: [] },
    { state: 'plan', assignees: ['alice'] },
  ]);
  let posts = 0;
  h.deps.postAudit = async (entry) => {
    posts += 1;
    h.audits.push(entry);
    if (entry.phase === 'completed') throw new Error('completion comment failed');
  };
  const result = await runAssign({
    issueNumber: 1212,
    cfg,
    target: 'alice',
    currentUser: 'alice',
    deps: h.deps,
  });
  assert.equal(result.status, 'assigned-audit-pending');
  assert.equal(posts, 2);
  assert.deepEqual(h.mutations, [{ action: 'add', login: 'alice' }]);
});

test('transfer retry repairs completion audit from the original owner workstation', async () => {
  const intent = formatOwnershipAudit({
    issueNumber: 1212,
    from: 'alice',
    to: 'bob',
    state: 'develop',
    phase: 'intent',
    tx: 'transfer-retry-1',
  });
  const h = harness([{ state: 'develop', assignees: ['bob'] }]);
  h.deps.listAuditBodies = async () => [intent];
  const result = await runAssign({
    issueNumber: 1212,
    cfg,
    target: 'bob',
    currentUser: 'alice',
    operation: 'transfer',
    deps: h.deps,
  });
  assert.equal(result.status, 'transferred');
  assert.deepEqual(h.mutations, []);
  assert.deepEqual(
    h.audits.map((audit) => audit.phase),
    ['completed']
  );
});

test('audit retry correlates by transaction id instead of suppressing a newer identical intent', async () => {
  const oldIntent = formatOwnershipAudit({
    issueNumber: 1212,
    from: null,
    to: 'alice',
    state: 'plan',
    phase: 'intent',
    tx: 'old-tx',
  });
  const oldCompleted = formatOwnershipAudit({
    issueNumber: 1212,
    from: null,
    to: 'alice',
    state: 'plan',
    phase: 'completed',
    tx: 'old-tx',
  });
  const newIntent = formatOwnershipAudit({
    issueNumber: 1212,
    from: null,
    to: 'alice',
    state: 'plan',
    phase: 'intent',
    tx: 'new-tx',
  });
  const h = harness([{ state: 'plan', assignees: ['alice'] }]);
  h.deps.listAuditBodies = async () => [oldIntent, oldCompleted, newIntent];

  const result = await runAssign({
    issueNumber: 1212,
    cfg,
    target: 'alice',
    currentUser: 'alice',
    deps: h.deps,
  });

  assert.equal(result.status, 'assigned');
  assert.deepEqual(h.mutations, []);
  assert.equal(h.audits[0].tx, 'new-tx');
});

test('transfer retry never completes a pending transaction for a different requested target', async () => {
  const bobIntent = formatOwnershipAudit({
    issueNumber: 1212,
    from: 'alice',
    to: 'bob',
    state: 'develop',
    phase: 'intent',
    tx: 'alice-to-bob',
  });
  const h = harness([{ state: 'develop', assignees: ['bob'] }]);
  h.deps.listAuditBodies = async () => [bobIntent];

  const result = await runAssign({
    issueNumber: 1212,
    cfg,
    target: 'carol',
    currentUser: 'alice',
    operation: 'transfer',
    deps: h.deps,
  });

  assert.equal(result.status, 'foreign-owner-refused');
  assert.deepEqual(h.audits, []);
  assert.deepEqual(h.mutations, []);
});

test('ownership verb refusals give the operator a concrete recovery action', () => {
  assert.match(
    formatOwnershipRefusal({
      operation: 'transfer',
      issueNumber: 1212,
      result: { status: 'foreign-owner-refused', assignees: ['bob'] },
      currentUser: 'alice',
    }),
    /@bob.*their workstation.*transfer.*@alice|human.*GitHub UI/i
  );
  assert.match(
    formatOwnershipRefusal({
      operation: 'assign',
      issueNumber: 1212,
      result: { status: 'multiple-owners-refused', assignees: ['alice', 'bob'] },
      currentUser: 'alice',
    }),
    /GitHub UI.*exactly one owner/i
  );
  assert.match(
    formatOwnershipRefusal({
      operation: 'assign',
      issueNumber: 1212,
      result: { status: 'assigned-audit-pending', assignees: ['alice'] },
      currentUser: 'alice',
    }),
    /ownership is verified[\s\S]*retry the exact same command/i
  );
});

test('Done preserves final ownership and refuses transfer', async () => {
  const h = harness([{ state: 'done', assignees: ['alice'] }]);
  const result = await runAssign({
    issueNumber: 1212,
    cfg,
    target: 'bob',
    currentUser: 'alice',
    operation: 'transfer',
    deps: h.deps,
  });
  assert.equal(result.status, 'done-ownership-immutable');
  assert.deepEqual(h.mutations, []);
  assert.deepEqual(h.audits, []);
});
