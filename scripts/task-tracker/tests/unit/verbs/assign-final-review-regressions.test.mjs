// @story #1207
// Final review regressions for assignment races that cross Status and assignee resources.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runAssign, runInvariantAwareClaim } from '../../../verbs/assign.mjs';

const cfg = { repo: 'o/r', assignee: 'configured-user' };

function finalRemovalHarness({
  ownerTiming = 'before',
  restoreExit = 0,
  restorationUnreadable = false,
  changingState = false,
} = {}) {
  const calls = { mutations: [], moves: [] };
  let assignees = ['alice'];
  let removalLanded = false;
  let stateReads = 0;
  let assigneeReads = 0;
  let restoring = false;

  return {
    calls,
    deps: {
      resolveLogin: async (login) => login,
      getLiveState: async () => {
        stateReads += 1;
        if (stateReads === 1) return 'assigned';
        if (restoring) {
          if (restorationUnreadable) throw new Error('restoration Status unreadable');
          return restoreExit === 0 ? 'assigned' : 'backlog';
        }
        if (changingState) return stateReads % 2 === 0 ? 'backlog' : 'assigned';
        if (ownerTiming === 'between' && stateReads === 2) assignees = ['bob'];
        if (ownerTiming === 'after' && stateReads === 4) assignees = ['bob'];
        return 'backlog';
      },
      fetchAssignees: async () => {
        assigneeReads += 1;
        if (!removalLanded) return ['alice'];
        return [...assignees];
      },
      mutateAssignee: async (args) => {
        calls.mutations.push(args);
        removalLanded = true;
        assignees = ownerTiming === 'before' ? ['bob'] : [];
      },
      runMoveState: async ({ target }) => {
        calls.moves.push(target);
        if (target === 'assigned') {
          restoring = true;
          return restoreExit;
        }
        return 0;
      },
    },
    reads: () => ({ stateReads, assigneeReads }),
  };
}

test('replacement owner appearing during the second trailing Status read is never missed', async () => {
  const calls = { mutations: [], moves: [] };
  let assignees = ['alice'];
  let stateReads = 0;
  let restoring = false;

  const result = await runAssign({
    issueNumber: 1217,
    login: 'alice',
    remove: true,
    cfg,
    deps: {
      resolveLogin: async (login) => login,
      getLiveState: async () => {
        stateReads += 1;
        if (stateReads === 1) return 'assigned';
        if (restoring) return 'assigned';
        // The first paired confirmation is Status(2), assignees, Status(3).
        // The second is Status(4), assignees, Status(5).  Publish Bob only
        // while that final trailing Status read is in flight: the old proof
        // returned success without making one last assignee observation.
        if (stateReads === 5) assignees = ['bob'];
        return 'backlog';
      },
      fetchAssignees: async () => [...assignees],
      mutateAssignee: async (args) => {
        calls.mutations.push(args);
        assignees = [];
      },
      runMoveState: async ({ target }) => {
        calls.moves.push(target);
        if (target === 'assigned') restoring = true;
        return 0;
      },
    },
  });

  assert.equal(result.status, 'unassigned-owner-remains-restored');
  assert.equal(result.state, 'assigned');
  assert.deepEqual(result.assignees, ['bob']);
  assert.deepEqual(calls.moves, ['backlog', 'assigned']);
});

test('an owner that disappears on the fresh closing read cannot legitimize Assigned', async () => {
  const calls = { moves: [] };
  let state = 'assigned';
  let assigneeReads = 0;
  let removed = false;

  const result = await runAssign({
    issueNumber: 1218,
    login: 'alice',
    remove: true,
    cfg,
    deps: {
      resolveLogin: async (login) => login,
      getLiveState: async () => state,
      fetchAssignees: async () => {
        assigneeReads += 1;
        if (!removed) return ['alice'];
        // Observe Bob before the trailing Status, then observe the authoritative
        // fresh close as empty. Assigned+empty must never be called success.
        return assigneeReads === 2 ? ['bob'] : [];
      },
      mutateAssignee: async () => {
        removed = true;
        state = 'assigned';
      },
      runMoveState: async ({ target }) => {
        calls.moves.push(target);
        state = target;
        return 0;
      },
    },
  });

  assert.equal(result.status, 'owner-remains-restore-failed');
  assert.equal(result.exitCode, 1);
  assert.deepEqual(calls.moves, ['backlog', 'assigned']);
});

