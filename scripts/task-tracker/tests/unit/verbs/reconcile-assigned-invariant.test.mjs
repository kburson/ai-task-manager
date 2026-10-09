// @story #1207
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  fetchAssignedInvariantSnapshot,
  runAssignedInvariantReconcile,
} from '../../../verbs/reconcile.mjs';

const cfg = { repo: 'o/r', projectId: 'P1' };

test('production snapshot derives state and assignees from one configured-project response', async () => {
  let reads = 0;
  const snapshot = await fetchAssignedInvariantSnapshot(
    { issueNumber: 49, cfg },
    {
      fetchConfiguredProjectIssueFn: async (args) => {
        reads += 1;
        assert.deepEqual(args, { repo: cfg.repo, projectId: cfg.projectId, issueNumber: 49 });
        return {
          assignees: ['Alice'],
          projectItem: {
            project: { id: cfg.projectId },
            fieldValueByName: { name: 'Assigned' },
          },
        };
      },
    }
  );

  assert.equal(reads, 1);
  assert.deepEqual(snapshot, { state: 'assigned', assignees: ['Alice'] });
});

test('production snapshot rejects a membership from the wrong configured project', async () => {
  await assert.rejects(
    () =>
      fetchAssignedInvariantSnapshot(
        { issueNumber: 49, cfg },
        {
          fetchConfiguredProjectIssueFn: async () => ({
            assignees: ['alice'],
            projectItem: {
              project: { id: 'OTHER_PROJECT' },
              fieldValueByName: { name: 'Assigned' },
            },
          }),
        }
      ),
    /configured project item/i
  );
});

function harness({ state, assignees, postState, postAssignees, moveCode = 0 } = {}) {
  const moves = [];
  let stateReads = 0;
  let assigneeReads = 0;
  let snapshotReads = 0;
  let liveState = state;
  const splitReads = { state: 0, assignees: 0 };
  return {
    moves,
    splitReads,
    deps: {
      getLiveState: async () => {
        splitReads.state += 1;
        return ++stateReads === 1 ? state : (postState ?? liveState);
      },
      fetchAssignees: async () => {
        splitReads.assignees += 1;
        return ++assigneeReads === 1 ? assignees : (postAssignees ?? assignees);
      },
      fetchInvariantSnapshot: async () => {
        snapshotReads += 1;
        return snapshotReads === 1
          ? { state, assignees }
          : { state: postState ?? liveState, assignees: postAssignees ?? assignees };
      },
      runMoveState: async (args) => {
        moves.push(args);
        if (moveCode === 0) liveState = args.target;
        return moveCode;
      },
    },
  };
}

test('classification uses one atomic state-and-assignees snapshot instead of split reads', async () => {
  const { deps, moves, splitReads } = harness({ state: 'assigned', assignees: ['alice'] });
  // If the old split seams are consulted, manufacture a non-coexistent
  // Assigned+empty pair that would be misreported as drift.
  deps.getLiveState = async () => {
    splitReads.state += 1;
    return 'assigned';
  };
  deps.fetchAssignees = async () => {
    splitReads.assignees += 1;
    return [];
  };

  const result = await runAssignedInvariantReconcile({ issueNumber: 50, cfg, deps });

  assert.equal(result.status, 'compliant');
  assert.equal(result.kind, 'none');
  assert.deepEqual(splitReads, { state: 0, assignees: 0 });
  assert.deepEqual(moves, []);
});

test('dry-run reports Assigned without assignees and performs no writes', async () => {
  const { deps, moves } = harness({ state: 'assigned', assignees: [] });
  const result = await runAssignedInvariantReconcile({ issueNumber: 51, cfg, deps });
  assert.equal(result.status, 'drift-detected');
  assert.equal(result.kind, 'assigned-without-assignee');
  assert.equal(result.targetState, 'backlog');
  assert.deepEqual(moves, []);
});

test('apply repairs Assigned without assignees by demoting to Backlog', async () => {
  const { deps, moves } = harness({ state: 'assigned', assignees: [] });
  const result = await runAssignedInvariantReconcile({
    issueNumber: 52,
    apply: true,
    cfg,
    deps,
  });
  assert.equal(result.status, 'repaired');
  assert.equal(moves[0].target, 'backlog');
  assert.match(moves[0].reason, /Assigned has no live assignee/i);
});

test('apply repairs Backlog with assignees by moving to Assigned', async () => {
  const { deps, moves } = harness({ state: 'backlog', assignees: ['alice'] });
  const result = await runAssignedInvariantReconcile({
    issueNumber: 53,
    apply: true,
    cfg,
    deps,
  });
  assert.equal(result.kind, 'backlog-with-assignee');
  assert.equal(result.status, 'repaired');
  assert.equal(moves[0].target, 'assigned');
});

