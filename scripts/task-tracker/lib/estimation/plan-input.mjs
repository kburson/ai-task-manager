export const PLAN_ESTIMATION_INPUT_SCHEMA = 'aitm.plan-estimation-input/v1';

function fail(category) {
  throw new TypeError(`plan-estimation-input:${category}`);
}
function exact(value, keys, category) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(category);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]))
    fail(category);
}
function strings(value, category, { nonempty = false } = {}) {
  if (
    !Array.isArray(value) ||
    (nonempty && value.length === 0) ||
    value.some((entry) => typeof entry !== 'string' || entry.trim() === '')
  )
    fail(category);
}
function description(value) {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value.length < 12 ||
    /^(?:todo|tbd|placeholder|\.\.\.)$/i.test(value)
  )
    fail('wbs-description');
}

export function parsePlanEstimationInput(input) {
  let value = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch {
      fail('json');
    }
  }
  if (value?.schema !== PLAN_ESTIMATION_INPUT_SCHEMA) fail('schema');
  exact(value, ['comparableIssueIds', 'risks', 'schema', 'testImpact', 'wbs'], 'keys');
  if (!Array.isArray(value.wbs) || value.wbs.length === 0) fail('wbs');
  const ids = new Set();
  for (const item of value.wbs) {
    exact(
      item,
      ['baseHumanHours', 'description', 'id', 'independentlyReviewable', 'signals'],
      'wbs-item'
    );
    if (typeof item.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(item.id) || ids.has(item.id))
      fail('wbs-id');
    ids.add(item.id);
    description(item.description);
    if (
      typeof item.baseHumanHours !== 'number' ||
      !Number.isFinite(item.baseHumanHours) ||
      item.baseHumanHours <= 0
    )
      fail('wbs-hours');
    if (typeof item.independentlyReviewable !== 'boolean') fail('wbs-reviewable');
    exact(item.signals, ['dependencies', 'modules'], 'wbs-signals');
    strings(item.signals.modules, 'wbs-modules', { nonempty: true });
    strings(item.signals.dependencies, 'wbs-dependencies');
  }
  exact(value.testImpact, ['expectedMinutes', 'isolation', 'lanes'], 'test-impact');
  strings(value.testImpact.lanes, 'test-lanes', { nonempty: true });
  if (typeof value.testImpact.isolation !== 'string' || value.testImpact.isolation.trim() === '')
    fail('test-isolation');
  if (
    typeof value.testImpact.expectedMinutes !== 'number' ||
    !Number.isFinite(value.testImpact.expectedMinutes) ||
    value.testImpact.expectedMinutes < 0
  )
    fail('test-minutes');
  strings(value.risks, 'risks');
  if (
    !Array.isArray(value.comparableIssueIds) ||
    value.comparableIssueIds.some((issue) => !Number.isInteger(issue) || issue <= 0) ||
    new Set(value.comparableIssueIds).size !== value.comparableIssueIds.length
  )
    fail('comparables');
  return structuredClone(value);
}
