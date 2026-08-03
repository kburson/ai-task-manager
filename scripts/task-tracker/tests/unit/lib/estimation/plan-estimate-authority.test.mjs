// @story #1091
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  adoptLegacyPlanForecast,
  applyPlanEstimateAuthority,
  executeAdaptivePlanEstimate,
  readForecastReadyRecordId,
  upsertForecastReadyMarker,
} from '../../../../lib/estimation/plan-estimate-authority.mjs';
import { hashRecordPayload } from '../../../../lib/github-records/record-envelope.mjs';

const forecast = {
  schema: 'aitm.estimation-forecast/v1',
  issue: 1091,
  lifecycleState: 'plan',
  refine: { size: 'L', humanHours: 20 },
  plan: { size: 'XL', humanHours: 40, deltaHours: 20, rationale: 'Detailed WBS.' },
  ai: {
    p50EngagedHours: 20,
    p80EngagedHours: 30,
    stages: { plan: 2, develop: 13, test: 3, review: 2 },
  },
  wbs: [
    {
      id: 'all',
      description: 'Implement the complete estimation system',
      humanHours: 40,
      signals: ['estimation'],
    },
  ],
  comparableIssues: [],
  rubric: { recordId: '01J00000000000000000000600', version: 1, cohortSize: 0, confidence: 0.1 },
  testPlan: { impactedLanes: ['unit'], isolation: 'test-sandbox', expectedMinutes: 5 },
  risks: [],
  recommendation: { action: 'proceed', reason: 'Reviewable.' },
  supersedesForecastRecordId: null,
};
const forecastEnvelope = {
  recordId: '01J00000000000000000000601',
  recordType: 'estimation-forecast',
  payloadHash: hashRecordPayload(forecast),
  payload: forecast,
};

test('forecast-ready marker is canonical, replaceable during Plan, and readable by the exit gate', () => {
  const first = upsertForecastReadyMarker('body\n', forecastEnvelope.recordId);
  assert.equal(readForecastReadyRecordId(first), forecastEnvelope.recordId);
  const replacement = '01J00000000000000000000602';
  const second = upsertForecastReadyMarker(first, replacement);
  assert.equal(readForecastReadyRecordId(second), replacement);
  assert.equal((second.match(/aitm-estimation-forecast-ready/g) ?? []).length, 1);
});

function harness({ failAfter } = {}) {
  const state = {
    lifecycleState: 'plan',
    refineAppendix: null,
    board: { size: 'L', estimate: 20 },
    bodyFields: { size: 'L', estimate: 20 },
    forecasts: [],
    readyForecastRecordId: null,
    frozenForecastRecordId: null,
  };
  let writes = 0;
  const maybeFail = () => {
    writes += 1;
    if (writes === failAfter) throw new Error(`injected-after-${writes}`);
  };
  return {
    state,
    writes: () => writes,
    deps: {
      readProjection: async () => structuredClone(state),
      writeRefineAppendix: async ({ refine, plan }) => {
        state.refineAppendix = { refine, plan };
        maybeFail();
      },
      writeBoardEstimate: async ({ estimate }) => {
        state.board.estimate = estimate;
        maybeFail();
      },
      writeBoardSize: async ({ size }) => {
        state.board.size = size;
        maybeFail();
      },
      writeBodyFields: async ({ size, estimate }) => {
        state.bodyFields = { size, estimate };
        maybeFail();
      },
      writeForecast: async ({ envelope }) => {
        for (const prior of state.forecasts) {
          if (prior.recordId === envelope.supersedes) prior.supersededBy = envelope.recordId;
        }
        state.forecasts.push({
          recordId: envelope.recordId,
          payloadHash: envelope.payloadHash,
          commentNodeId: 'IC_forecast',
        });
        maybeFail();
      },
      writeForecastReadyMarker: async ({ recordId }) => {
        state.readyForecastRecordId = recordId;
        maybeFail();
      },
    },
  };
}

