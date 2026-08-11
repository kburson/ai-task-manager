// @story #1207
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  ASSIGNED_ASSIGNEE_GUARD_ID,
  EXIT_ASSIGNED_REQUIRES_ASSIGNEE,
  assignedRequiresAssigneeGuard,
  classifyAssignedAssigneeDrift,
  parseAssigneeLogins,
  resolveAssignmentTarget,
  resolveConfiguredProjectState,
} from '../../../lib/assigned-assignee-invariant.mjs';

test('strict assignee parser accepts string and login-object arrays', () => {
  assert.deepEqual(parseAssigneeLogins([]), []);
  assert.deepEqual(parseAssigneeLogins(['alice', 'bob']), ['alice', 'bob']);
  assert.deepEqual(parseAssigneeLogins({ assignees: [{ login: 'alice' }, { login: 'bob' }] }), [
    'alice',
    'bob',
  ]);
});

test('strict assignee parser rejects malformed payloads instead of treating them as empty', () => {
  for (const payload of [null, undefined, '', {}, { assignees: null }, [{ name: 'alice' }]]) {
    assert.throws(() => parseAssigneeLogins(payload), /assignee payload/i);
  }
});

test('Assigned entry guard allows one or multiple assignees', async () => {
  for (const assignees of [['alice'], ['alice', 'bob']]) {
    const result = await assignedRequiresAssigneeGuard.run({
      issueNumber: 1207,
      repo: 'owner/repo',
      deps: { fetchAssignedInvariantAssignees: async () => assignees },
    });
    assert.deepEqual(result, { ok: true });
  }
});

test('Assigned entry guard refuses an empty list with a distinct code', async () => {
  const result = await assignedRequiresAssigneeGuard.run({
    issueNumber: 1207,
    repo: 'owner/repo',
    deps: { fetchAssignedInvariantAssignees: async () => [] },
  });
  assert.equal(ASSIGNED_ASSIGNEE_GUARD_ID, 'assigned-requires-assignee');
  assert.equal(EXIT_ASSIGNED_REQUIRES_ASSIGNEE, 11);
  assert.deepEqual(result, {
    ok: false,
    exitCode: EXIT_ASSIGNED_REQUIRES_ASSIGNEE,
    reason: '#1207 cannot enter Assigned: at least one live GitHub assignee is required.',
  });
});

test('Assigned entry guard fails closed and names transport and payload causes', async () => {
  const transport = await assignedRequiresAssigneeGuard.run({
    issueNumber: 1207,
    repo: 'owner/repo',
    deps: {
      fetchAssignedInvariantAssignees: async () => {
        throw new Error('HTTP 503 from GitHub');
      },
    },
  });
  assert.equal(transport.ok, false);
  assert.equal(transport.exitCode, EXIT_ASSIGNED_REQUIRES_ASSIGNEE);
  assert.match(transport.reason, /HTTP 503 from GitHub/);

  const malformed = await assignedRequiresAssigneeGuard.run({
    issueNumber: 1207,
    repo: 'owner/repo',
    deps: { fetchAssignedInvariantAssignees: async () => ({ assignees: 'alice' }) },
  });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.exitCode, EXIT_ASSIGNED_REQUIRES_ASSIGNEE);
  assert.match(malformed.reason, /assignee payload/i);
});

test('drift classifier binds only Backlog and Assigned', () => {
  assert.deepEqual(classifyAssignedAssigneeDrift({ state: 'assigned', assignees: [] }), {
    kind: 'assigned-without-assignee',
    targetState: 'backlog',
  });
  assert.deepEqual(classifyAssignedAssigneeDrift({ state: 'backlog', assignees: ['alice'] }), {
    kind: 'backlog-with-assignee',
    targetState: 'assigned',
  });
  assert.deepEqual(classifyAssignedAssigneeDrift({ state: 'assigned', assignees: ['alice'] }), {
    kind: 'none',
    targetState: null,
  });
  assert.deepEqual(classifyAssignedAssigneeDrift({ state: 'backlog', assignees: [] }), {
    kind: 'none',
    targetState: null,
  });
  for (const state of ['refine', 'plan', 'develop', 'test', 'review', 'done']) {
    assert.deepEqual(classifyAssignedAssigneeDrift({ state, assignees: [] }), {
      kind: 'out-of-scope',
      targetState: null,
    });
  }
});

test('assignment target uses configured login with @me fallback', () => {
  assert.equal(resolveAssignmentTarget({ assignee: 'octocat' }), 'octocat');
  assert.equal(resolveAssignmentTarget({ assignee: '  octocat  ' }), 'octocat');
  assert.equal(resolveAssignmentTarget({}), '@me');
  assert.equal(resolveAssignmentTarget(null), '@me');
});

test('configured-project state resolver refuses missing, foreign, null, and unknown state', () => {
  const configured = {
    project: { id: 'P1' },
    fieldValueByName: { name: 'Assigned' },
  };
  assert.equal(resolveConfiguredProjectState([configured], 'P1'), 'assigned');
  for (const nodes of [
    [],
    [{ project: { id: 'FOREIGN' }, fieldValueByName: { name: 'Backlog' } }],
    [{ project: { id: 'P1' }, fieldValueByName: null }],
    [{ project: { id: 'P1' }, fieldValueByName: { name: 'Mystery' } }],
  ]) {
    assert.throws(
      () => resolveConfiguredProjectState(nodes, 'P1'),
      /configured project|recognized/i
    );
  }
});
