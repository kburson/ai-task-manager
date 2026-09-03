// @story #1499
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import {
  CLOSE_EFFECTS,
  planCloseEffects,
} from '../../../../../task-tracker/lib/evidence-v2/close-machine.mjs';

function cycle(overrides = {}) {
  const cycleId = randomUUID();
  const closeTransactionId = randomUUID();
  return {
    cycleId,
    status: 'open',
    close: {
      started: {
        recordId: 'a'.repeat(64),
        payload: {
          closeTransactionId,
          effectOperationKeys: Object.fromEntries(
            CLOSE_EFFECTS.map((name) => [name, `${cycleId}:${closeTransactionId}:${name}`])
          ),
        },
      },
      steps: [],
      completion: null,
      cleanup: null,
    },
    ...overrides,
  };
}

test('plans exactly one ordered effect with a stable cycle-scoped key', () => {
  const current = cycle();
  const first = planCloseEffects({
    cycle: current,
    live: { effects: {} },
    authority: { binding: 'owned' },
  });
  assert.equal(first.status, 'effect-required');
  assert.equal(first.nextEffect, 'timing');
  assert.equal(first.operationKey, current.close.started.payload.effectOperationKeys.timing);

  current.close.steps.push({
    payload: { step: 'timing', operationKey: first.operationKey, outcome: 'confirmed' },
  });
  const second = planCloseEffects({
    cycle: current,
    live: { effects: {} },
    authority: { binding: 'owned' },
  });
  assert.equal(second.nextEffect, 'estimation');
});

test('reconciles an observed effect before replay and separates cleanup from completion', () => {
  const current = cycle();
  const timingKey = current.close.started.payload.effectOperationKeys.timing;
  const reconcile = planCloseEffects({
    cycle: current,
    live: { effects: { timing: { status: 'confirmed', operationKey: timingKey } } },
    authority: { binding: 'owned' },
  });
  assert.equal(reconcile.status, 'checkpoint-required');
  assert.equal(reconcile.nextEffect, 'timing');

  current.close.steps = CLOSE_EFFECTS.slice(0, -1).map((step) => ({
    payload: {
      step,
      operationKey: current.close.started.payload.effectOperationKeys[step],
      outcome: 'confirmed',
    },
  }));
  current.close.completion = { recordId: 'b'.repeat(64) };
  const pending = planCloseEffects({
    cycle: current,
    live: { effects: {} },
    authority: { binding: 'conflict' },
  });
  assert.equal(pending.status, 'closed-cleanup-pending');
  assert.equal(pending.nextEffect, null);
});

test('foreign ownership before close refuses every remote effect', () => {
  const current = cycle();
  const result = planCloseEffects({
    cycle: current,
    live: { effects: {} },
    authority: { binding: 'foreign' },
  });
  assert.equal(result.status, 'refused');
  assert.equal(result.reason, 'binding-contention');
  assert.equal(result.nextEffect, null);
});
