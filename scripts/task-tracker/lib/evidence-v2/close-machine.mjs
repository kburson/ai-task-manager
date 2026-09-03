// @story #1499
import { frozen, fail } from './value.mjs';

export const CLOSE_EFFECTS = Object.freeze([
  'timing',
  'estimation',
  'lifecycle',
  'board',
  'disposition',
  'issue',
  'labels',
  'cleanup',
]);

export function planCloseEffects({ cycle, live = {}, authority = {} } = {}) {
  const started = cycle?.close?.started;
  if (!started)
    return frozen({
      status: 'start-required',
      nextEffect: null,
      expected: null,
      operationKey: null,
    });
  if (cycle.status === 'completed' && cycle.close.cleanup) {
    return frozen({ status: 'complete', nextEffect: null, expected: null, operationKey: null });
  }
  const confirmed = new Map(
    (cycle.close.steps || []).map((record) => [record.payload.step, record])
  );
  const beforeRemote = confirmed.size === 0 && !cycle.close.completion;
  if (beforeRemote && ['foreign', 'conflict'].includes(authority.binding)) {
    return frozen({
      status: 'refused',
      reason: 'binding-contention',
      nextEffect: null,
      expected: null,
      operationKey: null,
    });
  }
  if (cycle.close.completion && ['conflict', 'foreign'].includes(authority.binding)) {
    return frozen({
      status: 'closed-cleanup-pending',
      reason: 'binding-contention',
      nextEffect: null,
      expected: { cleanup: 'pending-conflict' },
      operationKey: null,
    });
  }
  const effectsToPlan = cycle.close.completion ? ['cleanup'] : CLOSE_EFFECTS.slice(0, -1);
  for (const effect of effectsToPlan) {
    if (confirmed.has(effect)) continue;
    const operationKey = started.payload.effectOperationKeys?.[effect];
    if (!operationKey) fail('close-machine:operation-key');
    const observed = live.effects?.[effect];
    if (observed?.status === 'confirmed') {
      if (observed.operationKey !== operationKey) fail('close-machine:operation-conflict');
      return frozen({
        status: 'checkpoint-required',
        nextEffect: effect,
        expected: observed,
        operationKey,
      });
    }
    return frozen({
      status: 'effect-required',
      nextEffect: effect,
      expected: { status: 'confirmed', operationKey },
      operationKey,
    });
  }
  return frozen({
    status: cycle.close.completion ? 'complete' : 'completion-required',
    nextEffect: null,
    expected: null,
    operationKey: null,
  });
}
