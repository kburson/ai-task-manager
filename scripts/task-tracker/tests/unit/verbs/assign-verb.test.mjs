// @story #1207
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { parseArgs, runAssign } from '../../../verbs/assign.mjs';

const cfg = { repo: 'o/r', assignee: 'configured-user' };

function harness({ state = 'backlog', assignees = [], moveCodes = [], mutationError = null } = {}) {
  const calls = { mutations: [], moves: [] };
  let current = [...assignees];
  let currentState = state;
  return {
    calls,
    deps: {
      resolveLogin: async (login) => login,
      getLiveState: async () => currentState,
      fetchAssignees: async () => [...current],
      mutateAssignee: async ({ login, remove }) => {
        calls.mutations.push({ login, remove });
        if (mutationError) throw mutationError;
        current = remove
          ? current.filter((entry) => entry !== login)
          : [...new Set([...current, login])];
      },
      runMoveState: async ({ target }) => {
        calls.moves.push(target);
        const exitCode = moveCodes.length ? moveCodes.shift() : 0;
        if (exitCode === 0) currentState = target;
        return exitCode;
      },
    },
  };
}

test('add uses configured login and moves Backlog to Assigned', async () => {
  const { calls, deps } = harness();
  const result = await runAssign({ issueNumber: 21, cfg, deps });
  assert.equal(result.status, 'assigned');
  assert.equal(result.login, 'configured-user');
  assert.deepEqual(calls.mutations, [{ login: 'configured-user', remove: false }]);
  assert.deepEqual(calls.moves, ['assigned']);
});

test('add falls back to @me and is idempotent when already assigned', async () => {
  const { calls, deps } = harness({ state: 'assigned', assignees: ['@me'] });
  const result = await runAssign({ issueNumber: 22, cfg: { repo: 'o/r' }, deps });
  assert.equal(result.status, 'already-assigned');
  assert.equal(result.login, '@me');
  assert.deepEqual(calls.mutations, []);
  assert.deepEqual(calls.moves, []);
});

test('existing assignee on Backlog moves to Assigned without a duplicate assignee write', async () => {
  const { calls, deps } = harness({ assignees: ['configured-user'] });
  const result = await runAssign({ issueNumber: 23, cfg, deps });
  assert.equal(result.status, 'assigned');
  assert.deepEqual(calls.mutations, []);
  assert.deepEqual(calls.moves, ['assigned']);
});

test('failed Backlog move compensates only the assignee added by this invocation', async () => {
  const { calls, deps } = harness({ moveCodes: [11] });
  const result = await runAssign({ issueNumber: 24, login: 'alice', cfg, deps });
  assert.equal(result.status, 'move-failed-compensated');
  assert.equal(result.exitCode, 11);
  assert.deepEqual(calls.mutations, [
    { login: 'alice', remove: false },
    { login: 'alice', remove: true },
  ]);
});

test('failed post-add verification compensates the assignee added by this invocation', async () => {
  const { calls, deps } = harness();
  let reads = 0;
  deps.fetchAssignees = async () => {
    reads += 1;
    if (reads === 1) return [];
    throw new Error('verification unavailable');
  };
  const result = await runAssign({ issueNumber: 241, login: 'alice', cfg, deps });
  assert.equal(result.status, 'assignment-verification-failed-compensation-unverified');
  assert.deepEqual(calls.mutations, [
    { login: 'alice', remove: false },
    { login: 'alice', remove: true },
  ]);
  assert.deepEqual(calls.moves, []);
});

test('removing the final Assigned assignee demotes before removing', async () => {
  const { calls, deps } = harness({ state: 'assigned', assignees: ['alice'] });
  const result = await runAssign({ issueNumber: 25, login: 'alice', remove: true, cfg, deps });
  assert.equal(result.status, 'unassigned');
  assert.deepEqual(calls.moves, ['backlog']);
  assert.deepEqual(calls.mutations, [{ login: 'alice', remove: true }]);
});

