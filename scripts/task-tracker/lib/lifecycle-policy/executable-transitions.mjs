import { stateIds, stateIndex } from './states.mjs';

const EMPTY_TARGETS = Object.freeze([]);
const REVERSE_TARGET_INDEXES = Object.freeze({
  1: Object.freeze([0]),
  2: Object.freeze([0]),
  3: Object.freeze([0, 2]),
  5: Object.freeze([4]),
  6: Object.freeze([4, 5]),
});

const REVERSE_TARGETS = new Map(
  Object.entries(REVERSE_TARGET_INDEXES).map(([fromIndex, targetIndexes]) => [
    Number(fromIndex),
    Object.freeze(targetIndexes.map((targetIndex) => stateIds()[targetIndex])),
  ])
);

export function forwardTarget(state) {
  const index = stateIndex(state);
  if (index < 0) return undefined;
  return stateIds()[index + 1];
}

export function backwardTargets(state) {
  const index = stateIndex(state);
  if (index < 0) return EMPTY_TARGETS;
  return REVERSE_TARGETS.get(index) ?? EMPTY_TARGETS;
}

function unknownStateResult(unknownState, position) {
  return Object.freeze({
    ok: false,
    kind: 'unknown-state',
    unknownState,
    position,
    reason: `unknown state: ${unknownState}`,
  });
}

export function validateExecutableTransition(from, to) {
  if (stateIndex(from) < 0) return unknownStateResult(from, 'from');
  if (stateIndex(to) < 0) return unknownStateResult(to, 'to');

  if (from === to) {
    return Object.freeze({ ok: true, kind: 'noop', noop: true });
  }

  if (forwardTarget(from) === to || backwardTargets(from).includes(to)) {
    return Object.freeze({ ok: true, kind: 'allowed' });
  }

  const allowedTargets = Object.freeze(
    [forwardTarget(from), ...backwardTargets(from)].filter(Boolean)
  );
  const allowed = allowedTargets.join(', ') || 'none';
  return Object.freeze({
    ok: false,
    kind: 'refused',
    allowedTargets,
    reason: `illegal transition: ${from} → ${to}. Allowed: ${allowed}.`,
  });
}

// Compatibility-shaped result for operational callers that only need
// `{ ok, noop?, reason? }`. The decision still comes from the structured
// canonical validator above.
export function validateTransition(from, to) {
  const result = validateExecutableTransition(from, to);
  if (result.kind === 'noop') return { ok: true, noop: true };
  if (result.ok) return { ok: true };
  return { ok: false, reason: result.reason };
}
