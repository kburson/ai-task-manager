// @story #925
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { moveState } from '../../../lib/move-state/move-state-core.mjs';
import { runPostCommitTail } from '../../../lib/move-state/post-commit-tail.mjs';
import * as pullNext from '../../../verbs/pull-next.mjs';

test('the default convergence adapter owns the background profile and preserves the active task', async () => {
  const ctx = { preserveActiveOnConvergence: false };
  let buildArgs;

  const result = await pullNext.defaultConvergeClosedIssue(
    { issueNumber: 101 },
    {
      buildContextFn: (args) => {
        buildArgs = args;
        return ctx;
      },
      closeFn: async (received) => {
        assert.equal(received.convergenceTailProfile, 'background-convergence');
        assert.equal(received.preserveActiveOnConvergence, true);
        return { action: 'finalize', status: 'completed' };
      },
    }
  );

  assert.deepEqual(buildArgs, ['close', '#101']);
  assert.deepEqual(result, { action: 'finalize', status: 'completed' });
});

test('a background Done move runs issue/project tail steps without touching the parent session', async () => {
  const calls = [];
  const parentSession = {
    active: '#100',
    kanbanState: 'develop',
    timerStartedAt: '2026-07-29T20:00:00.000Z',
  };
  const before = structuredClone(parentSession);
  const steps = [
    { name: 'issueEffect', scope: 'issue', fn: async () => calls.push('issueEffect') },
    { name: 'projectEffect', scope: 'project', fn: async () => calls.push('projectEffect') },
    {
      name: 'syncTrackerState',
      scope: 'session',
      fn: () => {
        calls.push('syncTrackerState');
        parentSession.kanbanState = 'done';
      },
    },
    {
      name: 'endTaskTracking',
      scope: 'session',
      fn: () => {
        calls.push('endTaskTracking');
        parentSession.active = null;
        parentSession.timerStartedAt = null;
      },
    },
  ];

  const result = await moveState({
    issueArg: '101',
    stateArg: 'done',
    tailProfile: 'background-convergence',
    _runGuardExecution: async () => ({ exit: null }),
    _probeCompletion: async () => ({
      sentinelState: '',
      statusState: '',
      entryMarkerPresent: false,
      exitRowPresent: false,
      entryRowPresent: false,
    }),
    _emitPhasePairRows: async () => {},
    _stampEntryMarkers: async () => {},
    _runStatusWrite: async () => ({ itemId: 'ITEM_101', exit: null }),
    _writeSentinel: async () => ({ verified: true }),
    _runPostCommitTail: (ctx) => runPostCommitTail(ctx, steps),
  });

  assert.equal(result.exit, null);
  assert.deepEqual(calls, ['issueEffect', 'projectEffect']);
  assert.deepEqual(parentSession, before);
});