test('removing one of multiple Assigned assignees does not demote', async () => {
  const { calls, deps } = harness({ state: 'assigned', assignees: ['alice', 'bob'] });
  const result = await runAssign({ issueNumber: 26, login: 'alice', remove: true, cfg, deps });
  assert.equal(result.status, 'unassigned');
  assert.deepEqual(calls.moves, []);
});

test('removing the final assignee from a later state never moves backward', async () => {
  const { calls, deps } = harness({ state: 'develop', assignees: ['alice'] });
  const result = await runAssign({ issueNumber: 27, login: 'alice', remove: true, cfg, deps });
  assert.equal(result.status, 'unassigned');
  assert.deepEqual(calls.moves, []);
});

test('failed final-assignee removal restores Assigned while the assignee still exists', async () => {
  const { calls, deps } = harness({
    state: 'assigned',
    assignees: ['alice'],
    mutationError: new Error('edit failed'),
  });
  const result = await runAssign({ issueNumber: 28, login: 'alice', remove: true, cfg, deps });
  assert.equal(result.status, 'remove-failed-restored');
  assert.equal(result.exitCode, 1);
  assert.deepEqual(calls.moves, ['backlog', 'assigned']);
});

test('assignee read failures fail closed before any mutation', async () => {
  const { calls, deps } = harness();
  deps.fetchAssignees = async () => {
    throw new Error('transport failed');
  };
  const result = await runAssign({ issueNumber: 29, cfg, deps });
  assert.equal(result.status, 'error');
  assert.match(result.message, /transport failed/);
  assert.deepEqual(calls.mutations, []);
  assert.deepEqual(calls.moves, []);
});

test('documented positional login is parsed alongside the explicit assignee flag', () => {
  assert.deepEqual(parseArgs(['#30', 'alice']), {
    issueNumber: 30,
    login: 'alice',
    remove: false,
  });
  assert.deepEqual(parseArgs(['31', '--assignee', 'bob', '--remove']), {
    issueNumber: 31,
    login: 'bob',
    remove: true,
  });
});

test('unknown live state fails closed before any assignment mutation', async () => {
  const { calls, deps } = harness({ state: null });
  const result = await runAssign({ issueNumber: 32, login: 'alice', cfg, deps });
  assert.equal(result.status, 'error');
  assert.match(result.message, /live project state/i);
  assert.deepEqual(calls.mutations, []);
  assert.deepEqual(calls.moves, []);
});

test('login identity comparison is case-insensitive and never compensates a pre-existing identity', async () => {
  const { calls, deps } = harness({ assignees: ['Alice'], moveCodes: [11] });
  const result = await runAssign({ issueNumber: 33, login: 'alice', cfg, deps });
  assert.equal(result.status, 'move-failed');
  assert.deepEqual(calls.mutations, [], 'pre-existing Alice must never be removed as compensation');
  assert.deepEqual(calls.moves, ['assigned']);
});

test('final-assignee removal that remains visible restores Assigned', async () => {
  const { calls, deps } = harness({ state: 'assigned', assignees: ['alice'] });
  deps.mutateAssignee = async ({ login, remove }) => {
    calls.mutations.push({ login, remove });
  };
  const result = await runAssign({ issueNumber: 34, login: 'alice', remove: true, cfg, deps });
  assert.equal(result.status, 'remove-verification-failed-restored');
  assert.deepEqual(calls.moves, ['backlog', 'assigned']);
});

test('final-assignee removal read failure makes restoration explicitly indeterminate', async () => {
  const { calls, deps } = harness({ state: 'assigned', assignees: ['alice'] });
  let reads = 0;
  deps.fetchAssignees = async () => {
    reads += 1;
    if (reads === 1) return ['alice'];
    throw new Error('post-remove transport failed');
  };
  const result = await runAssign({ issueNumber: 35, login: 'alice', remove: true, cfg, deps });
  assert.equal(result.status, 'remove-verification-failed-restore-indeterminate');
  assert.ok(reads >= 3);
  assert.deepEqual(calls.moves, ['backlog', 'assigned']);
});

