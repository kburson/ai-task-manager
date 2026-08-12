// @story #1212
// cspell:ignore Fquery
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

test('reconcile ownership-only preflight blocks foreign ownership but permits drift repair', async () => {
  const owned = await runPreflight({
    stateBefore: { active: '#1212' },
    target: '#1212',
    cfg,
    ownershipOnly: true,
    deps: {
      ...preflightDeps({ state: 'develop', assignees: ['alice'] }),
      fetchLastKnownState: async () => 'plan',
    },
  });
  assert.equal(owned.ok, true);

  const foreign = await runPreflight({
    stateBefore: { active: '#1212' },
    target: '#1212',
    cfg,
    ownershipOnly: true,
    deps: preflightDeps({ state: 'develop', assignees: ['bob'] }),
  });
  assert.equal(foreign.ok, false);
  assert.equal(foreign.assigneeKind, 'foreign-owner');
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
  assert.deepEqual(ctx.planExitOwnershipClaim, { currentUser: 'alice', mode: 'full-auto' });

  const snapshots = [
    { state: 'plan', assignees: [] },
    { state: 'plan', assignees: ['ALICE'] },
  ];
  const result = await commitPlanExitOwnershipClaim({
    issueNumber: 1212,
    cfg,
    currentUser: ctx.planExitOwnershipClaim.currentUser,
    mode: ctx.planExitOwnershipClaim.mode,
    deps: {
      fetchCurrentUser: async () => 'alice',
      fetchSnapshot: async () => snapshots.shift(),
      postNotice: async () => order.push('notice'),
      mutateAssignee: async ({ action, login }) => order.push(`${action}:${login}`),
    },
  });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(order, ['notice', 'add:alice']);
});

test('Plan exit always schedules under-lock revalidation for an existing local owner', async () => {
  const ctx = {
    issueNumber: 1212,
    fromState: 'plan',
    toState: 'develop',
    cfg,
    deps: {
      env: { TT_FULL_AUTO: '1' },
      ownership: {
        fetchCurrentUser: async () => 'alice',
        fetchSnapshot: async () => ({ state: 'plan', assignees: ['alice'] }),
      },
    },
  };
  assert.deepEqual(await planExitOwnershipGuard.run(ctx), { ok: true });
  assert.deepEqual(ctx.planExitOwnershipClaim, { currentUser: 'alice', mode: 'full-auto' });
});

test('Plan exit refuses stale non-Plan snapshots before and under the issue lock', async () => {
  const outside = await planExitOwnershipGuard.run({
    issueNumber: 1212,
    fromState: 'plan',
    toState: 'develop',
    cfg,
    deps: {
      env: { TT_FULL_AUTO: '1' },
      ownership: {
        fetchCurrentUser: async () => 'alice',
        fetchSnapshot: async () => ({ state: 'review', assignees: ['alice'] }),
      },
    },
  });
  assert.equal(outside.ok, false);
  assert.match(outside.reason, /expected Status plan/i);

  const inside = await commitPlanExitOwnershipClaim({
    issueNumber: 1212,
    cfg,
    currentUser: 'alice',
    deps: {
      fetchCurrentUser: async () => 'alice',
      fetchSnapshot: async () => ({ state: 'review', assignees: ['alice'] }),
    },
  });
  assert.equal(inside.ok, false);
  assert.match(inside.reason, /expected Status plan/i);
});

test('Plan exit under-lock revalidation refuses ownership changed after guard aggregation', async () => {
  const result = await commitPlanExitOwnershipClaim({
    issueNumber: 1212,
    cfg,
    currentUser: 'alice',
    deps: {
      fetchCurrentUser: async () => 'alice',
      fetchSnapshot: async () => ({ state: 'plan', assignees: ['bob'] }),
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /singleton @alice|observed.*@bob/i);
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

test('interactive Plan revalidation never turns a lost owner into a Full-Auto claim', async () => {
  let writes = 0;
  const result = await commitPlanExitOwnershipClaim({
    issueNumber: 1212,
    cfg,
    currentUser: 'alice',
    mode: 'interactive',
    deps: {
      fetchCurrentUser: async () => 'alice',
      fetchSnapshot: async () => ({ state: 'plan', assignees: [] }),
      postNotice: async () => {
        writes += 1;
      },
      mutateAssignee: async () => {
        writes += 1;
      },
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /assignment-required|would you like/i);
  assert.equal(writes, 0);
});

test('Plan revalidation refreshes authenticated identity under lock', async () => {
  const result = await commitPlanExitOwnershipClaim({
    issueNumber: 1212,
    cfg,
    currentUser: 'alice',
    mode: 'full-auto',
    deps: {
      fetchCurrentUser: async () => 'bob',
      fetchSnapshot: async () => ({ state: 'plan', assignees: ['alice'] }),
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /identity-changed.*@alice.*@bob/i);
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
      fetchCurrentUser: async () => 'alice',
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
    'gh -R o/r issue edit 1212 --add-assignee bob',
    'gh api --method PATCH repos/o/r/issues/1212 --field=assignees[]=bob',
    "gh api graphql -f 'query=mutation { updateIssue(input:$input) { issue { id } } }' -F 'input[assigneeIds][]=U_1'",
    'gh api graphql -f \'query=mutation { addAssigneesToAssignable(input:{assignableId:"I",assigneeIds:["U"]}) { clientMutationId } }\'',
    'gh api graphql --input .tmp/ownership-mutation.json',
    'gh api graphql -F query=@.tmp/ownership-mutation.graphql',
    "sh -c 'gh issue edit 1212 --add-assignee bob'",
    'gh api -X PATCH "$ISSUE_ENDPOINT" --input=.tmp/assignees.json',
    "bash -lc 'gh issue edit 1212 --add-assignee bob'",
    'gh api -X POST repos/o/r/issues/1212/assignees -f assignees[]=bob',
    'gh api -X DELETE repos/o/r/issues/1212/assignees -f assignees[]=alice',
    'gh api -X PATCH "$ISSUE_ENDPOINT" -f assignees[]=bob',
    'gh api graphql -Fquery=@file',
    'gh api graphql --field=query=@file',
  ]) {
    const result = evaluateGhEdit({ command });
    assert.equal(result.block, true);
    assert.match(result.reason, /npx aitm (?:assign|unassign)/);
  }
  assert.deepEqual(evaluateGhEdit({ command: 'gh issue edit 1212 --add-label defect' }), {
    block: false,
  });
});
