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
    _runStatusWrite: async () => {
      calls.push('status');
      return { itemId: 'IT_1', exit: null };
    },
    _runPostCommitTail: async () => {
      calls.push('tail');
      return { failures: [] };
    },
    ...overrides,
  };
}

test('moveState runs guard → status → tail and returns success', async () => {
  const ctx = baseCtx();
  const res = await moveState(ctx);
  assert.equal(res.exit, null);
  assert.equal(res.itemId, 'IT_1');
  assert.deepEqual(ctx.calls, ['guard', 'status', 'tail']);
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
