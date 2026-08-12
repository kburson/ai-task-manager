import { stateIds, stateIndex } from './states.mjs';
import { forwardTarget } from './executable-transitions.mjs';

const frozen = (values) => Object.freeze([...values]);

const PROMOTE_DELEGATES = Object.freeze({
  develop: 'test',
  test: 'review',
  review: 'close',
});

const ACTION_POLICIES = Object.freeze({
  test: Object.freeze({
    allowedStates: frozen(['develop', 'test', 'review']),
  }),
  review: Object.freeze({
    allowedStates: frozen(['test', 'review']),
  }),
  close: Object.freeze({
    allowedStates: frozen(['review']),
  }),
  promote: Object.freeze({
    allowedStates: frozen(stateIds().slice(0, -1)),
  }),
  refine: Object.freeze({
    allowedStates: frozen(['backlog', 'refine']),
    entryStates: frozen(['backlog', 'refine']),
    selfRun: 'complete-to-ready-for-plan',
  }),
  demote: Object.freeze({
    allowedStates: frozen(['test', 'review']),
    target: 'develop',
    requires: 'rework-reason',
  }),
  shelve: Object.freeze({
    allowedStates: frozen(['refine', 'ready-for-plan']),
    target: 'backlog',
    requires: 'reason',
  }),
  park: Object.freeze({
    allowedStates: frozen(['refine', 'ready-for-plan']),
    target: 'backlog',
    requires: 'reason',
  }),
  'cancel-plan': Object.freeze({
    allowedStates: frozen(['plan']),
    target: 'ready-for-plan',
    requires: 'reason',
  }),
});

function resultBase(action, currentState, policy) {
  const result = {
    action,
    currentState,
    allowedStates: policy.allowedStates,
  };
  if (policy.target) result.target = policy.target;
  if (policy.requires) result.requires = policy.requires;
  if (policy.entryStates) result.entryStates = policy.entryStates;
  if (policy.selfRun) result.selfRun = policy.selfRun;
  return result;
}

export function actionPolicyFor(action, currentState = null) {
  const policy = ACTION_POLICIES[action];
  if (!policy) {
    return Object.freeze({ ok: false, kind: 'unknown-action', action });
  }

  const normalizedState = currentState == null ? null : currentState;
  const base = resultBase(action, normalizedState, policy);
  if (normalizedState === null) {
    return Object.freeze({
      ok: true,
      kind: 'bootstrap',
      ...base,
      bootstrap: 'resolve-live-state',
    });
  }
  if (stateIndex(normalizedState) < 0) {
    return Object.freeze({ ok: false, kind: 'unknown-state', ...base });
  }
  if (!policy.allowedStates.includes(normalizedState)) {
    return Object.freeze({ ok: false, kind: 'refused', ...base });
  }

  const allowed = { ok: true, kind: 'allowed', ...base };
  if (action === 'promote') {
    allowed.target = forwardTarget(normalizedState);
    const delegate = PROMOTE_DELEGATES[normalizedState];
    if (delegate) allowed.delegate = delegate;
  }
  return Object.freeze(allowed);
}
