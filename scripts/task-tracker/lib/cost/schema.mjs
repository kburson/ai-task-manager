// @story #1733

import { assertNoSecretRecordData } from '../github-records/record-envelope.mjs';
import { stateIds } from '../lifecycle-policy/states.mjs';
import { validateDiagnostic } from './diagnostics.mjs';

const EVENT_KEYS = [
  'diagnostics',
  'eventId',
  'issue',
  'lifecycle',
  'money',
  'observations',
  'occurredAt',
  'operationId',
  'policyId',
  'schema',
  'sources',
  'spans',
];
const IMMUTABLE_EVENT_KEYS = [
  'diagnostics',
  'eventId',
  'eventRole',
  'issue',
  'lines',
  'observations',
  'operationId',
  'policyId',
  'schema',
  'sources',
  'spans',
  'stage',
  'stageVisit',
  'timingEvent',
  'timingRecordedAt',
];
const POLICY_KEYS = [
  'capabilities',
  'captureMode',
  'catalogHashes',
  'effectiveAt',
  'effectiveEventId',
  'policyId',
  'runRules',
  'schema',
  'sourceRules',
];
const RUN_RULE_KEYS = ['kinds', 'requireCompletionEvidence', 'requireLaunchEvidence'];
const RECONCILIATION_KEYS = [
  'addedSpans',
  'correctedEvidence',
  'inputs',
  'projectionHash',
  'reason',
  'removedSpanIds',
  'residuals',
  'revisionId',
  'runFacts',
  'schema',
];
const SUBSCRIPTION_KEYS = [
  'accountRef',
  'capacity',
  'evidenceRefs',
  'fixedSpend',
  'periodEnd',
  'periodId',
  'periodStart',
  'planName',
  'provider',
  'reconciledAt',
  'residuals',
  'rules',
  'schema',
  'usageRefs',
];
const MONEY_KEYS = ['amount', 'currency'];
const SUBSCRIPTION_RULE_KEYS = ['includedCategories', 'overageRates'];
const LIFECYCLE_KEYS = ['role', 'stage', 'transition', 'visit'];
const SOURCE_KEYS = ['accessMode', 'kind', 'label', 'runRef', 'sourceId'];
const OBSERVATION_KEYS = [
  'adapter',
  'capability',
  'diagnostics',
  'eventId',
  'native',
  'observedAt',
  'observationId',
  'provider',
  'schema',
  'sourceId',
  'status',
];
const NATIVE_KEYS = ['category', 'quantity'];
const CAPABILITY_KEYS = ['accessMode', 'runRef'];
const LINE_KEYS = [
  'category',
  'diagnostics',
  'eventId',
  'kind',
  'lineId',
  'observationId',
  'pricing',
  'quantity',
  'schema',
  'sourceId',
  'unit',
];
const PRICING_KEYS = ['amount', 'currency', 'rateCardRef', 'status', 'unitPrice'];
const SAFE_SECRET_KEYS = Object.freeze(['accessMode', 'runRef']);
const NATIVE_CATEGORIES = new Set([
  'cache_creation_input_tokens',
  'cache_read_input_tokens',
  'input_tokens',
  'output_tokens',
  'reasoning_output_tokens',
]);
const EVENT_SCHEMA = 'aitm.agent-cost-event/v1';
const POLICY_SCHEMA = 'aitm.agent-cost-policy/v1';
const RECONCILIATION_SCHEMA = 'aitm.agent-cost-reconciliation/v1';
const SUBSCRIPTION_SCHEMA = 'aitm.subscription-capacity/v1';
const OBSERVATION_SCHEMA = 'aitm.cost-observation/v1';
const LINE_SCHEMA = 'aitm.cost-line/v1';
const ROLES = new Set(['opening', 'work', 'verification', 'review', 'close', 'housekeeping']);
const CAPTURE_MODES = new Set(['disabled', 'manual', 'automatic']);
const OBSERVATION_STATUS = new Set(['available', 'unavailable', 'partial', 'unknown']);
const LINE_KINDS = new Set(['measured-consumption', 'estimated-equivalent', 'actual-billing']);
const LINE_CATEGORIES = new Set([
  'input',
  'cached-input',
  'cache-write-input',
  'output',
  'reasoning-output',
  'tool',
  'runtime',
]);
const UNITS = new Set(['tokens', 'requests', 'seconds', 'usd']);
const HASH_RE = /^sha256:[0-9a-f]{64}$/;