test('Assigned to Backlog move carries invariant demotion provenance', async () => {
  const seen = [];
  const { deps } = harness({ state: 'assigned', assignees: ['alice'] });
  deps.runMoveState = async (args) => {
    seen.push(args);
    return 0;
  };
  await runAssign({ issueNumber: 36, login: 'alice', remove: true, cfg, deps });
  assert.match(seen[0].reason, /final assignee removal/i);
});

for (const [failureName, exitCode] of [
  ['sentinel', 7],
  ['consistency', 8],
]) {
  test(`post-Status ${failureName} failure keeps the added assignee when Assigned landed`, async () => {
    const { calls, deps } = harness({ moveCodes: [exitCode] });
    const states = ['backlog', 'assigned'];
    deps.getLiveState = async () => states.shift();

    const result = await runAssign({ issueNumber: 37, login: 'alice', cfg, deps });

    assert.equal(result.status, 'assigned-move-incomplete');
    assert.equal(result.exitCode, exitCode);
    assert.equal(result.state, 'assigned');
    assert.deepEqual(calls.mutations, [{ login: 'alice', remove: false }]);
  });

  test(`post-Status ${failureName} failure continues final-assignee removal when Backlog landed`, async () => {
    const { calls, deps } = harness({
      state: 'assigned',
      assignees: ['alice'],
      moveCodes: [exitCode],
    });
    const states = ['assigned', 'backlog', 'backlog'];
    deps.getLiveState = async () => states.shift();

    const result = await runAssign({
      issueNumber: 38,
      login: 'alice',
      remove: true,
      cfg,
      deps,
    });

    assert.equal(result.status, 'unassigned-move-incomplete');
    assert.equal(result.exitCode, exitCode);
    assert.equal(result.state, 'backlog');
    assert.deepEqual(calls.mutations, [{ login: 'alice', remove: true }]);
  });
}

test('indeterminate failed move never removes the assignee added by this invocation', async () => {
  const { calls, deps } = harness({ moveCodes: [7] });
  let stateReads = 0;
  deps.getLiveState = async () => {
    stateReads += 1;
    if (stateReads === 1) return 'backlog';
    throw new Error('configured project status transport failed');
  };

  const result = await runAssign({ issueNumber: 39, login: 'alice', cfg, deps });

  assert.equal(result.status, 'move-outcome-indeterminate');
  assert.equal(result.exitCode, 7);
  assert.match(result.message, /transport failed/);
  assert.deepEqual(calls.mutations, [{ login: 'alice', remove: false }]);
});

test('compensation waits for a case-insensitive absent postcondition', async () => {
  const { calls, deps } = harness({ moveCodes: [11] });
  let verificationReads = 0;
  let compensationStarted = false;
  deps.mutateAssignee = async ({ login, remove }) => {
    calls.mutations.push({ login, remove });
    if (remove) compensationStarted = true;
  };
  deps.fetchAssignees = async () => {
    if (!compensationStarted) return verificationReads++ === 0 ? [] : ['Alice'];
    verificationReads += 1;
    return verificationReads >= 5 ? [] : ['ALICE'];
  };
  deps.getLiveState = async () => 'backlog';

  const result = await runAssign({ issueNumber: 40, login: 'alice', cfg, deps });

  assert.equal(result.status, 'move-failed-compensated');
  assert.ok(verificationReads >= 5, 'bounded postcondition reads observe delayed removal');
});

test('zero-exit compensation is nonzero when the assignee remains observable', async () => {
  const { calls, deps } = harness({ moveCodes: [11] });
  let added = false;
  deps.mutateAssignee = async ({ login, remove }) => {
    calls.mutations.push({ login, remove });
    if (!remove) added = true;
  };
  deps.fetchAssignees = async () => (added ? ['Alice'] : []);
  deps.getLiveState = async () => 'backlog';

  const result = await runAssign({ issueNumber: 41, login: 'alice', cfg, deps });

  assert.equal(result.status, 'move-failed-compensation-unverified');
  assert.equal(result.exitCode, 11);
  assert.match(result.compensationError, /still reports alice/i);
});

