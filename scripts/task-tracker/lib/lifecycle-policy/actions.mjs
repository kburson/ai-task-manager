import { stateIds, stateIndex } from './states.mjs';
import { forwardTarget } from './executable-transitions.mjs';

const frozen = (values) => Object.freeze([...values]);

const PROMOTE_DELEGATES = Object.freeze({
  develop: 'test',
  test: 'review',
  review: 'close',
});

const ALL_STATES = frozen(stateIds());

const ACTION_POLICIES = Object.freeze({
  bind: Object.freeze({
    allowedStates: ALL_STATES,
  }),
  resume: Object.freeze({
    allowedStates: ALL_STATES,
  }),
  test: Object.freeze({
    allowedStates: frozen(['develop', 'test', 'review']),
  }),
  review: Object.freeze({
    allowedStates: frozen(['test', 'review']),
  }),
  deliver: Object.freeze({
    allowedStates: frozen(['review']),
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

const objectSchema = (properties = {}) =>
  Object.freeze({
    type: 'object',
    additionalProperties: false,
    properties: Object.freeze({ ...properties }),
  });

const descriptor = (id, values) =>
  Object.freeze({
    id,
    argumentSchema: objectSchema(),
    humanRequired: false,
    providerAction: false,
    destructive: false,
    fullAutoAllowed: true,
    guidanceId: `action.${id}`,
    evaluator: `evaluate-${id}`,
    executor: id,
    explainReady: true,
    ...values,
  });

const ACTION_DESCRIPTORS = Object.freeze([
  descriptor('bind'),
  descriptor('resume'),
  descriptor('promote'),
  descriptor('test'),
  descriptor('review', { providerAction: true }),
  descriptor('deliver', { providerAction: true }),
  descriptor('close', { destructive: true }),
  descriptor('refine', { evaluator: null, explainReady: false }),
  descriptor('demote', { evaluator: null, explainReady: false }),
  descriptor('shelve', { evaluator: null, explainReady: false }),
  descriptor('park', { evaluator: null, explainReady: false }),
  descriptor('cancel-plan', { evaluator: null, explainReady: false }),
]);

const ACTION_DESCRIPTOR_BY_ID = new Map(ACTION_DESCRIPTORS.map((entry) => [entry.id, entry]));

export function listLifecycleActions() {
  return [...ACTION_DESCRIPTORS];
}

export function actionDescriptorFor(actionId) {
  return ACTION_DESCRIPTOR_BY_ID.get(actionId) ?? null;
}

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
