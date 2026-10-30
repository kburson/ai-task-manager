// @story #2039 #2065
import {
  publishAdaptivePlanAuthority,
  hasPendingAdaptivePublication,
} from '../decomposition-adaptive-writer.mjs';
import { requireCurrentSchema } from './forecast-legacy.mjs';
import { readLocalForecastEvidence } from './forecast-reader.mjs';
import { parsePlanEstimationInput } from './plan-input.mjs';
import { validateLocalSelection, localCalculationProvenance } from './local-runtime.mjs';
export { readForecastVersioned, requireCurrentSchema } from './forecast-legacy.mjs';

function fail(category) {
  throw new Error(`plan-estimate-authority:${category}`);
}

const READY_MARKER_RE =
  /<!--\s*aitm-estimation-forecast-ready\s+record-id="([0-7][0-9A-HJKMNP-TV-Z]{25})"\s*-->/i;

export function readForecastReadyRecordId(body = '') {
  return String(body).match(READY_MARKER_RE)?.[1] ?? null;
}

export function upsertForecastReadyMarker(body = '', recordId) {
  if (typeof recordId !== 'string' || !/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(recordId)) {
    fail('ready-record-id');
  }
  const marker = `<!-- aitm-estimation-forecast-ready record-id="${recordId}" -->`;
  const source = String(body);
  if (READY_MARKER_RE.test(source)) return source.replace(READY_MARKER_RE, marker);
  const fields = source.search(/<!--\s*aitm-fields:/i);
  if (fields >= 0)
    return `${source.slice(0, fields).replace(/\s+$/, '')}\n\n${marker}\n\n${source.slice(fields)}`;
  return `${source.replace(/\s+$/, '')}\n\n${marker}\n`;
}

export async function executeAdaptivePlanEstimate({ issueNumber, planInput, cfg, deps = {} } = {}) {
  for (const name of ['buildForecast', 'createForecastEnvelope', 'applyAuthority']) {
    if (typeof deps[name] !== 'function') fail('dependencies');
  }
  if (!deps.localForecast) fail('local-context-required');
  const retained = readLocalForecastEvidence(deps.localForecast);
  const { manifest, planBytes, payloads } = retained;
  const evidence = { manifest, planBytes, payloads };
  validateLocalSelection({ evidence, selection: deps.localForecast.selection });
  if (manifest.issue !== issueNumber || manifest.repository !== cfg.repo) fail('local-identity');
  const refine = { size: manifest.refine.size, humanHours: manifest.refine.humanHours };
  const rubric = {
    recordId: retained.activeRubric.record.recordId,
    payload: retained.activeRubric.record.payload,
  };
  const input = parsePlanEstimationInput(planInput);
  const available = new Set(retained.activeOutcomes.map(({ record }) => record.issue));
  if (input.comparableIssueIds.some((issue) => !available.has(issue)))
    fail('local-comparable-missing');
  const selectedOutcomes = retained.activeOutcomes.filter(
    ({ record }) =>
      !input.comparableIssueIds.length || input.comparableIssueIds.includes(record.issue)
  );
  const comparableOutcomes = selectedOutcomes.map(({ record }) => ({
    recordId: record.recordId,
    createdAt: record.createdAt,
    payload: record.payload,
  }));
  const forecast = deps.buildForecast({
    issue: issueNumber,
    refine,
    planInput: input,
    rubric,
    comparableOutcomes,
    localEvidence: localCalculationProvenance({ ...retained, activeOutcomes: selectedOutcomes }),
    evidence,
    repository: manifest.repository,
  });
  const forecastEnvelope = deps.createForecastEnvelope({
    repository: cfg.repo,
    issue: issueNumber,
    payload: forecast,
  });
  return deps.applyAuthority({
    issueNumber,
    refine,
    forecastEnvelope,
    cfg,
  });
}

function appendixProjection(value) {
  if (!value?.refine || !value?.plan) return null;
  return {
    refine: { size: value.refine.size, humanHours: value.refine.humanHours },
    plan: { size: value.plan.size, humanHours: value.plan.humanHours },
  };
}

function desiredForecast(state, envelope) {
  const active = state.forecasts.filter((item) => item.supersededBy == null);
  const matches = active.filter((item) => item.payloadHash === envelope.payloadHash);
  const conflicts = active.filter(
    (item) => item.payloadHash !== envelope.payloadHash && item.recordId !== envelope.supersedes
  );
  if (conflicts.length > 0) fail('conflicting-forecast');
  if (matches.length > 1) fail('duplicate-forecast');
  return matches[0] ?? null;
}

