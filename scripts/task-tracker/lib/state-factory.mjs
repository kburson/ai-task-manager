// @story #1117 #1450

import {
  InvalidStateDefinitionError,
  buildMethodIndex,
  validateStateMethod,
} from './state-method-registry.mjs';

export { InvalidStateDefinitionError, buildMethodIndex, validateStateMethod };

const LIST_CONTRACTS = Object.freeze([
  Object.freeze({ key: 'entryGuards', kind: 'guard' }),
  Object.freeze({ key: 'residentActions', kind: 'resident-action' }),
  Object.freeze({ key: 'exitGuards', kind: 'guard' }),
]);
const RESIDENT_ACTION_DEFINITION_CAP = 96;

function fail(code, details) {
  throw new InvalidStateDefinitionError(code, details);
}

function assertPolicy(policy) {
  const required = [
    'stateIds',
    'normalizeStateId',
    'forwardTarget',
    'backwardTargets',
    'validateExecutableTransition',
  ];
  if (!policy || required.some((key) => typeof policy[key] !== 'function')) {
    fail('policy-contract', { required });
  }
}

function copyDefinition(definition, policy, residentActionIds) {
  if (!definition || typeof definition !== 'object') fail('state-definition-contract');
  const id = policy.normalizeStateId(definition.id);
  if (!id) fail('state-id', { id: definition.id });

  const copied = { id };
  for (const { key, kind } of LIST_CONTRACTS) {
    const methods = definition[key];
    if (!Array.isArray(methods)) fail('state-definition-contract', { id, field: key });
    const ids = new Set();
    for (const method of methods) {
      validateStateMethod(method, kind);
      if (ids.has(method.id)) fail('duplicate-method-id', { id, list: key, methodId: method.id });
      ids.add(method.id);
      if (kind === 'resident-action') residentActionIds.add(method.id);
    }
    copied[key] = Object.freeze([...methods]);
  }
  return Object.freeze(copied);
}

function validatePolicyEdges(order, policy) {
  for (const from of order) {
    const targets = [policy.forwardTarget(from), ...policy.backwardTargets(from)].filter(Boolean);
    for (const to of targets) {
      const result = policy.validateExecutableTransition(from, to);
      if (!result?.ok) fail('policy-edge-invalid', { from, to, reason: result?.reason });
    }
  }
}

export function createStateMachine({ definitions, policy } = {}) {
  assertPolicy(policy);
  if (!Array.isArray(definitions)) fail('state-definition-contract', { field: 'definitions' });

  const residentActionIds = new Set();
  const copied = definitions.map((definition) =>
    copyDefinition(definition, policy, residentActionIds)
  );
  const normalizedIds = copied.map(({ id }) => id);
  const duplicate = normalizedIds.find((id, index) => normalizedIds.indexOf(id) !== index);
  if (duplicate) fail('duplicate-state-id', { id: duplicate });

  const expectedOrder = [...policy.stateIds()];
  if (
    normalizedIds.length !== expectedOrder.length ||
    normalizedIds.some((id, index) => id !== expectedOrder[index])
  ) {
    fail('state-order-mismatch', { actual: normalizedIds, expected: expectedOrder });
  }
  if (residentActionIds.size > RESIDENT_ACTION_DEFINITION_CAP) {
    fail('resident-action-definition-cap', {
      actual: residentActionIds.size,
      limit: RESIDENT_ACTION_DEFINITION_CAP,
    });
  }

  validatePolicyEdges(expectedOrder, policy);

  const byId = Object.create(null);
  for (const definition of copied) byId[definition.id] = definition;
  Object.freeze(byId);
  const order = Object.freeze([...expectedOrder]);
  const methodById = buildMethodIndex(copied);

  function normalizeKnown(input) {
    const id = policy.normalizeStateId(input);
    if (!id || !byId[id]) throw new Error(`unknown state: ${String(input)}`);
    return id;
  }

  return Object.freeze({
    order,
    byId,
    methodById,
    get(input) {
      return byId[normalizeKnown(input)];
    },
    previous(input) {
      const index = order.indexOf(normalizeKnown(input));
      return index > 0 ? order[index - 1] : undefined;
    },
    next(input) {
      return policy.forwardTarget(normalizeKnown(input));
    },
    backwardTargets(input) {
      return policy.backwardTargets(normalizeKnown(input));
    },
  });
}