export const COST_RECORD_TYPES = Object.freeze([
  'agent-cost-event',
  'agent-cost-reconciliation',
  'agent-cost-policy',
  'subscription-capacity',
]);

function costError(category) {
  return new TypeError(`cost-schema:${category}`);
}

function exactKeys(value, expectedKeys, category = 'keys') {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw costError(category);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw costError(category);
  }
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function isOpaqueId(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    value === value.trim() &&
    /^[A-Za-z0-9][A-Za-z0-9:._/-]*$/.test(value)
  );
}

function opaqueId(value, category) {
  if (!isOpaqueId(value)) throw costError(category);
}

function stringEnum(value, allowed, category) {
  if (typeof value !== 'string' || !allowed.has(value)) throw costError(category);
}

function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw costError('instant');
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw costError('instant');
  }
}

function stringList(value, category) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && item !== '')) {
    throw costError(category);
  }
}

function objectList(value, category) {
  if (!Array.isArray(value)) throw costError(category);
  for (const item of value) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) throw costError(category);
    assertNoSecretRecordData(item);
  }
}

const isQuantity = (value) => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value);
const isDecimal = (value) =>
  typeof value === 'string' && /^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value);

function quantity(value) {
  if (!isQuantity(value)) throw costError('quantity');
}

function decimal(value) {
  if (!isDecimal(value)) throw costError('decimal');
}

function diagnostics(values) {
  if (!Array.isArray(values)) throw costError('diagnostics');
  for (const diagnostic of values) validateDiagnostic(diagnostic);
}

function validateSource(source) {
  exactKeys(source, SOURCE_KEYS);
  opaqueId(source.sourceId, 'source-id');
  opaqueId(source.kind, 'source-kind');
  if (typeof source.label !== 'string' || source.label.trim() === '' || source.label.length > 160) {
    throw costError('source-label');
  }
  opaqueId(source.accessMode, 'access-mode');
  opaqueId(source.runRef, 'run-ref');
  assertNoSecretRecordData(source, { safeKeyNames: SAFE_SECRET_KEYS });
  return source;
}

function validateNativeCounter(counter) {
  exactKeys(counter, NATIVE_KEYS);
  if (!NATIVE_CATEGORIES.has(counter.category)) throw costError('native-category');
  quantity(counter.quantity);
  return counter;
}

function validateCapability(capability) {
  assertNoSecretRecordData(capability, { safeKeyNames: SAFE_SECRET_KEYS });
  exactKeys(capability, CAPABILITY_KEYS);
  opaqueId(capability.accessMode, 'access-mode');
  opaqueId(capability.runRef, 'run-ref');
  return capability;
}

export function validateObservation(payload) {
  exactKeys(payload, OBSERVATION_KEYS);
  if (payload.schema !== OBSERVATION_SCHEMA) throw costError('schema');
  opaqueId(payload.observationId, 'observation-id');
  opaqueId(payload.sourceId, 'source-id');
  opaqueId(payload.eventId, 'event-id');
  instant(payload.observedAt);
  opaqueId(payload.provider, 'provider');
  opaqueId(payload.adapter, 'adapter');
  stringEnum(payload.status, OBSERVATION_STATUS, 'status');
  if (!Array.isArray(payload.native)) throw costError('native');
  for (const counter of payload.native) validateNativeCounter(counter);
  validateCapability(payload.capability);
  diagnostics(payload.diagnostics);
  assertNoSecretRecordData(payload, { safeKeyNames: SAFE_SECRET_KEYS });
  return payload;
}

function validateMoney(money) {
  exactKeys(money, MONEY_KEYS, 'money');
  decimal(money.amount);
  if (typeof money.currency !== 'string' || !/^[A-Z]{3}$/.test(money.currency)) {
    throw costError('currency');
  }
  return money;
}

