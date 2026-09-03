// @story #1496
import { rehearsalRefusal } from '../../../task-tracker/lib/evidence-v2/execution-context.mjs';

export const FAULT_POINTS = Object.freeze(['before-effect', 'after-effect', 'after-response']);

export function tripFault(state, save, { operationId, fault, point }) {
  if (fault !== null && !FAULT_POINTS.includes(fault)) throw rehearsalRefusal('unknown-fault');
  const key = `${operationId}:${point}`;
  if (fault === point && !state.faults.includes(key)) {
    state.faults.push(key);
    save(state);
    throw rehearsalRefusal(`fault:${point}`);
  }
}

export async function withFailure({ point, attempt }, fn) {
  if (!FAULT_POINTS.includes(point) || !Number.isInteger(attempt) || attempt < 1)
    throw rehearsalRefusal('fault-input');
  if (attempt === 1 && point === 'before-effect') throw rehearsalRefusal(`fault:${point}`);
  const result = await fn();
  if (attempt === 1) throw rehearsalRefusal(`fault:${point}`);
  return result;
}