for (const ownerTiming of ['before', 'between', 'after']) {
  test(`replacement owner appearing ${ownerTiming} final paired reads restores Assigned`, async () => {
    const { calls, deps } = finalRemovalHarness({ ownerTiming });

    const result = await runAssign({
      issueNumber: 1207,
      login: 'alice',
      remove: true,
      cfg,
      deps,
    });

    assert.equal(result.status, 'unassigned-owner-remains-restored');
    assert.equal(result.state, 'assigned');
    assert.deepEqual(result.assignees, ['bob']);
    assert.deepEqual(calls.moves, ['backlog', 'assigned']);
  });
}

test('a Status change between final paired reads is indeterminate, never clean success', async () => {
  const { calls, deps } = finalRemovalHarness({ ownerTiming: 'never', changingState: true });

  const result = await runAssign({
    issueNumber: 1208,
    login: 'alice',
    remove: true,
    cfg,
    deps,
  });

  assert.equal(result.status, 'remove-outcome-indeterminate');
  assert.equal(result.exitCode, 1);
  assert.deepEqual(calls.moves, ['backlog']);
});

test('replacement owner restoration failure is verified and nonzero', async () => {
  const { calls, deps } = finalRemovalHarness({ ownerTiming: 'between', restoreExit: 11 });

  const result = await runAssign({
    issueNumber: 1209,
    login: 'alice',
    remove: true,
    cfg,
    deps,
  });

  assert.equal(result.status, 'owner-remains-restore-failed');
  assert.equal(result.exitCode, 11);
  assert.equal(result.state, 'backlog');
  assert.deepEqual(calls.moves, ['backlog', 'assigned']);
});

test('replacement owner restoration with unreadable Status is explicitly indeterminate', async () => {
  const { calls, deps } = finalRemovalHarness({
    ownerTiming: 'between',
    restorationUnreadable: true,
  });

  const result = await runAssign({
    issueNumber: 1210,
    login: 'alice',
    remove: true,
    cfg,
    deps,
  });

  assert.equal(result.status, 'owner-remains-restore-indeterminate');
  assert.equal(result.exitCode, 1);
  assert.match(result.message, /restoration Status unreadable/);
  assert.deepEqual(calls.moves, ['backlog', 'assigned']);
});

test('failed Assigned move never compensates across a changing Status snapshot', async () => {
  const calls = { mutations: [], stateReads: 0, assigneeReads: 0 };
  const result = await runAssign({
    issueNumber: 1219,
    login: 'alice',
    cfg,
    deps: {
      resolveLogin: async (login) => login,
      getLiveState: async () => {
        calls.stateReads += 1;
        if (calls.stateReads <= 2) return 'backlog';
        return 'assigned';
      },
      fetchAssignees: async () => {
        calls.assigneeReads += 1;
        return calls.assigneeReads === 1 ? [] : ['alice'];
      },
      mutateAssignee: async (args) => calls.mutations.push(args),
      runMoveState: async () => 11,
    },
  });

  assert.equal(result.status, 'move-outcome-indeterminate');
  assert.equal(result.exitCode, 11);
  assert.deepEqual(calls.mutations, [
    { issueNumber: 1219, repo: 'o/r', login: 'alice', remove: false },
  ]);
});