test('Plan authority converges Refine history, board Estimate/Size, body fields, and forecast read-back', async () => {
  const h = harness();
  const result = await applyPlanEstimateAuthority({
    issueNumber: 1091,
    refine: forecast.refine,
    forecastEnvelope,
    deps: h.deps,
  });
  assert.equal(result.status, 'converged');
  assert.deepEqual(h.state.refineAppendix, { refine: forecast.refine, plan: forecast.plan });
  assert.deepEqual(h.state.board, { size: 'XL', estimate: 40 });
  assert.deepEqual(h.state.bodyFields, { size: 'XL', estimate: 40 });
  assert.equal(h.state.forecasts.length, 1);
  assert.equal(h.state.readyForecastRecordId, forecastEnvelope.recordId);
  assert.equal(result.forecastCommentNodeId, 'IC_forecast');
});

test('concurrent Plan convergence claims the forecast generation and appends it once', async () => {
  const h = harness();
  let forecastWrites = 0;
  const writeForecast = h.deps.writeForecast;
  h.deps.writeForecast = async (input) => {
    forecastWrites += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return writeForecast(input);
  };

  const results = await Promise.all(
    [1, 2].map(() =>
      applyPlanEstimateAuthority({
        issueNumber: 1091,
        refine: forecast.refine,
        forecastEnvelope,
        deps: h.deps,
      })
    )
  );

  assert.equal(forecastWrites, 1);
  assert.equal(h.state.forecasts.length, 1);
  assert.equal(results[0].forecastRecordId, results[1].forecastRecordId);
});

test('every interrupted seam replays convergently without duplicating the forecast', async () => {
  for (let failAfter = 1; failAfter <= 6; failAfter += 1) {
    const h = harness({ failAfter });
    await assert.rejects(
      applyPlanEstimateAuthority({
        issueNumber: 1091,
        refine: forecast.refine,
        forecastEnvelope,
        deps: h.deps,
      }),
      new RegExp(`injected-after-${failAfter}`)
    );
    const result = await applyPlanEstimateAuthority({
      issueNumber: 1091,
      refine: forecast.refine,
      forecastEnvelope,
      deps: h.deps,
    });
    assert.equal(result.status, 'converged');
    assert.deepEqual(h.state.board, { size: 'XL', estimate: 40 });
    assert.deepEqual(h.state.bodyFields, { size: 'XL', estimate: 40 });
    assert.equal(h.state.forecasts.length, 1, `seam ${failAfter} duplicated forecast`);
    assert.equal(h.state.readyForecastRecordId, forecastEnvelope.recordId);
  }
});

test('already-converged replay performs no writes', async () => {
  const h = harness();
  await applyPlanEstimateAuthority({
    issueNumber: 1091,
    refine: forecast.refine,
    forecastEnvelope,
    deps: h.deps,
  });
  const before = h.writes();
  const result = await applyPlanEstimateAuthority({
    issueNumber: 1091,
    refine: forecast.refine,
    forecastEnvelope,
    deps: h.deps,
  });
  assert.equal(result.status, 'converged');
  assert.equal(h.writes(), before);
});

test('Develop or frozen forecasts reject supersession outside audited demote/replan', async () => {
  const h = harness();
  h.state.lifecycleState = 'develop';
  await assert.rejects(
    applyPlanEstimateAuthority({
      issueNumber: 1091,
      refine: forecast.refine,
      forecastEnvelope,
      deps: h.deps,
    }),
    /plan-estimate-authority:not-in-plan/
  );
  h.state.lifecycleState = 'plan';
  h.state.frozenForecastRecordId = '01J00000000000000000000699';
  await assert.rejects(
    applyPlanEstimateAuthority({
      issueNumber: 1091,
      refine: forecast.refine,
      forecastEnvelope,
      deps: h.deps,
    }),
    /plan-estimate-authority:frozen/
  );
});

test('conflicting non-superseded forecasts fail closed', async () => {
  const h = harness();
  h.state.forecasts.push({
    recordId: '01J00000000000000000000698',
    payloadHash: 'sha256:' + 'a'.repeat(64),
    commentNodeId: 'IC_conflict',
  });
  await assert.rejects(
    applyPlanEstimateAuthority({
      issueNumber: 1091,
      refine: forecast.refine,
      forecastEnvelope,
      deps: h.deps,
    }),
    /plan-estimate-authority:conflicting-forecast/
  );
});