function validatePricing(pricing) {
  exactKeys(pricing, PRICING_KEYS, 'pricing');
  stringEnum(pricing.status, new Set(['available', 'unavailable', 'unknown']), 'pricing-status');
  if (pricing.status === 'available') {
    if (typeof pricing.currency !== 'string' || !/^[A-Z]{3}$/.test(pricing.currency)) {
      throw costError('currency');
    }
    decimal(pricing.unitPrice);
    decimal(pricing.amount);
    opaqueId(pricing.rateCardRef, 'rate-card-ref');
    return pricing;
  }
  for (const key of ['currency', 'unitPrice', 'amount', 'rateCardRef']) {
    if (pricing[key] !== null) throw costError('pricing-null');
  }
  return pricing;
}

function validateLine(payload) {
  exactKeys(payload, LINE_KEYS);
  if (payload.schema !== LINE_SCHEMA) throw costError('schema');
  opaqueId(payload.lineId, 'line-id');
  opaqueId(payload.eventId, 'event-id');
  opaqueId(payload.observationId, 'observation-id');
  opaqueId(payload.sourceId, 'source-id');
  stringEnum(payload.kind, LINE_KINDS, 'line-kind');
  stringEnum(payload.category, LINE_CATEGORIES, 'line-category');
  quantity(payload.quantity);
  stringEnum(payload.unit, UNITS, 'unit');
  validatePricing(payload.pricing);
  diagnostics(payload.diagnostics);
  assertNoSecretRecordData(payload, { safeKeyNames: SAFE_SECRET_KEYS });
  return payload;
}

function validateLifecycle(lifecycle) {
  exactKeys(lifecycle, LIFECYCLE_KEYS, 'lifecycle');
  if (
    typeof lifecycle.transition !== 'string' ||
    !/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/.test(lifecycle.transition)
  ) {
    throw costError('transition');
  }
  if (!stateIds().includes(lifecycle.stage)) throw costError('stage');
  if (!Number.isInteger(lifecycle.visit) || lifecycle.visit <= 0) throw costError('visit');
  stringEnum(lifecycle.role, ROLES, 'role');
  return lifecycle;
}

function validateEvent(payload) {
  exactKeys(payload, EVENT_KEYS);
  if (payload.schema !== EVENT_SCHEMA) throw costError('schema');
  opaqueId(payload.policyId, 'policy-id');
  opaqueId(payload.eventId, 'event-id');
  opaqueId(payload.operationId, 'operation-id');
  if (!Number.isInteger(payload.issue) || payload.issue <= 0) throw costError('issue');
  instant(payload.occurredAt);
  validateLifecycle(payload.lifecycle);
  if (!Array.isArray(payload.sources) || payload.sources.length === 0) throw costError('sources');
  for (const source of payload.sources) validateSource(source);
  if (!Array.isArray(payload.observations)) throw costError('observations');
  for (const observation of payload.observations) validateObservation(observation);
  if (!Array.isArray(payload.spans) || payload.spans.length !== 0) throw costError('spans');
  if (!Array.isArray(payload.money) || payload.money.length !== 0) throw costError('money');
  diagnostics(payload.diagnostics);
  assertNoSecretRecordData(payload, { safeKeyNames: SAFE_SECRET_KEYS });
  return payload;
}

function validateImmutableEvent(payload) {
  exactKeys(payload, IMMUTABLE_EVENT_KEYS);
  if (payload.schema !== EVENT_SCHEMA) throw costError('schema');
  opaqueId(payload.policyId, 'policy-id');
  opaqueId(payload.eventId, 'event-id');
  opaqueId(payload.operationId, 'operation-id');
  if (!Number.isInteger(payload.issue) || payload.issue <= 0) throw costError('issue');
  if (
    typeof payload.timingEvent !== 'string' ||
    !/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/.test(payload.timingEvent)
  ) {
    throw costError('timing-event');
  }
  instant(payload.timingRecordedAt);
  if (!stateIds().includes(payload.stage)) throw costError('stage');
  if (!Number.isInteger(payload.stageVisit) || payload.stageVisit <= 0)
    throw costError('stage-visit');
  stringEnum(payload.eventRole, ROLES, 'role');
  objectList(payload.sources, 'sources');
  objectList(payload.observations, 'observations');
  objectList(payload.spans, 'spans');
  objectList(payload.lines, 'lines');
  diagnostics(payload.diagnostics);
  assertNoSecretRecordData(payload, { safeKeyNames: SAFE_SECRET_KEYS });
  return payload;
}

