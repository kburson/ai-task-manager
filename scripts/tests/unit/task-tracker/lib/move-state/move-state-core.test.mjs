// @story #755
// @story #756
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveState } from '../../../../../task-tracker/lib/move-state/move-state-core.mjs';
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
    _emitPhasePairRows: async () => {
      calls.push('rows');
    },
    _stampEntryMarkers: async () => {
      calls.push('markers');
    },
    _runStatusWrite: async () => {
      calls.push('status');
      return { itemId: 'IT_1', exit: null };
    },
    _writeSentinel: async () => {
      calls.push('sentinel');
      return { verified: true };
    },
    _runPostCommitTail: async () => {
      calls.push('tail');
      return { failures: [] };
    },
    ...overrides,
  };
}

test('moveState runs guard → rows → markers → status → sentinel → tail', async () => {
  const ctx = baseCtx();
  const res = await moveState(ctx);
  assert.equal(res.exit, null);
  assert.equal(res.itemId, 'IT_1');
  assert.deepEqual(ctx.calls, ['guard', 'rows', 'markers', 'status', 'sentinel', 'tail']);
});

test('atomic core order: rows + markers land before Status, sentinel before tail', async () => {
  const ctx = baseCtx();
  await moveState(ctx);
  assert.ok(ctx.calls.indexOf('rows') < ctx.calls.indexOf('status'), 'rows before status');
  assert.ok(ctx.calls.indexOf('markers') < ctx.calls.indexOf('status'), 'markers before status');
  assert.ok(ctx.calls.indexOf('status') < ctx.calls.indexOf('sentinel'), 'status before sentinel');
  assert.ok(ctx.calls.indexOf('sentinel') < ctx.calls.indexOf('tail'), 'sentinel before tail');
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
