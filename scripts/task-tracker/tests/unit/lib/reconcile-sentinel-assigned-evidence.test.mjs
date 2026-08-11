// @story #1207
// Revert-to-sentinel must prove Assigned ownership before any evidence repair.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runReconcile } from '../../../verbs/reconcile.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

function assignedSentinelBody(recorded) {
  return [
    `<!-- aitm-last-known-state state="${recorded}" ts="2026-08-11T00:00:00.000Z" -->`,
    '<!-- aitm-move-complete state=assigned ts=2026-08-11T00:00:01.000Z -->',
  ].join('\n');
}

function harness({ recorded = 'backlog', assignees = ['alice'], assigneeError = null } = {}) {
  const body = assignedSentinelBody(recorded);
  const calls = {
    assigneeReads: 0,
    statusWrites: [],
    bodyWrites: [],
    audits: [],
    persists: [],
  };
  return {
    calls,
    deps: {
      fetchIssueBody: async () => ({ body }),
      getLiveState: async () => 'assigned',
      fetchAssignees: async () => {
        calls.assigneeReads += 1;
        if (assigneeError) throw assigneeError;
        return assignees;
      },
      runSentinelStatusWrite: async (args) => {
        calls.statusWrites.push(args);
        return 0;
      },
      mutateIssueBody: async ({ mutate }) => {
        const next = mutate(body);
        if (/aitm-reverted/.test(next)) calls.audits.push(next);
        else calls.bodyWrites.push(next);
        return { status: 'ok' };
      },
      postComment: async () => {},
      warn: () => {},
      persistTrackerState: (args) => calls.persists.push(args),
    },
  };
}

function assertNoWrites(calls) {
  assert.deepEqual(calls.statusWrites, []);
  assert.deepEqual(calls.bodyWrites, []);
  assert.deepEqual(calls.audits, []);
  assert.deepEqual(calls.persists, []);
}

test('marker-only Assigned sentinel drift refuses empty ownership before every write', async () => {
  const { calls, deps } = harness({ assignees: [] });

  const result = await runReconcile({
    issueNumber: 1207,
    mode: 'revert-to-sentinel',
    cfg,
    deps,
  });

  assert.equal(result.status, 'transition-failed');
  assert.equal(result.exitCode, 11);
  assert.equal(calls.assigneeReads, 1);
  assertNoWrites(calls);
});

test('marker-only Assigned sentinel drift refuses unreadable ownership before every write', async () => {
  const { calls, deps } = harness({
    assigneeError: new Error('assigned ownership transport unavailable'),
  });

  const result = await runReconcile({
    issueNumber: 1208,
    mode: 'revert-to-sentinel',
    cfg,
    deps,
  });

  assert.equal(result.status, 'transition-failed');
  assert.equal(result.exitCode, 11);
  assert.equal(calls.assigneeReads, 1);
  assertNoWrites(calls);
});

test('marker-only Assigned sentinel drift repairs evidence after ownership proof', async () => {
  const { calls, deps } = harness({ assignees: [{ login: 'Alice' }] });

  const result = await runReconcile({
    issueNumber: 1209,
    mode: 'revert-to-sentinel',
    cfg,
    deps,
  });

  assert.equal(result.status, 'reconciled');
  assert.equal(calls.assigneeReads, 1);
  assert.deepEqual(calls.statusWrites, []);
  assert.equal(calls.bodyWrites.length, 1);
  assert.equal(calls.audits.length, 1);
  assert.deepEqual(calls.persists, [{ issueNumber: 1209, state: 'assigned' }]);
});

test('exact Assigned sentinel alignment remains a zero-read zero-write no-drift refusal', async () => {
  const { calls, deps } = harness({ recorded: 'assigned', assignees: [] });

  const result = await runReconcile({
    issueNumber: 1210,
    mode: 'revert-to-sentinel',
    cfg,
    deps,
  });

  assert.equal(result.status, 'no-drift-refused');
  assert.equal(calls.assigneeReads, 0);
  assertNoWrites(calls);
});
