// @story #2039 #2062
// Calculation is pure: no client, command runner, store or lazy cloud loader.
import { createHash } from 'node:crypto';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { validateLocalEvidence, importLocalEvidence } from './local-evidence.mjs';
import { parsePlanEstimationInput } from './plan-input.mjs';
import { buildEstimationForecast } from './forecast-model.mjs';
import { validateEstimationForecast } from './forecast-record.mjs';
import { ceilEstimateHours } from './estimate-granularity.mjs';
const persistedEvidence = new WeakMap();

export const LOCAL_ESTIMATION_MODEL = Object.freeze({
  modelVersion: 'aitm.forecast-model/v2',
  policyVersion: 'aitm.local-estimation/v1',
  supportsEmptyComparables: true,
  calculate: buildEstimationForecast,
});
const same = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
const hash = (value) => createHash('sha256').update(canonicalRecordJson(value)).digest('hex');
function fail(reason) {
  throw Object.assign(new Error(reason), { reason });
}
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const detached = (value) => freeze(JSON.parse(canonicalRecordJson(value)));
/** JavaScript can throw any value; diagnostics must never throw or change result shape. */
export function localFailureReason(error, fallback) {
  for (const key of ['reason', 'message']) {
    try {
      const value = error?.[key];
      if (typeof value === 'string' && value.trim()) return value;
    } catch {
      // An exception-valued getter is not a diagnostic string.
    }
  }
  return fallback;
}
export function localEstimationMode(mode) {
  if (mode?.mode === 'disabled') return { status: 'disabled', reason: 'rubric-disabled' };
  if (mode?.mode !== 'local')
    return {
      status: 'unavailable',
      reason:
        typeof mode?.reason === 'string' && mode.reason.trim() ? mode.reason : 'config-invalid',
    };
  return null;
}
/** Compare explicit current selection with exact retained bytes; no freshness inferred from dates. */
export function validateLocalSelection({ evidence, selection } = {}) {
  if (!evidence) fail('evidence-missing');
  const retained = validateLocalEvidence(evidence);
  const m = retained.manifest;
  if (!selection || typeof selection !== 'object' || Array.isArray(selection))
    fail('selection-missing');
  const fields = ['host', 'repository', 'issue', 'configuration', 'plan', 'refine', 'modelPolicy'];
  if (Object.keys(selection).sort().join(',') !== fields.sort().join(',')) fail('selection-shape');
  for (const field of fields) if (!same(selection[field], m[field])) fail('selection-' + field);
  if (m.configuration.estimationRubricIssue === 0) fail('evidence-rubric-disabled');
  return retained;
}
export function localCalculationProvenance(retained) {
  const { manifest: m, activeRubric, activeOutcomes } = retained;
  const reference = ({ descriptor, record }) => ({
    recordId: record.recordId,
    payloadDigest: descriptor.payloadDigest,
    provenance: descriptor.provenance,
    sourceCommentId: descriptor.sourceCommentId,
  });
  return detached({
    schema: 'aitm.forecast-local-evidence/v1',
    manifestDigest: retained.manifestDigest,
    canonicalizationVersion: m.canonicalizationVersion,
    plan: m.plan,
    refine: m.refine,
    modelPolicy: m.modelPolicy,
    rubric: { ...reference(activeRubric), version: activeRubric.record.payload.version },
    outcomes: activeOutcomes.map((item) => ({ issue: item.record.issue, ...reference(item) })),
  });
}
/** planInput = {selection:{host,repository,issue,configuration,plan,refine,modelPolicy},input}. */
export function calculateLocalEstimate(args = {}) {
  const stopped = localEstimationMode(args.mode);
  if (stopped) return stopped;
  try {
    const retained = validateLocalSelection({
      evidence: args.evidence,
      selection: args.planInput?.selection,
    });
    if (
      retained.records.some((item) => item.descriptor.provenance === 'derived-local') &&
      persistedEvidence.get(args.evidence) !== retained.manifestDigest
    )
      fail('derived-evidence-not-retained');
    for (const { descriptor, record } of retained.records)
      if (
        descriptor.provenance === 'derived-local' &&
        !same(record.modelPolicy, retained.manifest.modelPolicy)
      )
        fail('derived-model-policy');
    const input = parsePlanEstimationInput(args.planInput?.input);
    const model = args.model ?? LOCAL_ESTIMATION_MODEL;
    if (
      typeof model?.calculate !== 'function' ||
      !same(
        { modelVersion: model.modelVersion, policyVersion: model.policyVersion },
        retained.manifest.modelPolicy
      )
    )
      fail('model-policy');
    const available = new Map(retained.activeOutcomes.map((item) => [item.record.issue, item]));
    if (input.comparableIssueIds.some((issue) => !available.has(issue))) fail('comparable-missing');
    const outcomes = retained.activeOutcomes.filter(
      (item) =>
        !input.comparableIssueIds.length || input.comparableIssueIds.includes(item.record.issue)
    );
    if (outcomes.length === 0 && model.supportsEmptyComparables !== true)
      fail('empty-comparables-unsupported');
    const { record: rubric } = retained.activeRubric;
    const modelInput = detached({
      issue: retained.manifest.issue,
      refine: {
        size: retained.manifest.refine.size,
        humanHours: retained.manifest.refine.humanHours,
      },
      planInput: input,
      rubric: { recordId: rubric.recordId, payload: rubric.payload },
      comparableOutcomes: outcomes.map(({ record }) => ({
        recordId: record.recordId,
        createdAt: record.createdAt,
        payload: record.payload,
      })),
    });
    const candidate = model.calculate(modelInput);
    if (candidate && typeof candidate.then === 'function') {
      // Suppress an unhandled rejection without accepting asynchronous calculation.
      Promise.resolve(candidate).catch(() => {});
      fail('model-asynchronous');
    }
    const forecast = detached(candidate);
    validateEstimationForecast(forecast, {
      expectedIssue: retained.manifest.issue,
      requireCurrentSchema: true,
    });
    if (
      !same(forecast.refine, {
        size: retained.manifest.refine.size,
        humanHours: ceilEstimateHours(retained.manifest.refine.humanHours),
      }) ||
      !same(forecast.rubric, {
        recordId: rubric.recordId,
        version: rubric.payload.version,
        cohortSize: rubric.payload.cohort.length,
        confidence: rubric.payload.ai.confidence,
      }) ||
      forecast.supersedesForecastRecordId !== null
    )
      fail('model-correlation');
    const expected = outcomes
      .map(({ record }) => [record.issue, record.recordId])
      .sort((a, b) => a[0] - b[0]);
    const actual = forecast.comparableIssues
      .map((item) => [item.issue, item.outcomeRecordId])
      .sort((a, b) => a[0] - b[0]);
    if (!same(expected, actual)) fail('model-comparables');
    return detached({
      status: 'estimated',
      estimate: { size: forecast.plan.size, hours: forecast.plan.humanHours },
      forecast,
      inputDigest: hash({
        manifestDigest: retained.manifestDigest,
        planInput: input,
        modelPolicy: retained.manifest.modelPolicy,
      }),
      modelPolicy: retained.manifest.modelPolicy,
      localEvidence: localCalculationProvenance({ ...retained, activeOutcomes: outcomes }),
      limitations: outcomes.length === 0 ? ['no-retained-comparable-outcomes'] : [],
    });
  } catch (error) {
    return {
      status: 'unavailable',
      reason: localFailureReason(error, 'local-calculation-invalid'),
    };
  }
}

/** Local IO boundary, separate from pure calculation. A caller boolean is never a receipt. */
export async function retainLocalEstimateInputs({ evidenceStore, bundle } = {}) {
  try {
    const imported = await importLocalEvidence({ evidenceStore, bundle });
    const retained = evidenceStore.read(imported.manifestDigest);
    const evidence = {
      manifest: retained.manifest,
      planBytes: Buffer.from(retained.planBytes),
      payloads: new Map([...retained.payloads].map(([key, raw]) => [key, Buffer.from(raw)])),
    };
    const verified = validateLocalEvidence(evidence);
    if (verified.manifestDigest !== imported.manifestDigest) fail('retained-readback');
    persistedEvidence.set(evidence, verified.manifestDigest);
    return { status: 'retained', manifestDigest: verified.manifestDigest, evidence };
  } catch (error) {
    return {
      status: 'unavailable',
      reason: localFailureReason(error, 'local-retention-invalid'),
    };
  }
}
