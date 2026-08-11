// @story #1207
// Accept-live must not legitimize ownerless Assigned drift with durable evidence.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runReconcile } from '../../../verbs/reconcile.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

function bodyWithState(state) {
  return `<!-- aitm-last-known-state state="${state}" ts="2026-08-11T00:00:00.000Z" -->`;
}

function harness({ recorded = 'backlog', assignees = ['alice'], assigneeError = null } = {}) {
  const body = bodyWithState(recorded);
  const calls = { assigneeReads: 0, bodyWrites: [], audits: [], persists: [] };
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
      writeIssueBody: async ({ body: next }) => calls.bodyWrites.push(next),
      mutateIssueBody: async ({ mutate }) => calls.audits.push(mutate(body)),
      persistTrackerState: (args) => calls.persists.push(args),
    },
  };
}

function assertNoWrites(calls) {
  assert.deepEqual(calls.bodyWrites, []);
  assert.deepEqual(calls.audits, []);
  assert.deepEqual(calls.persists, []);
}

for (const scenario of [
  { label: 'empty ownership', assignees: [] },
  { label: 'unreadable ownership', assigneeError: new Error('assignee transport unavailable') },
]) {
  test(`accept-live Assigned refuses ${scenario.label} before every evidence write`, async () => {
    const { calls, deps } = harness(scenario);
    const result = await runReconcile({ issueNumber: 1220, mode: 'accept-live', cfg, deps });

    assert.equal(result.status, 'transition-failed');
    assert.equal(result.exitCode, 11);
    assert.equal(calls.assigneeReads, 1);
    assertNoWrites(calls);
  });
}

test('accept-live Assigned writes evidence after ownership proof', async () => {
  const { calls, deps } = harness({ assignees: [{ login: 'Alice' }] });
  const result = await runReconcile({ issueNumber: 1221, mode: 'accept-live', cfg, deps });

  assert.equal(result.status, 'reconciled');
  assert.equal(calls.assigneeReads, 1);
  assert.equal(calls.bodyWrites.length, 1);
  assert.equal(calls.audits.length, 1);
  assert.deepEqual(calls.persists, [{ issueNumber: 1221, state: 'assigned' }]);
});

test('accept-live exact Assigned no-drift remains zero-read and zero-write', async () => {
  const { calls, deps } = harness({ recorded: 'assigned', assignees: [] });
  const result = await runReconcile({ issueNumber: 1222, mode: 'accept-live', cfg, deps });

  assert.equal(result.status, 'no-drift-refused');
  assert.equal(calls.assigneeReads, 0);
  assertNoWrites(calls);
});
