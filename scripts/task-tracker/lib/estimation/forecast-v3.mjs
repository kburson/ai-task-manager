// @story #2039 #2046
// A snapshot describes inputs; only retained bytes can verify its manifest identity.
import { validateEstimationForecast } from './forecast-record.mjs';
import { validateLocalEvidence } from './local-evidence.mjs';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { ceilEstimateHours } from './estimate-granularity.mjs';
export const FORECAST_V3_SCHEMA = 'aitm.estimation-forecast/v3';
const id = (v) => typeof v === 'string' && /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(v);
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const token = (v) =>
  typeof v === 'string' && v.length > 0 && v.length <= 512 && !/[\s\p{Cc}]/u.test(v);
const same = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
function fail(reason) {
  throw new TypeError('forecast-provenance:' + reason);
}
function exact(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  )
    fail('shape');
}
function reference(value, extra) {
  exact(value, ['recordId', 'payloadDigest', 'provenance', 'sourceCommentId', ...extra]);
  if (!id(value.recordId) || !hash(value.payloadDigest)) fail('reference');
  if (!['observed-cloud', 'imported-local', 'derived-local'].includes(value.provenance))
    fail('origin');
  if (
    value.provenance === 'observed-cloud'
      ? !token(value.sourceCommentId)
      : value.sourceCommentId !== null
  )
    fail('source-comment');
}
function retainedReference({ descriptor, record }) {
  return {
    recordId: record.recordId,
    payloadDigest: descriptor.payloadDigest,
    provenance: descriptor.provenance,
    sourceCommentId: descriptor.sourceCommentId,
  };
}
/** Optional raw evidence enables exact retained-byte correlation; this function never loads a store/network. */
export function validateForecastProvenance(value, { expectedIssue, repository, evidence } = {}) {
  if (value?.schema !== FORECAST_V3_SCHEMA) fail('schema');
  const { localEvidence: local, ...base } = value;
  // Keep the existing v2 strict keys, semantic checks and half-hour grid unchanged.
  validateEstimationForecast({ ...base, schema: 'aitm.estimation-forecast/v2' }, { expectedIssue });
  exact(local, [
    'schema',
    'manifestDigest',
    'canonicalizationVersion',
    'plan',
    'refine',
    'rubric',
    'outcomes',
    'modelPolicy',
  ]);
  if (
    local.schema !== 'aitm.forecast-local-evidence/v1' ||
    local.canonicalizationVersion !== 'aitm.canonical-json/v1' ||
    !hash(local.manifestDigest)
  )
    fail('manifest');
  exact(local.plan, ['path', 'section', 'commit', 'digest']);
  if (
    !token(local.plan.path) ||
    local.plan.path.startsWith('/') ||
    local.plan.path.includes('\\') ||
    local.plan.path.split('/').some((part) => !part || part === '.' || part === '..') ||
    typeof local.plan.section !== 'string' ||
    !local.plan.section.trim() ||
    /[\r\n\p{Cc}]/u.test(local.plan.section) ||
    !/^[a-f0-9]{40}$/.test(local.plan.commit) ||
    !hash(local.plan.digest)
  )
    fail('plan');
  exact(local.refine, ['size', 'humanHours', 'source']);
  exact(local.refine.source, ['kind', 'id', 'digest']);
  if (
    local.refine.size !== value.refine.size ||
    typeof local.refine.humanHours !== 'number' ||
    !Number.isFinite(local.refine.humanHours) ||
    local.refine.humanHours <= 0 ||
    ceilEstimateHours(local.refine.humanHours) !== value.refine.humanHours ||
    !token(local.refine.source.kind) ||
    !token(local.refine.source.id) ||
    !hash(local.refine.source.digest)
  )
    fail('refine');
  exact(local.modelPolicy, ['modelVersion', 'policyVersion']);
  if (!token(local.modelPolicy.modelVersion) || !token(local.modelPolicy.policyVersion))
    fail('model-policy');
  reference(local.rubric, ['version']);
  if (
    local.rubric.recordId !== value.rubric.recordId ||
    local.rubric.version !== value.rubric.version
  )
    fail('rubric-correlation');
  if (!Array.isArray(local.outcomes)) fail('outcomes');
  const ids = new Set([local.rubric.recordId]),
    issues = new Set();
  for (const outcome of local.outcomes) {
    reference(outcome, ['issue']);
    if (
      !Number.isSafeInteger(outcome.issue) ||
      outcome.issue <= 0 ||
      ids.has(outcome.recordId) ||
      issues.has(outcome.issue)
    )
      fail('duplicate-or-invalid-outcome');
    ids.add(outcome.recordId);
    issues.add(outcome.issue);
  }
  const pairs = (items) =>
    items
      .map((item) => [item.issue, item.recordId ?? item.outcomeRecordId])
      .sort((a, b) => a[0] - b[0]);
  if (!same(pairs(local.outcomes), pairs(value.comparableIssues))) fail('outcome-correlation');
  if (repository !== undefined && evidence === undefined) fail('repository-evidence-required');
  if (evidence !== undefined) {
    const retained = validateLocalEvidence(evidence),
      m = retained.manifest;
    if (
      m.issue !== value.issue ||
      (repository !== undefined && m.repository !== repository) ||
      retained.manifestDigest !== local.manifestDigest
    )
      fail('retained-identity');
    for (const key of ['plan', 'refine', 'modelPolicy'])
      if (!same(local[key], m[key])) fail('retained-' + key);
    if (
      !retained.activeRubric ||
      !same(local.rubric, {
        ...retainedReference(retained.activeRubric),
        version: retained.activeRubric.record.payload.version,
      })
    )
      fail('retained-rubric');
    const rubricPayload = retained.activeRubric.record.payload;
    if (
      value.rubric.confidence !== rubricPayload.ai.confidence ||
      value.rubric.cohortSize !== rubricPayload.cohort.length
    )
      fail('retained-rubric-metadata');
    const selected = new Map(retained.activeOutcomes.map((item) => [item.record.recordId, item]));
    for (const outcome of local.outcomes) {
      const item = selected.get(outcome.recordId);
      if (!item || !same(outcome, { issue: item.record.issue, ...retainedReference(item) }))
        fail('retained-outcome');
    }
  }
  return value;
}