test('compensation is nonzero when its strict assignee re-read fails', async () => {
  const { calls, deps } = harness({ moveCodes: [11] });
  let reads = 0;
  deps.fetchAssignees = async () => {
    reads += 1;
    if (reads <= 3) return reads === 1 ? [] : ['alice'];
    throw new Error('compensation transport failed');
  };
  deps.getLiveState = async () => 'backlog';

  const result = await runAssign({ issueNumber: 42, login: 'alice', cfg, deps });

  assert.equal(result.status, 'move-failed-compensation-unverified');
  assert.equal(result.exitCode, 11);
  assert.match(result.compensationError, /transport failed/);
  assert.deepEqual(calls.mutations, [
    { login: 'alice', remove: false },
    { login: 'alice', remove: true },
  ]);
});

test('an applied-then-threw add is proven case-insensitively and completes Assigned', async () => {
  const calls = { mutations: [], moves: [] };
  let assignees = [];
  const result = await runAssign({
    issueNumber: 43,
    login: 'alice',
    cfg,
    deps: {
      resolveLogin: async () => 'Alice',
      getLiveState: async () => 'backlog',
      fetchAssignees: async () => [...assignees],
      mutateAssignee: async ({ login, remove }) => {
        calls.mutations.push({ login, remove });
        assignees = ['ALICE'];
        throw new Error('request timed out after apply');
      },
      runMoveState: async ({ target }) => {
        calls.moves.push(target);
        return 0;
      },
    },
  });

  assert.equal(result.status, 'assigned');
  assert.deepEqual(calls.mutations, [{ login: 'alice', remove: false }]);
  assert.deepEqual(calls.moves, ['assigned']);
});

test('a not-applied-then-threw add reports verified no-change without moving Status', async () => {
  const { calls, deps } = harness();
  deps.mutateAssignee = async ({ login, remove }) => {
    calls.mutations.push({ login, remove });
    throw new Error('request rejected before apply');
  };
  const result = await runAssign({ issueNumber: 44, login: 'alice', cfg, deps });

  assert.equal(result.status, 'assignment-mutation-failed-no-change');
  assert.equal(result.exitCode, 1);
  assert.match(result.message, /rejected before apply/);
  assert.deepEqual(calls.moves, []);
});

test('an unreadable postcondition after a thrown add is explicitly indeterminate', async () => {
  const { calls, deps } = harness();
  let reads = 0;
  deps.fetchAssignees = async () => {
    reads += 1;
    if (reads === 1) return [];
    throw new Error('post-add transport unavailable');
  };
  deps.mutateAssignee = async ({ login, remove }) => {
    calls.mutations.push({ login, remove });
    throw new Error('request timeout');
  };
  const result = await runAssign({ issueNumber: 45, login: 'alice', cfg, deps });

  assert.equal(result.status, 'assignment-outcome-indeterminate');
  assert.equal(result.exitCode, 1);
  assert.match(result.message, /post-add transport unavailable/);
  assert.equal(reads, 4);
  assert.deepEqual(calls.moves, []);
  assert.deepEqual(calls.mutations, [{ login: 'alice', remove: false }]);
});

test('ambiguous landed add is compensated when the subsequent Assigned move is refused', async () => {
  const calls = { mutations: [], moves: [] };
  let assignees = [];
  const result = await runAssign({
    issueNumber: 46,
    login: 'alice',
    cfg,
    deps: {
      resolveLogin: async () => 'alice',
      getLiveState: async () => 'backlog',
      fetchAssignees: async () => [...assignees],
      mutateAssignee: async ({ login, remove }) => {
        calls.mutations.push({ login, remove });
        if (remove) {
          assignees = [];
          return;
        }
        assignees = ['Alice'];
        throw new Error('timeout after apply');
      },
      runMoveState: async ({ target }) => {
        calls.moves.push(target);
        return 11;
      },
    },
  });

  assert.equal(result.status, 'move-failed-compensated');
  assert.deepEqual(calls.mutations, [
    { login: 'alice', remove: false },
    { login: 'alice', remove: true },
  ]);
});

