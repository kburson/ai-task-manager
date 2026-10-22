// @story #1091 #2039 #2065
import { strict as assert } from 'node:assert';
import test, { after } from 'node:test';
import { rmSync, readFileSync } from 'node:fs';
import { fixture, observed, freshUnitDir } from '../decomposition-authority-fixtures.mjs';
import {
  formatIssueFieldDb,
  stripIssueFieldDb,
} from '../../../../../task-tracker/issue-field-db.mjs';
const fixtureDirs = [];
after(() => fixtureDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

import {
  adoptLegacyPlanForecast,
  applyPlanEstimateAuthority,
  executeAdaptivePlanEstimate,
  readForecastReadyRecordId,
  upsertForecastReadyMarker,
} from '../../../../../task-tracker/lib/estimation/plan-estimate-authority.mjs';
import { LEGACY_FORECAST_SCHEMA } from '../../../../../task-tracker/lib/estimation/forecast-record.mjs';
import { bundle, envelope } from '../../../../helpers/local-estimation-evidence-fixture.mjs';
import { validateLocalEvidence } from '../../../../../task-tracker/lib/estimation/local-evidence.mjs';
import { localCalculationProvenance } from '../../../../../task-tracker/lib/estimation/local-runtime.mjs';
import { hashRecordPayload } from '../../../../../task-tracker/lib/github-records/record-envelope.mjs';

const forecast = {
  schema: 'aitm.estimation-forecast/v3',
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
const evidence = bundle(
  [{ record: envelope({ recordId: forecast.rubric.recordId }), provenance: 'imported-local' }],
  {
    issue: 1091,
    refine: {
      ...forecast.refine,
      source: { kind: 'imported-local', id: 'refine-authority', digest: 'b'.repeat(64) },
    },
  }
);
forecast.localEvidence = structuredClone(
  localCalculationProvenance(validateLocalEvidence(evidence))
);
const {
  inputs: _inputs,
  schema: _schema,
  canonicalizationVersion: _canonical,
  ...selection
} = evidence.manifest;
const localForecast = {
  identity: { host: 'github.com', repository: 'owner/repo', issue: 1091 },
  evidenceStore: { read: () => validateLocalEvidence(evidence) },
  selection,
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
  const f = fixture(20),
    dir = freshUnitDir('plan-authority-existing-');
  fixtureDirs.push(dir);
  f.body = stripIssueFieldDb(f.body) + '\n' + formatIssueFieldDb(state.bodyFields) + '\n';
  const body = () => f.body;
  const decomposition = {
    ...f.deps,
    readIssue: async () => observed({ number: 1091, body: body() }),
    readBackIssue: async () => observed({ number: 1091, body: body() }),
    fetchBody: async () => body(),
    pushBody: async (_repo, _issue, next) => {
      f.body = next;
    },
    readProject: async () => observed({ ...f.values.project, ...state.board }),
    readForecast: async () => {
      const active = state.forecasts.filter((record) => record.supersededBy == null),
        record = active[0];
      const value = {
        estimate: record ? (record.payload?.plan.humanHours ?? state.board.estimate) : null,
        size: record ? (record.payload?.plan.size ?? state.board.size) : null,
        recordId: record?.recordId ?? null,
        payloadHash: record?.payloadHash ?? null,
        proposals: [],
        observedProjections: [{ ...state.board }, { ...state.bodyFields }],
      };
      if (record && state.readyForecastRecordId !== record.recordId) {
        value.publicationTransition = {
          recordId: record.recordId,
          payloadHash: record.payloadHash,
          readyRecordId: state.readyForecastRecordId,
        };
        return { ...observed(value), status: 'unavailable' };
      }
      return observed(value);
    },
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
      cfg: { repo: 'owner/repo', projectId: 'PVT_a' },
      localForecast,
      projectDir: dir,
      decomposition,
      projectItemForIssue: async () => ({ itemId: 'PVTI_a' }),
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
        f.body = stripIssueFieldDb(f.body) + '\n' + formatIssueFieldDb(state.bodyFields) + '\n';
        maybeFail();
      },
      writeForecast: async ({ envelope }) => {
        for (const prior of state.forecasts) {
          if (prior.recordId === envelope.supersedes) prior.supersededBy = envelope.recordId;
        }
        state.forecasts.push({
          recordId: envelope.recordId,
          payloadHash: envelope.payloadHash,
          payload: envelope.payload,
          commentNodeId: 'IC_forecast',
        });
        maybeFail();
      },
      writeForecastReadyMarker: async ({ recordId }) => {
        state.readyForecastRecordId = recordId;
        f.body = upsertForecastReadyMarker(f.body, recordId);
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

test('Plan authority rejects an off-grid forecast before its first write', async () => {
  const h = harness();
  const payload = structuredClone(forecast);
  payload.plan.humanHours = 40.25;
  payload.plan.deltaHours = 20.25;
  payload.wbs[0].humanHours = 40.25;
  const invalidEnvelope = {
    ...forecastEnvelope,
    payload,
    payloadHash: hashRecordPayload(payload),
  };

  await assert.rejects(
    applyPlanEstimateAuthority({
      issueNumber: 1091,
      refine: forecast.refine,
      forecastEnvelope: invalidEnvelope,
      deps: h.deps,
    }),
    /estimation-record:forecast-hours-grid/
  );
  assert.equal(h.writes(), 0);
});

test('Plan authority rejects a legacy v1 forecast before its first write', async () => {
  const h = harness();
  const payload = { ...forecast, schema: LEGACY_FORECAST_SCHEMA };
  const legacyEnvelope = {
    ...forecastEnvelope,
    payload,
    payloadHash: hashRecordPayload(payload),
  };

  await assert.rejects(
    applyPlanEstimateAuthority({
      issueNumber: 1091,
      refine: forecast.refine,
      forecastEnvelope: legacyEnvelope,
      deps: h.deps,
    }),
    /forecast-current:schema/
  );
  assert.equal(h.writes(), 0);
});

test('Plan authority publishes the normalized forecast Refine baseline', async () => {
  const h = harness();
  await applyPlanEstimateAuthority({
    issueNumber: 1091,
    refine: { size: 'L', humanHours: 20.25 },
    forecastEnvelope,
    deps: h.deps,
  });

  assert.deepEqual(h.state.refineAppendix.refine, forecast.refine);
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
    const partial = await applyPlanEstimateAuthority({
      issueNumber: 1091,
      refine: forecast.refine,
      forecastEnvelope,
      deps: h.deps,
    });
    assert.equal(partial.status, 'partial');
    assert.match(partial.reason, new RegExp(`injected-after-${failAfter}`));
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
  await h.deps.writeForecastReadyMarker({ recordId: priorRecordId });

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

test('local execution replays retained inputs, builds forecast, creates an envelope, and converges authority', async () => {
  const calls = [];
  const result = await executeAdaptivePlanEstimate({
    issueNumber: 1091,
    planInput: {
      ...JSON.parse(
        readFileSync(new URL('../../../../fixtures/estimation/plan-input.json', import.meta.url))
      ),
      comparableIssueIds: [],
    },
    cfg: { repo: 'owner/repo', estimationRubricIssue: 1001 },
    deps: {
      localForecast: {
        ...localForecast,
        manifestDigest: validateLocalEvidence(evidence).manifestDigest,
      },
      readRefineEstimate: async () => {
        throw new Error('cloud Refine loader reached');
      },
      loadRubric: async () => {
        throw new Error('cloud rubric loader reached');
      },
      listComparableOutcomes: async () => {
        throw new Error('cloud comparables loader reached');
      },
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
  const h = harness();
  h.state.lifecycleState = 'develop';
  h.state.refineAppendix = { refine: forecast.refine, plan: forecast.plan };
  h.state.board = { size: forecast.plan.size, estimate: forecast.plan.humanHours };
  await h.deps.writeBodyFields({ size: forecast.plan.size, estimate: forecast.plan.humanHours });
  const before = h.writes();
  const result = await adoptLegacyPlanForecast({
    issueNumber: 1091,
    forecastEnvelope,
    deps: h.deps,
  });
  assert.equal(result.status, 'converged');
  assert.equal(result.forecastCommentNodeId, 'IC_forecast');
  assert.equal(h.state.readyForecastRecordId, forecastEnvelope.recordId);
  assert.equal(
    h.writes() - before,
    2,
    'adoption writes only forecast and ready; existing estimate is not revised'
  );
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
        deps: { localForecast, readProjection: async () => structuredClone(state) },
      }),
      /plan-estimate-authority:legacy-adoption/
    );
  }
});

test('current authority publishes the validated snapshot despite caller mutation during projection read', async () => {
  const h = harness();
  const supplied = structuredClone(forecastEnvelope);
  const readProjection = h.deps.readProjection;
  let first = true;
  h.deps.readProjection = async () => {
    if (first) {
      first = false;
      supplied.payload.plan.humanHours = 999;
    }
    return readProjection();
  };
  const result = await applyPlanEstimateAuthority({
    issueNumber: 1091,
    refine: forecast.refine,
    forecastEnvelope: supplied,
    deps: h.deps,
  });
  assert.equal(result.status, 'converged');
  assert.equal(h.state.forecasts[0].payload.plan.humanHours, 40);
  assert.equal(h.state.board.estimate, 40);
});
