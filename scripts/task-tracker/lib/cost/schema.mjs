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
const OBSERVATION_SCHEMA = 'aitm.cost-observation/v1';
const LINE_SCHEMA = 'aitm.cost-line/v1';
const ROLES = new Set(['opening', 'work', 'verification', 'review', 'close', 'housekeeping']);
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

function validateObservation(payload) {
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

export function validateCostPayload(kind, payload) {
  switch (kind) {
    case 'agent-cost-event':
      return validateEvent(payload);
    case 'source-observation':
      return validateObservation(payload);
    case 'cost-line':
      return validateLine(payload);
    default:
      throw costError('kind');
  }
}