test('concurrent replacement owner after final removal restores and verifies Assigned', async () => {
  const calls = { mutations: [], moves: [] };
  const states = ['assigned', 'backlog', 'assigned'];
  let read = 0;
  const result = await runAssign({
    issueNumber: 47,
    login: 'alice',
    remove: true,
    cfg,
    deps: {
      resolveLogin: async () => 'alice',
      getLiveState: async () => states.shift(),
      fetchAssignees: async () => (read++ === 0 ? ['alice'] : ['bob']),
      mutateAssignee: async (args) => calls.mutations.push(args),
      runMoveState: async ({ target }) => calls.moves.push(target) && 0,
    },
  });

  assert.equal(result.status, 'unassigned-owner-remains-restored');
  assert.equal(result.state, 'assigned');
  assert.deepEqual(result.assignees, ['bob']);
  assert.deepEqual(calls.moves, ['backlog', 'assigned']);
});

test('replacement-owner restoration failure is nonzero and reports the verified Backlog state', async () => {
  const calls = { mutations: [], moves: [] };
  const states = ['assigned', 'backlog', 'backlog'];
  let read = 0;
  const moveCodes = [0, 11];
  const result = await runAssign({
    issueNumber: 48,
    login: 'alice',
    remove: true,
    cfg,
    deps: {
      resolveLogin: async () => 'alice',
      getLiveState: async () => states.shift(),
      fetchAssignees: async () => (read++ === 0 ? ['alice'] : ['bob']),
      mutateAssignee: async (args) => calls.mutations.push(args),
      runMoveState: async ({ target }) => calls.moves.push(target) && moveCodes.shift(),
    },
  });

  assert.equal(result.status, 'owner-remains-restore-failed');
  assert.equal(result.exitCode, 11);
  assert.equal(result.state, 'backlog');
  assert.deepEqual(calls.moves, ['backlog', 'assigned']);
});

test('replacement-owner restoration with an unreadable postcondition is indeterminate', async () => {
  const calls = { mutations: [], moves: [] };
  let stateReads = 0;
  let assigneeReads = 0;
  const result = await runAssign({
    issueNumber: 49,
    login: 'alice',
    remove: true,
    cfg,
    deps: {
      resolveLogin: async () => 'alice',
      getLiveState: async () => {
        stateReads += 1;
        if (stateReads === 1) return 'assigned';
        if (stateReads === 2) return 'backlog';
        throw new Error('restoration state unreadable');
      },
      fetchAssignees: async () => (assigneeReads++ === 0 ? ['alice'] : ['bob']),
      mutateAssignee: async (args) => calls.mutations.push(args),
      runMoveState: async ({ target }) => calls.moves.push(target) && 0,
    },
  });

  assert.equal(result.status, 'owner-remains-restore-indeterminate');
  assert.equal(result.exitCode, 1);
  assert.match(result.message, /restoration state unreadable/);
  assert.deepEqual(calls.moves, ['backlog', 'assigned']);
});

test('replacement-owner restoration propagates post-Status move evidence failure', async () => {
  const calls = { moves: [] };
  const states = ['assigned', 'backlog', 'assigned'];
  let assigneeReads = 0;
  const moveCodes = [0, 7];
  const result = await runAssign({
    issueNumber: 50,
    login: 'alice',
    remove: true,
    cfg,
    deps: {
      resolveLogin: async () => 'alice',
      getLiveState: async () => states.shift(),
      fetchAssignees: async () => (assigneeReads++ === 0 ? ['alice'] : ['bob']),
      mutateAssignee: async () => {},
      runMoveState: async ({ target }) => calls.moves.push(target) && moveCodes.shift(),
    },
  });

  assert.equal(result.status, 'owner-remains-restored-move-incomplete');
  assert.equal(result.exitCode, 7);
  assert.equal(result.state, 'assigned');
  assert.deepEqual(calls.moves, ['backlog', 'assigned']);
});