function validatePolicy(payload) {
  exactKeys(payload, POLICY_KEYS);
  if (payload.schema !== POLICY_SCHEMA) throw costError('schema');
  opaqueId(payload.policyId, 'policy-id');
  opaqueId(payload.effectiveEventId, 'event-id');
  instant(payload.effectiveAt);
  stringEnum(payload.captureMode, CAPTURE_MODES, 'capture-mode');
  objectList(payload.sourceRules, 'source-rules');
  objectList(payload.capabilities, 'capabilities');
  stringList(payload.catalogHashes, 'catalog-hashes');
  exactKeys(payload.runRules, RUN_RULE_KEYS, 'run-rules');
  stringList(payload.runRules.kinds, 'run-rule-kinds');
  if (typeof payload.runRules.requireLaunchEvidence !== 'boolean') throw costError('run-rules');
  if (typeof payload.runRules.requireCompletionEvidence !== 'boolean') throw costError('run-rules');
  assertNoSecretRecordData(payload, { safeKeyNames: SAFE_SECRET_KEYS });
  return payload;
}

function validateReconciliation(payload) {
  exactKeys(payload, RECONCILIATION_KEYS);
  if (payload.schema !== RECONCILIATION_SCHEMA) throw costError('schema');
  opaqueId(payload.revisionId, 'revision-id');
  if (
    typeof payload.reason !== 'string' ||
    payload.reason.trim() === '' ||
    payload.reason.length > 160
  ) {
    throw costError('reason');
  }
  stringList(payload.inputs, 'inputs');
  stringList(payload.removedSpanIds, 'removed-spans');
  objectList(payload.addedSpans, 'added-spans');
  objectList(payload.correctedEvidence, 'corrected-evidence');
  objectList(payload.runFacts, 'run-facts');
  objectList(payload.residuals, 'residuals');
  if (typeof payload.projectionHash !== 'string' || !HASH_RE.test(payload.projectionHash)) {
    throw costError('projection-hash');
  }
  assertNoSecretRecordData(payload, { safeKeyNames: SAFE_SECRET_KEYS });
  return payload;
}

function validateSubscription(payload) {
  exactKeys(payload, SUBSCRIPTION_KEYS);
  if (payload.schema !== SUBSCRIPTION_SCHEMA) throw costError('schema');
  opaqueId(payload.periodId, 'period-id');
  opaqueId(payload.provider, 'provider');
  opaqueId(payload.accountRef, 'account-ref');
  opaqueId(payload.planName, 'plan-name');
  instant(payload.periodStart);
  instant(payload.periodEnd);
  validateMoney(payload.fixedSpend);
  objectList(payload.capacity, 'capacity');
  exactKeys(payload.rules, SUBSCRIPTION_RULE_KEYS, 'subscription-rules');
  objectList(payload.rules.includedCategories, 'included-categories');
  objectList(payload.rules.overageRates, 'overage-rates');
  stringList(payload.usageRefs, 'usage-refs');
  objectList(payload.residuals, 'residuals');
  stringList(payload.evidenceRefs, 'evidence-refs');
  instant(payload.reconciledAt);
  assertNoSecretRecordData(payload, { safeKeyNames: SAFE_SECRET_KEYS });
  return payload;
}

export function validateCostPayload(kind, payload) {
  let validated;
  switch (kind) {
    case 'agent-cost-event':
      validated = Object.hasOwn(payload ?? {}, 'timingEvent')
        ? validateImmutableEvent(payload)
        : validateEvent(payload);
      break;
    case 'agent-cost-policy':
      validated = validatePolicy(payload);
      break;
    case 'agent-cost-reconciliation':
      validated = validateReconciliation(payload);
      break;
    case 'subscription-capacity':
      validated = validateSubscription(payload);
      break;
    case 'source-observation':
      validated = validateObservation(payload);
      break;
    case 'cost-line':
      validated = validateLine(payload);
      break;
    default:
      throw costError('kind');
  }
  return deepFreeze(validated);
}
