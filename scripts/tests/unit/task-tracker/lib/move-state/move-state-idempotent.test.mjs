// @story #756
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultProbeCompletion,
  moveState,
} from '../../../../../task-tracker/lib/move-state/move-state-core.mjs';
import { serializeEntryMarker } from '../../../../../task-tracker/lib/stage-entry-grammar.mjs';

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
      _assertBoardMarkerConsistent: async () => ({ consistent: true }),
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

test('same-target replay repairs a post-Status partial move with the existing transition ID', async () => {
  const { ctx, calls } = trackedCtx({
    sentinelState: '',
    statusState: 'develop',
    entryMarkerPresent: true,
    exitRowPresent: true,
    entryRowPresent: true,
    transitionId: 'move:existing-develop',
    recoverablePartial: true,
    visitMarker: 'entry:move:existing-develop',
  });
  ctx.stateArg = 'develop';
  ctx.resolvedFromState = 'develop';
  ctx.repairOnly = true;

  const result = await moveState(ctx);

  assert.equal(result.exit, null);
  assert.equal(result.noop, undefined);
  assert.equal(ctx.transitionId, 'move:existing-develop');
  assert.ok(calls.includes('sentinel'));
  assert.ok(!calls.includes('rows'));
  assert.ok(!calls.includes('markers'));
  assert.ok(!calls.includes('status'));
});

test('same-target replay without a recoverable partial move remains a strict no-op', async () => {
  const { ctx, calls } = trackedCtx({
    sentinelState: '',
    statusState: 'develop',
    entryMarkerPresent: false,
    exitRowPresent: false,
    entryRowPresent: false,
    transitionId: null,
    recoverablePartial: false,
  });
  ctx.stateArg = 'develop';
  ctx.resolvedFromState = 'develop';
  ctx.repairOnly = true;

  const result = await moveState(ctx);

  assert.equal(result.exit, null);
  assert.equal(result.noop, true);
  assert.deepEqual(calls, ['probeCompletion']);
});

test('production completion probe recovers only the latest fully-evidenced entry identity', async () => {
  const transitionId = 'move:11111111-1111-4111-8111-111111111111';
  const body = [
    serializeEntryMarker({
      state: 'develop',
      visit: 1,
      ts: '2026-09-19T15:22:16.000Z',
      move: transitionId,
    }),
    '| 2026-09-19 10:22:16 -05:00 | plan:completed |',
    '| 2026-09-19 10:22:16 -05:00 | develop:started |',
  ].join('\n');

  const result = await defaultProbeCompletion({
    issueArg: '1720',
    stateArg: 'develop',
    cfg: { repo: 'kburson/ai-task-manager' },
    SKIP_NETWORK: false,
    _fetchBody: async () => body,
    resolveLiveStateName: async () => 'develop',
  });

  assert.equal(result.recoverablePartial, true);
  assert.equal(result.transitionId, transitionId);

  const superseded = await defaultProbeCompletion({
    issueArg: '1720',
    stateArg: 'develop',
    cfg: { repo: 'kburson/ai-task-manager' },
    SKIP_NETWORK: false,
    _fetchBody: async () =>
      `${body}\n${serializeEntryMarker({
        state: 'test',
        visit: 1,
        ts: '2026-09-19T15:23:00.000Z',
        move: 'move:22222222-2222-4222-8222-222222222222',
      })}`,
    resolveLiveStateName: async () => 'develop',
  });
  assert.equal(superseded.recoverablePartial, false);
  assert.equal(superseded.transitionId, null);
});
