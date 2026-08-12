// @story #1212
import test from 'node:test';
import assert from 'node:assert/strict';

import { runPreflight } from '../../../lib/verb-preflight.mjs';
import {
  commitPlanExitOwnershipClaim,
  planExitOwnershipGuard,
} from '../../../lib/plan-exit-ownership-guard.mjs';
import { decideSourceEdit } from '../../../source-edit-gate.mjs';
import { evaluateGhEdit } from '../../../lib/gh-edit-guard.mjs';

const cfg = {
  repo: 'acme/widgets',
  projectId: 'PVT_target',
  preferences: { gateAssigneeMatch: true },
};

function preflightDeps({ state, assignees, currentUser = 'alice' }) {
  return {
    fetchLive: async () => state,
    fetchLastKnownState: async () => state,
    fetchLastStatusActor: async () => null,
    fetchAssignees: async () => assignees,
    fetchCurrentUser: async () => currentUser,
  };
}

test('preflight permits unassigned team work through Plan without Full-Auto claiming', async () => {
  for (const state of ['backlog', 'refine', 'ready-for-plan', 'plan']) {
    let claims = 0;
    const result = await runPreflight({
      stateBefore: { active: '#1212' },
      target: '#1212',
      cfg,
      deps: {
        ...preflightDeps({ state, assignees: [] }),
        env: { TT_FULL_AUTO: '1' },
        claimAssignee: async () => {
          claims += 1;
          return { ok: true };
        },
      },
    });
    assert.equal(result.ok, true);
    assert.equal(claims, 0);
  }
});

test('preflight blocks foreign multiple and lost in-flight ownership', async () => {
  const cases = [
    { state: 'refine', assignees: ['bob'], kind: 'foreign-owner' },
    { state: 'plan', assignees: ['alice', 'bob'], kind: 'multiple-owners' },
    { state: 'develop', assignees: [], kind: 'human-coordination-required' },
    { state: 'test', assignees: [], kind: 'human-coordination-required' },
    { state: 'review', assignees: [], kind: 'human-coordination-required' },
  ];
  for (const entry of cases) {
    const result = await runPreflight({
      stateBefore: { active: '#1212' },
      target: '#1212',
      cfg,
      deps: preflightDeps(entry),
    });
    assert.equal(result.ok, false);
    assert.equal(result.assigneeKind, entry.kind);
  }
});

test('Plan exit Full-Auto defers notice and assignment until the post-guard commit boundary', async () => {
  const order = [];
  const ctx = {
    issueNumber: 1212,
    fromState: 'plan',
    toState: 'develop',
    cfg,
    deps: {
      env: { TT_FULL_AUTO: '1' },
      ownership: {
        fetchCurrentUser: async () => 'alice',
        fetchSnapshot: async () => ({ state: 'plan', assignees: [] }),
        postNotice: async () => order.push('notice'),
        mutateAssignee: async ({ action, login }) => order.push(`${action}:${login}`),
      },
    },
  };
  const guardResult = await planExitOwnershipGuard.run(ctx);
  assert.deepEqual(guardResult, { ok: true });
  assert.deepEqual(order, [], 'guard aggregation must not mutate ownership');
  assert.deepEqual(ctx.planExitOwnershipClaim, { currentUser: 'alice' });

  const snapshots = [
    { state: 'plan', assignees: [] },
    { state: 'plan', assignees: ['ALICE'] },
  ];
  const result = await commitPlanExitOwnershipClaim({
    issueNumber: 1212,
    cfg,
    currentUser: ctx.planExitOwnershipClaim.currentUser,
    deps: {
      fetchSnapshot: async () => snapshots.shift(),
      postNotice: async () => order.push('notice'),
      mutateAssignee: async ({ action, login }) => order.push(`${action}:${login}`),
    },
  });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(order, ['notice', 'add:alice']);
});

test('Plan exit interactive mode prompts with zero assignment mutation', async () => {
  let writes = 0;
  const result = await planExitOwnershipGuard.run({
    issueNumber: 1212,
    fromState: 'plan',
    toState: 'develop',
    cfg,
    deps: {
      env: {},
      ownership: {
        fetchCurrentUser: async () => 'alice',
        fetchSnapshot: async () => ({ state: 'plan', assignees: [] }),
        postNotice: async () => {
          writes += 1;
        },
        mutateAssignee: async () => {
          writes += 1;
        },
      },
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /would you like me to assign.*@alice/i);
  assert.equal(writes, 0);
});

test('Plan exit refuses a foreign or multiple owner before notice or mutation', async () => {
  for (const assignees of [['bob'], ['alice', 'bob']]) {
    let writes = 0;
    const result = await planExitOwnershipGuard.run({
      issueNumber: 1212,
      fromState: 'plan',
      toState: 'develop',
      cfg,
      deps: {
        env: { TT_FULL_AUTO: '1' },
        ownership: {
          fetchCurrentUser: async () => 'alice',
          fetchSnapshot: async () => ({ state: 'plan', assignees }),
          postNotice: async () => {
            writes += 1;
          },
          mutateAssignee: async () => {
            writes += 1;
          },
        },
      },
    });
    assert.equal(result.ok, false);
    assert.equal(writes, 0);
  }
});

test('Plan exit commit treats thrown assignment transport as ambiguous despite matching read-back', async () => {
  const snapshots = [
    { state: 'plan', assignees: [] },
    { state: 'plan', assignees: ['alice'] },
  ];
  const result = await commitPlanExitOwnershipClaim({
    issueNumber: 1212,
    cfg,
    currentUser: 'alice',
    deps: {
      fetchSnapshot: async () => snapshots.shift(),
      postNotice: async () => {},
      mutateAssignee: async () => {
        throw new Error('502 after apply');
      },
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /ambiguous/i);
});

test('source edits in Develop require the exact singleton local owner', () => {
  const base = {
    toolName: 'Edit',
    filePath: '/repo/scripts/task-tracker/lib/example.mjs',
    projectDir: '/repo',
    boundIssue: '#1212',
    choreModeActive: false,
    issueState: 'develop',
    hasPostedMarker: true,
    hasCompleteMarker: true,
  };
  assert.equal(
    decideSourceEdit({ ...base, assignees: ['alice'], currentUser: 'ALICE' }).decision,
    'allow'
  );
  for (const assignees of [[], ['bob'], ['alice', 'bob'], null]) {
    const result = decideSourceEdit({ ...base, assignees, currentUser: 'alice' });
    assert.equal(result.decision, 'block');
    assert.equal(result.code, 'source-edit-ownership-gate');
  }
});

test('raw gh assignee edits are refused in favor of governed ownership verbs', () => {
  for (const command of [
    'gh issue edit 1212 --add-assignee @me',
    'git status && gh issue edit #1212 --remove-assignee alice',
  ]) {
    const result = evaluateGhEdit({ command });
    assert.equal(result.block, true);
    assert.match(result.reason, /npx aitm (?:assign|unassign)/);
  }
  assert.deepEqual(evaluateGhEdit({ command: 'gh issue edit 1212 --add-label defect' }), {
    block: false,
  });
});
