export const RUBRIC_RECORD_TYPE = 'estimation-rubric';
export const RUBRIC_SCHEMA = 'aitm.estimation-rubric/v1';

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
function finite(
  value,
  category,
  { integer = false, minimum = 0, maximum = Number.POSITIVE_INFINITY } = {}
) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (integer && !Number.isInteger(value))
  )
    fail(category);
}
function coefficients(value, category) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(category);
  for (const [key, coefficient] of Object.entries(value)) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(key)) fail(category);
    finite(coefficient, category);
  }
}

export function validateEstimationRubric(payload) {
  if (payload?.schema !== RUBRIC_SCHEMA) fail('rubric-schema');
  exact(
    payload,
    [
      'accuracy',
      'ai',
      'cohort',
      'generatedAt',
      'human',
      'predecessorRecordId',
      'review',
      'schema',
      'testLandscape',
      'version',
      'workflowDiagnostics',
    ],
    'rubric-keys'
  );
  finite(payload.version, 'rubric-version', { integer: true, minimum: 1 });
  if (
    payload.predecessorRecordId !== null &&
    (typeof payload.predecessorRecordId !== 'string' ||
      !RECORD_ID_RE.test(payload.predecessorRecordId))
  )
    fail('rubric-predecessor');
  if (
    typeof payload.generatedAt !== 'string' ||
    new Date(payload.generatedAt).toISOString() !== payload.generatedAt
  )
    fail('rubric-generated-at');
  if (!Array.isArray(payload.cohort)) fail('rubric-cohort');
  const seen = new Set();
  for (const item of payload.cohort) {
    exact(item, ['issue', 'outcomeRecordId'], 'rubric-cohort-item');
    if (
      !Number.isInteger(item.issue) ||
      item.issue <= 0 ||
      typeof item.outcomeRecordId !== 'string' ||
      !RECORD_ID_RE.test(item.outcomeRecordId)
    )
      fail('rubric-cohort-item');
    if (seen.has(item.outcomeRecordId)) fail('rubric-cohort-duplicate');
    seen.add(item.outcomeRecordId);
  }
  for (const key of ['human', 'ai']) {
    exact(payload[key], ['coefficients', 'confidence', 'sampleSize'], `rubric-${key}`);
    coefficients(payload[key].coefficients, `rubric-${key}-coefficients`);
    finite(payload[key].sampleSize, `rubric-${key}-sample`, { integer: true });
    finite(payload[key].confidence, `rubric-${key}-confidence`, { maximum: 1 });
    if (payload[key].sampleSize !== payload.cohort.length) fail(`rubric-${key}-sample`);
  }
  exact(payload.workflowDiagnostics, ['avoidableProcessWasteHours'], 'rubric-workflow');
  finite(payload.workflowDiagnostics.avoidableProcessWasteHours, 'rubric-workflow-hours');
  exact(payload.testLandscape, ['laneMinutes', 'sandboxMinutes'], 'rubric-test');
  coefficients(payload.testLandscape.laneMinutes, 'rubric-lanes');
  finite(payload.testLandscape.sandboxMinutes, 'rubric-sandbox');
  exact(payload.review, ['reworkProbability'], 'rubric-review');
  finite(payload.review.reworkProbability, 'rubric-review-probability', { maximum: 1 });
  exact(payload.accuracy, ['aiP50', 'aiP80Coverage', 'refineToPlan'], 'rubric-accuracy');
  coefficients(payload.accuracy.refineToPlan, 'rubric-refine-accuracy');
  coefficients(payload.accuracy.aiP50, 'rubric-ai-accuracy');
  finite(payload.accuracy.aiP80Coverage, 'rubric-p80-coverage', { maximum: 1 });
  return payload;
}
