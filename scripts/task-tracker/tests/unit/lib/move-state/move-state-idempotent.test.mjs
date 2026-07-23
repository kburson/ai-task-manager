// @story #756
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveState } from '../../../../lib/move-state/move-state-core.mjs';

function trackedCtx(probe) {
  const calls = [];
  return {
    calls,
    ctx: {
      issueArg: '999',
      stateArg: 'test',
      _runGuardExecution: async () => ({ exit: null }),
      _probeCompletion: async () => probe,
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
      _runPostCommitTail: async () => {
        calls.push('tail');
        return { failures: [] };
      },
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
});
