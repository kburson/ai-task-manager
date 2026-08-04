import { isHalfHourEstimate } from './estimate-granularity.mjs';

export const FORECAST_RECORD_TYPE = 'estimation-forecast';
export const LEGACY_FORECAST_SCHEMA = 'aitm.estimation-forecast/v1';
export const FORECAST_SCHEMA = 'aitm.estimation-forecast/v2';
const FORECAST_SCHEMAS = new Set([LEGACY_FORECAST_SCHEMA, FORECAST_SCHEMA]);

const ROOT_KEYS = [
  'ai',
  'comparableIssues',
  'issue',
  'lifecycleState',
  'plan',
  'recommendation',
  'refine',
  'risks',
  'rubric',
  'schema',
  'supersedesForecastRecordId',
  'testPlan',
  'wbs',
];
const SIZE_VALUES = new Set(['XS', 'S', 'M', 'L', 'XL']);
const RECORD_ID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

function fail(category) {
  throw new TypeError(`estimation-record:${category}`);
}
function exact(value, keys, category) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(category);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]))
    fail(category);
}
function hours(value, category) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail(category);
}
function estimateHours(value, category) {
  hours(value, category);
  if (!isHalfHourEstimate(value)) fail(`${category}-grid`);
}
function text(value, category) {
  if (typeof value !== 'string' || value.trim().length === 0 || value !== value.trim())
    fail(category);
}
function recordId(value, category, nullable = false) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || !RECORD_ID_RE.test(value)) fail(category);
}
function stringArray(value, category) {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string' || entry.trim() === '')
  )
    fail(category);
}
function closeEnough(left, right) {
  return Math.abs(left - right) < 1e-9;
}

export function validateEstimationForecast(
  payload,
  { expectedIssue, requireCurrentSchema = false } = {}
) {
  if (!FORECAST_SCHEMAS.has(payload?.schema)) fail('forecast-schema');
  if (requireCurrentSchema && payload.schema !== FORECAST_SCHEMA) fail('forecast-schema');
  const validatePublishedHours = payload.schema === FORECAST_SCHEMA ? estimateHours : hours;
  exact(payload, ROOT_KEYS, 'forecast-keys');
  if (!Number.isInteger(payload.issue) || payload.issue <= 0) fail('forecast-issue');
  if (expectedIssue !== undefined && payload.issue !== expectedIssue) fail('issue-correlation');
  if (payload.lifecycleState !== 'plan') fail('forecast-state');

  exact(payload.refine, ['humanHours', 'size'], 'forecast-refine');
  exact(payload.plan, ['deltaHours', 'humanHours', 'rationale', 'size'], 'forecast-plan');
  if (!SIZE_VALUES.has(payload.refine.size) || !SIZE_VALUES.has(payload.plan.size))
    fail('forecast-size');
  validatePublishedHours(payload.refine.humanHours, 'forecast-hours');
  validatePublishedHours(payload.plan.humanHours, 'forecast-hours');
  if (typeof payload.plan.deltaHours !== 'number' || !Number.isFinite(payload.plan.deltaHours))
    fail('forecast-delta');
  if (!closeEnough(payload.plan.humanHours - payload.refine.humanHours, payload.plan.deltaHours))
    fail('forecast-delta');
  text(payload.plan.rationale, 'forecast-rationale');

  exact(payload.ai, ['p50EngagedHours', 'p80EngagedHours', 'stages'], 'forecast-ai');
  validatePublishedHours(payload.ai.p50EngagedHours, 'forecast-ai-hours');
  validatePublishedHours(payload.ai.p80EngagedHours, 'forecast-ai-hours');
  if (payload.ai.p80EngagedHours < payload.ai.p50EngagedHours) fail('forecast-ai-order');
  exact(payload.ai.stages, ['develop', 'plan', 'review', 'test'], 'forecast-stages');
  for (const value of Object.values(payload.ai.stages))
    validatePublishedHours(value, 'forecast-stage-hours');
  if (
    !closeEnough(
      Object.values(payload.ai.stages).reduce((sum, value) => sum + value, 0),
      payload.ai.p50EngagedHours
    )
  )
    fail('forecast-stage-total');

  if (!Array.isArray(payload.wbs) || payload.wbs.length === 0) fail('forecast-wbs');
  const wbsIds = new Set();
  for (const item of payload.wbs) {
    exact(item, ['description', 'humanHours', 'id', 'signals'], 'forecast-wbs-item');
    text(item.id, 'forecast-wbs-id');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(item.id) || wbsIds.has(item.id)) fail('forecast-wbs-id');
    wbsIds.add(item.id);
    text(item.description, 'forecast-wbs-description');
    validatePublishedHours(item.humanHours, 'forecast-wbs-hours');
    stringArray(item.signals, 'forecast-wbs-signals');
  }
  if (
    !closeEnough(
      payload.wbs.reduce((sum, item) => sum + item.humanHours, 0),
      payload.plan.humanHours
    )
  )
    fail('forecast-wbs-total');

  if (!Array.isArray(payload.comparableIssues)) fail('forecast-comparables');
  for (const comparable of payload.comparableIssues) {
    exact(comparable, ['issue', 'outcomeRecordId', 'weight'], 'forecast-comparable');
    if (!Number.isInteger(comparable.issue) || comparable.issue <= 0)
      fail('forecast-comparable-issue');
    recordId(comparable.outcomeRecordId, 'forecast-comparable-record');
    if (
      typeof comparable.weight !== 'number' ||
      !Number.isFinite(comparable.weight) ||
      comparable.weight < 0 ||
      comparable.weight > 1
    )
      fail('forecast-comparable-weight');
  }

  exact(payload.rubric, ['cohortSize', 'confidence', 'recordId', 'version'], 'forecast-rubric');
  recordId(payload.rubric.recordId, 'forecast-rubric-record');
  if (
    !Number.isInteger(payload.rubric.version) ||
    payload.rubric.version <= 0 ||
    !Number.isInteger(payload.rubric.cohortSize) ||
    payload.rubric.cohortSize < 0
  )
    fail('forecast-rubric-version');
  if (
    typeof payload.rubric.confidence !== 'number' ||
    !Number.isFinite(payload.rubric.confidence) ||
    payload.rubric.confidence < 0 ||
    payload.rubric.confidence > 1
  )
    fail('forecast-rubric-confidence');

  exact(payload.testPlan, ['expectedMinutes', 'impactedLanes', 'isolation'], 'forecast-test-plan');
  stringArray(payload.testPlan.impactedLanes, 'forecast-test-lanes');
  text(payload.testPlan.isolation, 'forecast-test-isolation');
  hours(payload.testPlan.expectedMinutes, 'forecast-test-minutes');
  stringArray(payload.risks, 'forecast-risks');
  exact(payload.recommendation, ['action', 'reason'], 'forecast-recommendation');
  if (!new Set(['proceed', 'split', 'refine-further']).has(payload.recommendation.action))
    fail('forecast-recommendation-action');
  text(payload.recommendation.reason, 'forecast-recommendation-reason');
  recordId(payload.supersedesForecastRecordId, 'forecast-supersedes', true);
  return payload;
}
