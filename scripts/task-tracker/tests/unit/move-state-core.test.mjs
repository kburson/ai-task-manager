// @story #755
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveState } from '../../lib/move-state/move-state-core.mjs';

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