test('later states are invariant-neutral even when unassigned', async () => {
  for (const state of ['refine', 'plan', 'develop', 'test', 'review', 'done']) {
    const { deps, moves } = harness({ state, assignees: [] });
    const result = await runAssignedInvariantReconcile({
      issueNumber: 54,
      apply: true,
      cfg,
      deps,
    });
    assert.equal(result.status, 'compliant', state);
    assert.equal(result.kind, 'out-of-scope', state);
    assert.deepEqual(moves, [], state);
  }
});

test('failed apply reports the central mover exit code', async () => {
  const { deps } = harness({ state: 'backlog', assignees: ['alice'], moveCode: 11 });
  const result = await runAssignedInvariantReconcile({
    issueNumber: 55,
    apply: true,
    cfg,
    deps,
  });
  assert.equal(result.status, 'repair-failed');
  assert.equal(result.exitCode, 11);
});

test('assignee transport failure is an error and never writes', async () => {
  const { deps, moves } = harness({ state: 'assigned', assignees: [] });
  deps.fetchInvariantSnapshot = async () => {
    throw new Error('offline');
  };
  const result = await runAssignedInvariantReconcile({ issueNumber: 56, cfg, deps });
  assert.equal(result.status, 'error');
  assert.match(result.message, /offline/);
  assert.deepEqual(moves, []);
});

test('missing and unknown live states fail closed instead of reporting compliant', async () => {
  for (const state of [null, '', 'mystery']) {
    const { deps, moves } = harness({ state, assignees: [] });
    const result = await runAssignedInvariantReconcile({ issueNumber: 57, cfg, deps });
    assert.equal(result.status, 'error');
    assert.match(result.message, /live project state/i);
    assert.deepEqual(moves, []);
  }
});

test('apply reports postcondition failure when mover exits zero but drift remains', async () => {
  const { deps } = harness({
    state: 'assigned',
    assignees: [],
    postState: 'assigned',
    postAssignees: [],
  });
  const result = await runAssignedInvariantReconcile({ issueNumber: 58, apply: true, cfg, deps });
  assert.equal(result.status, 'repair-failed');
  assert.equal(result.exitCode, 1);
  assert.match(result.message, /postcondition/i);
});

test('apply reports postcondition failure on a concurrent assignee change', async () => {
  const { deps } = harness({
    state: 'backlog',
    assignees: ['alice'],
    postState: 'assigned',
    postAssignees: [],
  });
  const result = await runAssignedInvariantReconcile({ issueNumber: 59, apply: true, cfg, deps });
  assert.equal(result.status, 'repair-failed');
  assert.match(result.message, /postcondition/i);
});

test('postcondition classifies only one atomic snapshot during repair concurrency', async () => {
  const { deps, splitReads } = harness({
    state: 'backlog',
    assignees: ['alice'],
    postState: 'assigned',
    postAssignees: ['alice'],
  });
  // These stale split values falsely describe ownerless Assigned. The atomic
  // post snapshot is compliant and must be the only observation consumed.
  deps.getLiveState = async () => {
    splitReads.state += 1;
    return 'assigned';
  };
  deps.fetchAssignees = async () => {
    splitReads.assignees += 1;
    return [];
  };

  const result = await runAssignedInvariantReconcile({ issueNumber: 60, apply: true, cfg, deps });

  assert.equal(result.status, 'repaired');
  assert.deepEqual(splitReads, { state: 0, assignees: 0 });
});

for (const scenario of [
  {
    label: 'snapshot transport failure',
    error: new Error('atomic snapshot transport unavailable'),
    pattern: /snapshot transport unavailable/,
  },
  {
    label: 'malformed snapshot',
    value: { state: 'assigned', assignees: null },
    pattern: /assignee payload|assignees/i,
  },
  {
    label: 'wrong configured project',
    value: { state: null, assignees: ['alice'] },
    pattern: /live project state/i,
  },
]) {
  test(`${scenario.label} fails closed without falling back to split reads`, async () => {
    const { deps, moves, splitReads } = harness({ state: 'assigned', assignees: ['alice'] });
    deps.fetchInvariantSnapshot = async () => {
      if (scenario.error) throw scenario.error;
      return scenario.value;
    };

    const result = await runAssignedInvariantReconcile({ issueNumber: 61, cfg, deps });

    assert.equal(result.status, 'error');
    assert.match(result.message, scenario.pattern);
    assert.deepEqual(splitReads, { state: 0, assignees: 0 });
    assert.deepEqual(moves, []);
  });
}