async function read(deps) {
  if (typeof deps.readProjection !== 'function') fail('dependencies');
  const state = await deps.readProjection();
  if (!state || typeof state !== 'object') fail('readback');
  return state;
}

async function applyPlanEstimateAuthorityUnlocked({
  issueNumber,
  refine,
  forecastEnvelope,
  deps = {},
} = {}) {
  if (
    !Number.isInteger(issueNumber) ||
    issueNumber <= 0 ||
    !refine ||
    forecastEnvelope?.recordType !== 'estimation-forecast' ||
    forecastEnvelope.payload?.issue !== issueNumber
  ) {
    fail('input');
  }
  forecastEnvelope = {
    ...forecastEnvelope,
    payload: requireCurrentSchema(forecastEnvelope.payload, {
      ...deps.localForecast,
      expectedIssue: issueNumber,
      repository: deps.cfg?.repo,
    }),
  };
  const state = await read(deps);
  if (state.lifecycleState !== 'plan') fail('not-in-plan');
  if (state.frozenForecastRecordId && state.frozenForecastRecordId !== forecastEnvelope.recordId) {
    fail('frozen');
  }
  desiredForecast(state, forecastEnvelope);

  const result = await publishAdaptivePlanAuthority({ issueNumber, forecastEnvelope, deps });
  if (result.status !== 'recorded') return result;
  const stored = desiredForecast(await read(deps), forecastEnvelope);
  return {
    ...result,
    status: 'converged',
    forecastRecordId: stored.recordId,
    forecastCommentNodeId: stored.commentNodeId,
  };
}

export async function applyPlanEstimateAuthority({
  issueNumber,
  refine,
  forecastEnvelope,
  deps = {},
} = {}) {
  return applyPlanEstimateAuthorityUnlocked({ issueNumber, refine, forecastEnvelope, deps });
}

async function adoptLegacyPlanForecastUnlocked({ issueNumber, forecastEnvelope, deps }) {
  if (
    !Number.isInteger(issueNumber) ||
    issueNumber <= 0 ||
    forecastEnvelope?.recordType !== 'estimation-forecast' ||
    forecastEnvelope.payload?.issue !== issueNumber
  ) {
    fail('legacy-adoption-input');
  }
  forecastEnvelope = {
    ...forecastEnvelope,
    payload: requireCurrentSchema(forecastEnvelope.payload, {
      ...deps.localForecast,
      expectedIssue: issueNumber,
      repository: deps.cfg?.repo,
    }),
  };
  const plan = forecastEnvelope.payload.plan;
  const state = await read(deps);
  const appendix = appendixProjection(state.refineAppendix);
  const active = state.forecasts.filter((forecast) => forecast.supersededBy == null);
  const resuming = Boolean(
    deps.cfg &&
    (active.length || state.readyForecastRecordId) &&
    (await hasPendingAdaptivePublication({ issueNumber, forecastEnvelope, deps }))
  );
  if (
    state.lifecycleState !== 'develop' ||
    (state.readyForecastRecordId !== null &&
      !(resuming && state.readyForecastRecordId === forecastEnvelope.recordId)) ||
    (active.length !== 0 &&
      !(
        resuming &&
        active.length === 1 &&
        active[0].recordId === forecastEnvelope.recordId &&
        active[0].payloadHash === forecastEnvelope.payloadHash
      )) ||
    appendix?.plan?.size !== plan.size ||
    appendix?.plan?.humanHours !== plan.humanHours ||
    state.board?.size !== plan.size ||
    state.board?.estimate !== plan.humanHours ||
    state.bodyFields?.size !== plan.size ||
    state.bodyFields?.estimate !== plan.humanHours
  ) {
    fail('legacy-adoption-projection');
  }
  const result = await publishAdaptivePlanAuthority({ issueNumber, forecastEnvelope, deps });
  if (result.status !== 'recorded') return result;
  const stored = desiredForecast(await read(deps), forecastEnvelope);
  return {
    ...result,
    status: 'converged',
    forecastRecordId: stored.recordId,
    forecastCommentNodeId: stored.commentNodeId,
  };
}

export async function adoptLegacyPlanForecast({ issueNumber, forecastEnvelope, deps = {} } = {}) {
  return adoptLegacyPlanForecastUnlocked({ issueNumber, forecastEnvelope, deps });
}
