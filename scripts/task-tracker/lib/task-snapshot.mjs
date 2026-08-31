// @story #1117 #1452

import { normalizeStateId } from './lifecycle-policy/index.mjs';
import { isMoveComplete } from './move-state/sentinel.mjs';

const RETRY_MOVEMENT = 'retry the same /task movement command';
const ACCEPT_LIVE = '/task reconcile accept-live #N';

function cloneFrozen(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof Date) return Object.freeze(new Date(value.getTime()));

  const copy = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
  seen.set(value, copy);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable) continue;
    copy[key] = cloneFrozen(value[key], seen);
  }
  return Object.freeze(copy);
}

function normalizedState(value) {
  return normalizeStateId(value) || '';
}

export function provenance(value, source, details = {}) {
  if (typeof source !== 'string' || source.length === 0) {
    throw new TypeError('provenance: source must be a non-empty string');
  }
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    throw new TypeError('provenance: details must be an object');
  }
  return cloneFrozen({ value, source, ...details });
}

export function reconcileCurrentState({ target, signals, lastKnownState } = {}) {
  const targetState = normalizedState(target);
  if (!targetState) throw new TypeError('reconcileCurrentState: target is required');

  const observed = {
    sentinelState: normalizedState(signals?.sentinelState),
    statusState: normalizedState(signals?.statusState),
    entryMarkerPresent: Boolean(signals?.entryMarkerPresent),
    exitRowPresent: Boolean(signals?.exitRowPresent),
    entryRowPresent: Boolean(signals?.entryRowPresent),
  };
  const recordedState = normalizedState(lastKnownState);

  if (isMoveComplete({ ...observed, target: targetState })) {
    return Object.freeze({ status: 'current', state: targetState, recovery: null });
  }

  // The sentinel is the terminal write. Once it names the target, any missing
  // or contradictory earlier post-condition is durable drift, not a normal
  // crash prefix that replay can safely explain.
  if (observed.sentinelState === targetState) {
    return Object.freeze({
      status: 'drift',
      state: recordedState || observed.statusState || targetState,
      recovery: ACCEPT_LIVE,
    });
  }

  // Before the target sentinel lands, both marker-ahead-of-board and
  // Status-at-target are recognized saga prefixes. Re-running the same
  // movement is idempotent and converges those prefixes.
  if (recordedState === targetState || observed.statusState === targetState) {
    return Object.freeze({
      status: 'incomplete-move',
      state: observed.statusState || recordedState || null,
      recovery: RETRY_MOVEMENT,
    });
  }

  // Two non-target durable authorities that disagree cannot be attributed to
  // the selected move. Preserve the evidence and require explicit adoption.
  if (observed.statusState && recordedState && observed.statusState !== recordedState) {
    return Object.freeze({ status: 'drift', state: recordedState, recovery: ACCEPT_LIVE });
  }

  return Object.freeze({
    status: 'incomplete-move',
    state: observed.statusState || recordedState || null,
    recovery: RETRY_MOVEMENT,
  });
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new TypeError(`deriveStateVisitId: ${label} must be a positive integer`);
  }
  return number;
}

function commitTransitionId(commit) {
  return commit?.transitionId ?? commit?.move ?? commit?.id ?? null;
}

export function deriveStateVisitId({ state, marker = {}, occurrence, transitionCommit } = {}) {
  const stateId = normalizedState(state);
  if (!stateId) throw new TypeError('deriveStateVisitId: state is required');
  if (!marker || typeof marker !== 'object') {
    throw new TypeError('deriveStateVisitId: marker must be an object');
  }

  const transitionId = marker.move ?? marker.transitionId ?? null;
  if (typeof transitionId === 'string' && transitionId.length > 0) {
    const commitId = commitTransitionId(transitionCommit);
    const verified =
      transitionCommit != null &&
      transitionCommit.verified !== false &&
      (commitId == null || commitId === transitionId);
    return cloneFrozen({
      id: transitionId,
      kind: 'transition',
      commitProvenance: verified ? 'verified' : transitionCommit ? 'mismatch' : 'missing',
      diagnostics: verified
        ? []
        : [transitionCommit ? 'commit-provenance-mismatch' : 'commit-provenance-missing'],
    });
  }

  const visit = positiveInteger(marker.visit ?? marker.suffix ?? 1, 'visit');
  const durableOccurrence = positiveInteger(occurrence ?? marker.occurrence, 'occurrence');
  return cloneFrozen({
    id: `legacy:${stateId}:${visit}:${durableOccurrence}`,
    kind: 'legacy',
    commitProvenance: 'not-applicable',
    diagnostics: [],
  });
}

export function createTaskSnapshot(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('createTaskSnapshot: input must be an object');
  }
  return cloneFrozen(input);
}

function valueAtPath(root, path) {
  const segments = String(path).split('.').filter(Boolean);
  let value = root;
  for (const segment of segments) {
    if (value == null || !Object.prototype.hasOwnProperty.call(value, segment)) {
      return { present: false, value: undefined };
    }
    value = value[segment];
  }
  return { present: segments.length > 0, value };
}

export function requireFresh(snapshot, paths) {
  if (!Array.isArray(paths)) throw new TypeError('requireFresh: paths must be an array');
  const missing = [];
  for (const path of paths) {
    const resolved = valueAtPath(snapshot, path);
    const value = resolved.value;
    const stale =
      !resolved.present ||
      value === undefined ||
      (value &&
        typeof value === 'object' &&
        (value.fresh === false || value.authoritative === false || value.stale === true));
    if (stale && !missing.includes(path)) missing.push(path);
  }
  return Object.freeze({ ok: missing.length === 0, missing: Object.freeze(missing) });
}
