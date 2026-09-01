// @story #755
// @story #756
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveState } from '../../../../../task-tracker/lib/move-state/move-state-core.mjs';
import { runGuardExecution } from '../../../../../task-tracker/lib/move-state/guard-execution.mjs';
import { runPostCommitTail } from '../../../../../task-tracker/lib/move-state/post-commit-tail.mjs';

function baseCtx(overrides = {}) {
  const calls = [];
  return {
    issueArg: '999',
    stateArg: 'test',
    calls,
    // seams injected so the core runs with zero network:
    _runGuardExecution: async () => {
      calls.push('guard');
      return { exit: null };
    },
    _probeCompletion: async () => ({
      sentinelState: '',
      statusState: '',
      entryMarkerPresent: false,
      exitRowPresent: false,
      entryRowPresent: false,
    }),
    _emitPhasePairRows: async (ctx) => {
      calls.push(`rows:${ctx.transitionId}`);
    },
    _stampEntryMarkers: async (ctx) => {
      calls.push(`markers:${ctx.transitionId}`);
      return { visitMarker: `entry:${ctx.transitionId}` };
    },
    _runStatusWrite: async (ctx) => {
      calls.push(`status:${ctx.transitionId}`);
      return { itemId: 'IT_1', exit: null };
    },
    _writeSentinel: async (ctx) => {
      calls.push(`sentinel:${ctx.transitionId}`);
      return { verified: true, sentinelMarker: `sentinel:${ctx.transitionId}` };
    },
    _createTransitionId: () => 'move:test-transition',
    _writeTransitionCommit: async (ctx, evidence) => {
      calls.push(`commit:${ctx.transitionId}`);
      assert.deepEqual(evidence, {
        visitMarker: `entry:${ctx.transitionId}`,
        sentinelMarker: `sentinel:${ctx.transitionId}`,
      });
      return { verified: true, commentId: '42' };
    },
    _runPostCommitTail: async () => {
      calls.push('tail');
      return { failures: [] };
    },
    ...overrides,
  };
}

test('moveState runs guard → rows → markers → status → sentinel → commit → tail', async () => {
  const ctx = baseCtx();
  const res = await moveState(ctx);
  assert.equal(res.exit, null);
  assert.equal(res.itemId, 'IT_1');
  assert.deepEqual(ctx.calls, [
    'guard',
    'rows:move:test-transition',
    'markers:move:test-transition',
    'status:move:test-transition',
    'sentinel:move:test-transition',
    'commit:move:test-transition',
    'tail',
  ]);
  assert.equal(ctx.transitionId, 'move:test-transition');
});

test('atomic core order: rows + markers land before Status, sentinel before tail', async () => {
  const ctx = baseCtx();
  await moveState(ctx);
  assert.ok(
    ctx.calls.indexOf('rows:move:test-transition') <
      ctx.calls.indexOf('status:move:test-transition'),
    'rows before status'
  );
  assert.ok(
    ctx.calls.indexOf('markers:move:test-transition') <
      ctx.calls.indexOf('status:move:test-transition'),
    'markers before status'
  );
  assert.ok(
    ctx.calls.indexOf('status:move:test-transition') <
      ctx.calls.indexOf('sentinel:move:test-transition'),
    'status before sentinel'
  );
  assert.ok(
    ctx.calls.indexOf('sentinel:move:test-transition') <
      ctx.calls.indexOf('commit:move:test-transition'),
    'sentinel before commit provenance'
  );
  assert.ok(
    ctx.calls.indexOf('sentinel:move:test-transition') < ctx.calls.indexOf('tail'),
    'sentinel before tail'
  );
});

test('transition commit failure warns without failing a confirmed move', async () => {
  const ctx = baseCtx({
    _writeTransitionCommit: async () => {
      throw new Error('github unavailable');
    },
  });
  const result = await moveState(ctx);
  assert.equal(result.exit, null);
  assert.equal(result.boardMoved, true);
  assert.equal(result.sentinelPresent, true);
  assert.deepEqual(
    result.warnings.map(({ code }) => code),
    ['commit-provenance-missing']
  );
});

