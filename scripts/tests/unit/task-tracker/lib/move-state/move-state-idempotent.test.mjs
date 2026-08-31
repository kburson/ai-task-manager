// @story #756
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveState } from '../../../../../task-tracker/lib/move-state/move-state-core.mjs';

function trackedCtx(probe) {
  const calls = [];
  return {
    calls,
    ctx: {
      issueArg: '999',
      stateArg: 'test',
      _runGuardExecution: async () => ({ exit: null }),
      _probeCompletion: async () => {
        calls.push('probeCompletion');
        return probe;
      },
      _emitPhasePairRows: async () => calls.push('rows'),
      _stampEntryMarkers: async () => calls.push('markers'),
      _runStatusWrite: async () => {
        calls.push('status');
        return { itemId: 'IT', exit: null };
      },
      _writeSentinel: async () => {
        calls.push('sentinel');
        return { verified: true };
      },
      _runPostCommitTail: async (ctx) => {
        calls.push('runPostCommitTail');
        if (ctx.transitionCommitRepairRequested) await ctx.repairTransitionCommit?.(ctx);
        return { failures: [] };
      },
      _createTransitionId: () => 'move:fresh',
      _writeTransitionCommit: async () => ({ verified: true }),
      _repairTransitionCommit: async () => calls.push('repairTransitionCommit'),
    },
  };
}

test('re-run of a complete move is a no-op (no rows/markers/status/sentinel rewrite)', async () => {
  const { ctx, calls } = trackedCtx({
    sentinelState: 'test',
    statusState: 'test',
    entryMarkerPresent: true,
    exitRowPresent: true,
    entryRowPresent: true,
    transitionId: 'move:existing',
  });
  const res = await moveState(ctx);
  assert.equal(res.alreadyComplete, true);
  assert.equal(res.exit, null);
  assert.ok(
    !calls.includes('rows') &&
      !calls.includes('markers') &&
      !calls.includes('status') &&
      !calls.includes('sentinel'),
    'complete move must not rewrite core elements'
  );
  assert.deepEqual(calls.slice(0, 3), [
    'probeCompletion',
    'runPostCommitTail',
    'repairTransitionCommit',
  ]);
  assert.equal(ctx.transitionId, 'move:existing');
});

test('partial move (sentinel absent) rolls forward through the saga', async () => {
  const { ctx, calls } = trackedCtx({
    sentinelState: '',
    statusState: 'test',
    entryMarkerPresent: true,
    exitRowPresent: true,
    entryRowPresent: true,
  });
  const res = await moveState(ctx);
  assert.equal(res.alreadyComplete, undefined);
  assert.ok(calls.includes('sentinel'), 'partial move converges to the sentinel write');
  assert.equal(ctx.transitionId, 'move:fresh');
});
