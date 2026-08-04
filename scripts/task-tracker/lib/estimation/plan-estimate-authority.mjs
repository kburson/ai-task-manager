import { runLogicalRecordClaim } from './record-claim.mjs';
import { validateEstimationForecast } from './forecast-record.mjs';

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
  for (const name of [
    'readRefineEstimate',
    'loadRubric',
    'listComparableOutcomes',
    'buildForecast',
    'createForecastEnvelope',
    'applyAuthority',
  ]) {
    if (typeof deps[name] !== 'function') fail('dependencies');
  }
  const refine = await deps.readRefineEstimate({ issueNumber, cfg });
  const rubric = await deps.loadRubric({ issueNumber, cfg });
  const comparableOutcomes = await deps.listComparableOutcomes({
    issueNumber,
    planInput,
    cfg,
  });
  const forecast = deps.buildForecast({
    issue: issueNumber,
    refine,
    planInput,
    rubric,
    comparableOutcomes,
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

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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

async function writeAndConfirm({ deps, writer, input, confirms, category }) {
  if (typeof deps[writer] !== 'function') fail('dependencies');
  await deps[writer](input);
  const state = await read(deps);
  if (!confirms(state)) fail(`${category}-readback`);
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
  validateEstimationForecast(forecastEnvelope.payload, {
    expectedIssue: issueNumber,
    requireCurrentSchema: true,
  });
  const plan = forecastEnvelope.payload.plan;
  const publishedRefine = forecastEnvelope.payload.refine;
  let state = await read(deps);
  if (state.lifecycleState !== 'plan') fail('not-in-plan');
  if (state.frozenForecastRecordId && state.frozenForecastRecordId !== forecastEnvelope.recordId) {
    fail('frozen');
  }
  desiredForecast(state, forecastEnvelope);

  const appendix = appendixProjection({ refine: publishedRefine, plan });
  if (!equal(appendixProjection(state.refineAppendix), appendix)) {
    state = await writeAndConfirm({
      deps,
      writer: 'writeRefineAppendix',
      input: { issueNumber, refine: publishedRefine, plan },
      confirms: (next) => equal(appendixProjection(next.refineAppendix), appendix),
      category: 'refine-appendix',
    });
  }
  if (state.board?.estimate !== plan.humanHours) {
    state = await writeAndConfirm({
      deps,
      writer: 'writeBoardEstimate',
      input: { issueNumber, estimate: plan.humanHours },
      confirms: (next) => next.board?.estimate === plan.humanHours,
      category: 'board-estimate',
    });
  }
  if (state.board?.size !== plan.size) {
    state = await writeAndConfirm({
      deps,
      writer: 'writeBoardSize',
      input: { issueNumber, size: plan.size },
      confirms: (next) => next.board?.size === plan.size,
      category: 'board-size',
    });
  }
  if (state.bodyFields?.estimate !== plan.humanHours || state.bodyFields?.size !== plan.size) {
    state = await writeAndConfirm({
      deps,
      writer: 'writeBodyFields',
      input: { issueNumber, estimate: plan.humanHours, size: plan.size },
      confirms: (next) =>
        next.bodyFields?.estimate === plan.humanHours && next.bodyFields?.size === plan.size,
      category: 'body-fields',
    });
  }
  let stored = desiredForecast(state, forecastEnvelope);
  if (!stored) {
    state = await writeAndConfirm({
      deps,
      writer: 'writeForecast',
      input: { issueNumber, envelope: forecastEnvelope },
      confirms: (next) => desiredForecast(next, forecastEnvelope) !== null,
      category: 'forecast',
    });
    stored = desiredForecast(state, forecastEnvelope);
  }
  if (state.readyForecastRecordId !== stored.recordId) {
    state = await writeAndConfirm({
      deps,
      writer: 'writeForecastReadyMarker',
      input: { issueNumber, recordId: stored.recordId },
      confirms: (next) => next.readyForecastRecordId === stored.recordId,
      category: 'forecast-ready',
    });
  }
  if (
    state.board?.estimate !== state.bodyFields?.estimate ||
    state.board?.size !== state.bodyFields?.size
  ) {
    fail('projection-divergence');
  }
  return {
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
  return runLogicalRecordClaim(
    deps,
    {
      key: `forecast:${issueNumber}:${forecastEnvelope?.payloadHash ?? forecastEnvelope?.recordId ?? 'invalid'}`,
      issue: issueNumber,
    },
    () => applyPlanEstimateAuthorityUnlocked({ issueNumber, refine, forecastEnvelope, deps })
  );
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
  validateEstimationForecast(forecastEnvelope.payload, {
    expectedIssue: issueNumber,
    requireCurrentSchema: true,
  });
  const plan = forecastEnvelope.payload.plan;
  let state = await read(deps);
  const appendix = appendixProjection(state.refineAppendix);
  const active = state.forecasts.filter((forecast) => forecast.supersededBy == null);
  if (
    state.lifecycleState !== 'develop' ||
    state.readyForecastRecordId !== null ||
    active.length !== 0 ||
    appendix?.plan?.size !== plan.size ||
    appendix?.plan?.humanHours !== plan.humanHours ||
    state.board?.size !== plan.size ||
    state.board?.estimate !== plan.humanHours ||
    state.bodyFields?.size !== plan.size ||
    state.bodyFields?.estimate !== plan.humanHours
  ) {
    fail('legacy-adoption-projection');
  }
  state = await writeAndConfirm({
    deps,
    writer: 'writeForecast',
    input: { issueNumber, envelope: forecastEnvelope },
    confirms: (next) => desiredForecast(next, forecastEnvelope) !== null,
    category: 'legacy-adoption-forecast',
  });
  const stored = desiredForecast(state, forecastEnvelope);
  await writeAndConfirm({
    deps,
    writer: 'writeForecastReadyMarker',
    input: { issueNumber, recordId: stored.recordId },
    confirms: (next) => next.readyForecastRecordId === stored.recordId,
    category: 'legacy-adoption-ready',
  });
  return {
    status: 'converged',
    forecastRecordId: stored.recordId,
    forecastCommentNodeId: stored.commentNodeId,
  };
}

export async function adoptLegacyPlanForecast({ issueNumber, forecastEnvelope, deps = {} } = {}) {
  return runLogicalRecordClaim(
    deps,
    {
      key: `forecast:${issueNumber}:${forecastEnvelope?.payloadHash ?? forecastEnvelope?.recordId ?? 'invalid'}`,
      issue: issueNumber,
    },
    () => adoptLegacyPlanForecastUnlocked({ issueNumber, forecastEnvelope, deps })
  );
}