test('moveState fails closed when the sentinel does not verify', async () => {
  const ctx = baseCtx({
    _writeSentinel: async () => ({ verified: false, exit: 7 }),
  });
  const res = await moveState(ctx);
  assert.equal(res.exit, 7);
  assert.ok(!ctx.calls.includes('tail'), 'unverified sentinel must not run the tail');
});

test('moveState halts on guard refusal and never writes status', async () => {
  const ctx = baseCtx({ _runGuardExecution: async () => ({ exit: 6 }) });
  const res = await moveState(ctx);
  assert.equal(res.exit, 6);
  assert.ok(!ctx.calls.includes('status'));
});

test('moveState prefers the public pre-evaluated guard over the legacy test seam', async () => {
  const ctx = baseCtx({
    runGuardExecution: async () => {
      ctx.calls.push('public-guard');
      return { exit: null };
    },
    _runGuardExecution: async () => {
      throw new Error('legacy guard seam must not run');
    },
  });

  const result = await moveState(ctx);

  assert.equal(result.exit, null);
  assert.equal(ctx.calls[0], 'public-guard');
});

test('pre-mutation guard consumes the locked snapshot body without a second issue fetch', async () => {
  let fetches = 0;
  const result = await runGuardExecution({
    issueArg: '1462',
    stateArg: 'test',
    resolvedFromState: 'develop',
    verbContext: 'test',
    shelveBackwardGuardAuthorized: false,
    demoteFlag: false,
    plan: { runGuardPipeline: true },
    forceFlag: false,
    supersedeFlag: false,
    SKIP_NETWORK: false,
    cfg: { repo: 'kburson/ai-task-manager' },
    boundarySnapshot: { body: { value: '' } },
    gh: async () => {
      fetches += 1;
      throw new Error('locked snapshot should be authoritative');
    },
    pexec: async () => ({ stdout: '' }),
    resolveLiveStateName: async () => '',
    checkDirty: async () => ({ dirty: false }),
    formatSummary: () => '',
    resolveWorkspaceForIssue: () => process.cwd(),
    backlogMoveWarning: async () => undefined,
    lifecycleEvidence: null,
  });

  assert.equal(fetches, 0);
  assert.equal(result.exit, 6);
});

test('moveState halts on status exit and never runs tail', async () => {
  const ctx = baseCtx({ _runStatusWrite: async () => ({ itemId: 'IT_1', exit: 7 }) });
  const res = await moveState(ctx);
  assert.equal(res.exit, 7);
  assert.ok(!ctx.calls.includes('tail'));
});

// AC5 (#756): the tail runs AFTER the sentinel and is strictly best-effort. A
// throwing tail step must be logged and recorded, but must NEVER turn the
// already-committed move into a failure or revert it (#714 preserved). Drive
// the REAL post-commit tail sequencer with a throwing step double — not the
// happy `_runPostCommitTail` fake — so the swallow-log-continue contract is
// exercised end-to-end through moveState, not merely asserted at the boundary.
test('AC5: a throwing tail step is logged and never fails-reports or reverts the move', async () => {
  const throwingSteps = [
    {
      name: 'boom',
      fn: async () => {
        throw new Error('tail exploded');
      },
    },
  ];
  const origErr = process.stderr.write;
  const err = [];
  process.stderr.write = (s) => (err.push(String(s)), true);
  let res;
  try {
    const ctx = baseCtx({
      // Real sequencer + throwing step: proves the throw is caught inside the
      // tail, so moveState still sees a clean return and reports success.
      _runPostCommitTail: (c) => runPostCommitTail(c, throwingSteps),
    });
    res = await moveState(ctx);
  } finally {
    process.stderr.write = origErr;
  }
  assert.equal(res.exit, null, 'a tail throw never turns the committed move into a failure');
  assert.equal(res.itemId, 'IT_1', 'the committed item id is still reported after a tail throw');
  assert.deepEqual(
    res.tail.failures.map((f) => f.name),
    ['boom'],
    'the throwing step is recorded in the tail failures, not swallowed silently'
  );
  assert.ok(
    err.some((l) => l.includes('boom')),
    'the throw is logged to stderr naming the failing step'
  );
});
