import { AprError } from '../errors.mjs';

export const PHASE_KINDS = Object.freeze(['spec', 'plan']);
const PHASE_KIND_SET = new Set(PHASE_KINDS);

function invalid(value, initialKind) {
  throw new AprError('APR_PHASE_INVALID', 'The phased review declaration is invalid.', {
    recovery:
      'Use a canonical comma-separated list of unique spec and plan kinds whose first kind matches --artifact-kind.',
    details: { value, initial_kind: initialKind },
  });
}

export function parsePhaseKinds(value, initialKind) {
  if (typeof value !== 'string' || !PHASE_KIND_SET.has(initialKind)) {
    invalid(value, initialKind);
  }
  const kinds = value.split(',');
  if (
    kinds.length === 0 ||
    kinds.some((kind) => !PHASE_KIND_SET.has(kind)) ||
    new Set(kinds).size !== kinds.length ||
    kinds[0] !== initialKind
  ) {
    invalid(value, initialKind);
  }
  return Object.freeze(kinds);
}

export function isPhased(protocol) {
  return Boolean(protocol?.phases);
}

export function currentPhase(protocol) {
  if (!isPhased(protocol)) return null;
  return Object.freeze({
    cursor: protocol.phases.cursor,
    kind: protocol.phases.current_kind,
  });
}

export function isFinalPhase(protocol) {
  if (!isPhased(protocol)) return true;
  return protocol.phases.cursor === protocol.phases.kinds.length - 1;
}