function claimHarness({
  authoritative = [],
  authoritativeError = null,
  concurrentPostMutationOwner = null,
} = {}) {
  const calls = { mutations: [], moves: [], reads: 0 };
  let assignees = [];
  return {
    calls,
    deps: {
      withIssueLock: async (_options, fn) => fn(),
      resolveLogin: async () => 'alice',
      getLiveState: async () => 'backlog',
      fetchAssignees: async () => {
        calls.reads += 1;
        if (calls.reads === 1) return [];
        if (calls.reads === 2) {
          if (authoritativeError) throw authoritativeError;
          assignees = [...authoritative];
          return [...assignees];
        }
        return [...assignees];
      },
      mutateAssignee: async ({ login, remove }) => {
        calls.mutations.push({ login, remove });
        assignees = remove
          ? assignees.filter((entry) => entry.toLowerCase() !== 'alice')
          : [
              ...assignees,
              ...(concurrentPostMutationOwner ? [concurrentPostMutationOwner] : []),
              'alice',
            ];
      },
      runMoveState: async ({ target }) => {
        calls.moves.push(target);
        return 0;
      },
    },
  };
}

test('claim-only saga refuses a concurrent owner that appears after its optimistic pre-check', async () => {
  const { calls, deps } = claimHarness({ authoritative: ['bob'] });

  const result = await runInvariantAwareClaim({ issueNumber: 1211, cfg, deps });

  assert.deepEqual(result, { ok: false, kind: 'already-assigned', assignees: ['bob'] });
  assert.deepEqual(calls.mutations, []);
  assert.deepEqual(calls.moves, []);
});

test('claim-only saga treats a case-variant current identity as occupied, not claimable', async () => {
  const { calls, deps } = claimHarness({ authoritative: ['ALICE'] });

  const result = await runInvariantAwareClaim({ issueNumber: 1212, cfg, deps });

  assert.deepEqual(result, { ok: false, kind: 'already-assigned', assignees: ['ALICE'] });
  assert.deepEqual(calls.mutations, []);
  assert.deepEqual(calls.moves, []);
});

test('claim-only authoritative assignee transport failure is fail-closed', async () => {
  const { calls, deps } = claimHarness({
    authoritativeError: new Error('authoritative assignee transport unavailable'),
  });

  const result = await runInvariantAwareClaim({ issueNumber: 1213, cfg, deps });

  assert.equal(result.ok, false);
  assert.equal(result.kind, 'error');
  assert.match(result.message, /authoritative assignee transport unavailable/);
  assert.deepEqual(calls.mutations, []);
  assert.deepEqual(calls.moves, []);
});

test('claim-only unchanged-empty path adds the caller and moves Backlog to Assigned', async () => {
  const { calls, deps } = claimHarness();

  const result = await runInvariantAwareClaim({ issueNumber: 1214, cfg, deps });

  assert.equal(result.ok, true);
  assert.equal(result.claimed, true);
  assert.deepEqual(calls.mutations, [{ login: '@me', remove: false }]);
  assert.deepEqual(calls.moves, ['assigned']);
});

test('claim-only compensates itself when another owner appears after the authoritative snapshot', async () => {
  const { calls, deps } = claimHarness({ concurrentPostMutationOwner: 'bob' });

  const result = await runInvariantAwareClaim({ issueNumber: 1216, cfg, deps });

  assert.deepEqual(result, { ok: false, kind: 'already-assigned', assignees: ['bob'] });
  assert.deepEqual(calls.mutations, [
    { login: '@me', remove: false },
    { login: '@me', remove: true },
  ]);
  assert.deepEqual(calls.moves, []);
});

test('generic non-claim assignment still permits adding another owner', async () => {
  const calls = { mutations: [], moves: [] };
  let assignees = ['alice'];
  const result = await runAssign({
    issueNumber: 1215,
    login: 'bob',
    cfg,
    deps: {
      resolveLogin: async (login) => login,
      getLiveState: async () => 'assigned',
      fetchAssignees: async () => [...assignees],
      mutateAssignee: async ({ login, remove }) => {
        calls.mutations.push({ login, remove });
        assignees.push(login);
      },
      runMoveState: async ({ target }) => calls.moves.push(target) && 0,
    },
  });

  assert.equal(result.status, 'assigned');
  assert.deepEqual(calls.mutations, [{ login: 'bob', remove: false }]);
  assert.deepEqual(calls.moves, []);
});