test('audited Plan re-entry may supersede exactly one prior active forecast', async () => {
  const h = harness();
  const priorRecordId = '01J00000000000000000000697';
  h.state.forecasts.push({
    recordId: priorRecordId,
    payloadHash: 'sha256:' + 'b'.repeat(64),
    commentNodeId: 'IC_prior',
    supersededBy: null,
  });
  const replacement = { ...forecastEnvelope, supersedes: priorRecordId };

  const result = await applyPlanEstimateAuthority({
    issueNumber: 1091,
    refine: forecast.refine,
    forecastEnvelope: replacement,
    deps: h.deps,
  });

  assert.equal(result.status, 'converged');
  assert.equal(h.state.forecasts[0].supersededBy, forecastEnvelope.recordId);
  assert.equal(h.state.readyForecastRecordId, forecastEnvelope.recordId);
});

test('adaptive execution refreshes rubric, builds forecast, creates an envelope, and converges authority', async () => {
  const calls = [];
  const result = await executeAdaptivePlanEstimate({
    issueNumber: 1091,
    planInput: { schema: 'aitm.plan-estimation-input/v1' },
    cfg: { repo: 'o/r', estimationRubricIssue: 1091 },
    deps: {
      readRefineEstimate: async () => ({ size: 'L', humanHours: 20 }),
      loadRubric: async () => ({ recordId: forecast.rubric.recordId, payload: { version: 1 } }),
      listComparableOutcomes: async () => [],
      buildForecast: (input) => {
        calls.push(['build', input]);
        return forecast;
      },
      createForecastEnvelope: (input) => {
        calls.push(['envelope', input]);
        return forecastEnvelope;
      },
      applyAuthority: async (input) => {
        calls.push(['authority', input]);
        return { status: 'converged', forecastRecordId: forecastEnvelope.recordId };
      },
    },
  });
  assert.equal(result.forecastRecordId, forecastEnvelope.recordId);
  assert.deepEqual(
    calls.map(([name]) => name),
    ['build', 'envelope', 'authority']
  );
});

test('legacy baseline adoption freezes only an exact matching Develop projection', async () => {
  const state = {
    lifecycleState: 'develop',
    refineAppendix: {
      refine: forecast.refine,
      plan: { size: forecast.plan.size, humanHours: forecast.plan.humanHours },
    },
    board: { size: forecast.plan.size, estimate: forecast.plan.humanHours },
    bodyFields: { size: forecast.plan.size, estimate: forecast.plan.humanHours },
    forecasts: [],
    readyForecastRecordId: null,
  };
  const result = await adoptLegacyPlanForecast({
    issueNumber: 1091,
    forecastEnvelope,
    deps: {
      readProjection: async () => structuredClone(state),
      writeForecast: async ({ envelope }) => {
        state.forecasts.push({
          recordId: envelope.recordId,
          payloadHash: envelope.payloadHash,
          commentNodeId: 'IC_adopted',
          supersededBy: null,
        });
      },
      writeForecastReadyMarker: async ({ recordId }) => {
        state.readyForecastRecordId = recordId;
      },
    },
  });
  assert.equal(result.status, 'converged');
  assert.equal(result.forecastCommentNodeId, 'IC_adopted');
  assert.equal(state.readyForecastRecordId, forecastEnvelope.recordId);
});

test('legacy baseline adoption refuses mismatches, existing evidence, or non-Develop state', async () => {
  const base = {
    lifecycleState: 'develop',
    refineAppendix: {
      refine: forecast.refine,
      plan: { size: forecast.plan.size, humanHours: forecast.plan.humanHours },
    },
    board: { size: forecast.plan.size, estimate: forecast.plan.humanHours },
    bodyFields: { size: forecast.plan.size, estimate: forecast.plan.humanHours },
    forecasts: [],
    readyForecastRecordId: null,
  };
  for (const state of [
    { ...base, lifecycleState: 'plan' },
    { ...base, board: { ...base.board, estimate: 39 } },
    { ...base, forecasts: [{ recordId: '01J00000000000000000000696', supersededBy: null }] },
    { ...base, readyForecastRecordId: '01J00000000000000000000695' },
  ]) {
    await assert.rejects(
      adoptLegacyPlanForecast({
        issueNumber: 1091,
        forecastEnvelope,
        deps: { readProjection: async () => structuredClone(state) },
      }),
      /plan-estimate-authority:legacy-adoption/
    );
  }
});
