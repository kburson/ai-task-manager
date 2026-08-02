export const OUTCOME_RECORD_TYPE = 'estimation-outcome';
export const OUTCOME_SCHEMA = 'aitm.estimation-outcome/v1';

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
function finite(value, category, { integer = false, minimum = 0 } = {}) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    (integer && !Number.isInteger(value))
  )
    fail(category);
}
function closeEnough(left, right) {
  return Math.abs(left - right) < 1e-9;
}

export function validateEstimationOutcome(payload, { expectedIssue } = {}) {
  if (payload?.schema !== OUTCOME_SCHEMA) fail('outcome-schema');
  exact(
    payload,
    [
      'actual',
      'aiForecast',
      'costClassification',
      'forecastRecordId',
      'humanPlanHours',
      'issue',
      'landscape',
      'schema',
      'variance',
    ],
    'outcome-keys'
  );
  if (!Number.isInteger(payload.issue) || payload.issue <= 0) fail('outcome-issue');
  if (expectedIssue !== undefined && payload.issue !== expectedIssue) fail('issue-correlation');
  if (typeof payload.forecastRecordId !== 'string' || !RECORD_ID_RE.test(payload.forecastRecordId))
    fail('outcome-frozen-forecast');
  finite(payload.humanPlanHours, 'outcome-human-hours');
  exact(payload.aiForecast, ['p50EngagedHours', 'p80EngagedHours'], 'outcome-ai');
  finite(payload.aiForecast.p50EngagedHours, 'outcome-ai-hours');
  finite(payload.aiForecast.p80EngagedHours, 'outcome-ai-hours');
  if (payload.aiForecast.p80EngagedHours < payload.aiForecast.p50EngagedHours)
    fail('outcome-ai-order');

  exact(
    payload.actual,
    ['commands', 'engagedHours', 'reviewFixCycles', 'stages'],
    'outcome-actual'
  );
  finite(payload.actual.engagedHours, 'outcome-actual-hours');
  finite(payload.actual.reviewFixCycles, 'outcome-review-cycles', { integer: true });
  exact(payload.actual.stages, ['develop', 'plan', 'review', 'test'], 'outcome-stages');
  for (const value of Object.values(payload.actual.stages)) finite(value, 'outcome-stage-hours');
  if (
    !closeEnough(
      Object.values(payload.actual.stages).reduce((sum, value) => sum + value, 0),
      payload.actual.engagedHours
    )
  )
    fail('outcome-stage-total');
  if (!Array.isArray(payload.actual.commands)) fail('outcome-commands');
  for (const command of payload.actual.commands) {
    exact(command, ['attempts', 'classification', 'durationMs'], 'outcome-command');
    if (typeof command.classification !== 'string' || command.classification.trim() === '')
      fail('outcome-command-classification');
    finite(command.durationMs, 'outcome-command-duration', { integer: true });
    finite(command.attempts, 'outcome-command-attempts', { integer: true, minimum: 1 });
  }

  exact(
    payload.landscape,
    ['childOutcomeRecordIds', 'dependencyBreadth', 'filesChanged', 'lanes', 'modules'],
    'outcome-landscape'
  );
  finite(payload.landscape.filesChanged, 'outcome-files', { integer: true });
  finite(payload.landscape.dependencyBreadth, 'outcome-dependencies', { integer: true });
  for (const key of ['modules', 'lanes'])
    if (
      !Array.isArray(payload.landscape[key]) ||
      payload.landscape[key].some((entry) => typeof entry !== 'string' || entry.trim() === '')
    )
      fail(`outcome-${key}`);
  if (
    !Array.isArray(payload.landscape.childOutcomeRecordIds) ||
    payload.landscape.childOutcomeRecordIds.some(
      (recordId) => typeof recordId !== 'string' || !RECORD_ID_RE.test(recordId)
    ) ||
    new Set(payload.landscape.childOutcomeRecordIds).size !==
      payload.landscape.childOutcomeRecordIds.length
  ) {
    fail('outcome-child-records');
  }
  exact(payload.variance, ['vsAiP50Hours', 'vsAiP80Hours'], 'outcome-variance');
  for (const value of Object.values(payload.variance))
    if (typeof value !== 'number' || !Number.isFinite(value)) fail('outcome-variance-hours');

  exact(
    payload.costClassification,
    ['avoidableProcessWasteHours', 'drivers', 'necessaryHours', 'unclassifiedHours'],
    'outcome-cost'
  );
  for (const key of ['necessaryHours', 'avoidableProcessWasteHours', 'unclassifiedHours'])
    finite(payload.costClassification[key], 'outcome-cost-hours');
  if (
    !closeEnough(
      payload.costClassification.necessaryHours +
        payload.costClassification.avoidableProcessWasteHours +
        payload.costClassification.unclassifiedHours,
      payload.actual.engagedHours
    )
  )
    fail('outcome-cost-total');
  if (!Array.isArray(payload.costClassification.drivers)) fail('outcome-cost-drivers');
  for (const driver of payload.costClassification.drivers) {
    exact(driver, ['hours', 'kind'], 'outcome-cost-driver');
    if (typeof driver.kind !== 'string' || driver.kind.trim() === '')
      fail('outcome-cost-driver-kind');
    finite(driver.hours, 'outcome-cost-driver-hours');
  }
  return payload;
}
