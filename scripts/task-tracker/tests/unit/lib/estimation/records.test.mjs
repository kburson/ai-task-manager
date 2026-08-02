// @story #1091
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  FORECAST_RECORD_TYPE,
  validateEstimationForecast,
} from '../../../../lib/estimation/forecast-record.mjs';
import {
  OUTCOME_RECORD_TYPE,
  validateEstimationOutcome,
} from '../../../../lib/estimation/outcome-record.mjs';
import {
  RUBRIC_RECORD_TYPE,
  validateEstimationRubric,
} from '../../../../lib/estimation/rubric-record.mjs';
import {
  renderEstimationForecast,
  renderEstimationOutcome,
  renderEstimationRubric,
  writeEstimationRecord,
} from '../../../../lib/estimation/renderers.mjs';
import {
  hashRecordPayload,
  parseAitmRecord,
  renderAitmRecord,
} from '../../../../lib/github-records/record-envelope.mjs';

const ids = {
  forecast: '01J00000000000000000000100',
  outcome: '01J00000000000000000000101',
  rubric: '01J00000000000000000000102',
  grant: '01J00000000000000000000103',
};

const forecast = {
  schema: 'aitm.estimation-forecast/v1',
  issue: 1091,
  lifecycleState: 'plan',
  refine: { size: 'XL', humanHours: 40 },
  plan: { size: 'XL', humanHours: 40, deltaHours: 0, rationale: 'Detailed WBS converged.' },
  ai: {
    p50EngagedHours: 22,
    p80EngagedHours: 31,
    stages: { plan: 2, develop: 15, test: 3, review: 2 },
  },
  wbs: [
    {
      id: 'records',
      description: 'Add versioned estimation records',
      humanHours: 8,
      signals: ['github-records'],
    },
    {
      id: 'learning',
      description: 'Add rubric learning',
      humanHours: 32,
      signals: ['timing', 'reports'],
    },
  ],
  comparableIssues: [{ issue: 1068, outcomeRecordId: '01J00000000000000000000110', weight: 0.4 }],
  rubric: { recordId: ids.rubric, version: 1, cohortSize: 0, confidence: 0.2 },
  testPlan: {
    impactedLanes: ['unit', 'integration'],
    isolation: 'test-sandbox',
    expectedMinutes: 8,
  },
  risks: ['Partial multi-surface writes'],
  recommendation: { action: 'proceed', reason: 'WBS items are independently reviewable.' },
  supersedesForecastRecordId: null,
};

const outcome = {
  schema: 'aitm.estimation-outcome/v1',
  issue: 1091,
  forecastRecordId: ids.forecast,
  humanPlanHours: 40,
  aiForecast: { p50EngagedHours: 22, p80EngagedHours: 31 },
  actual: {
    engagedHours: 23,
    stages: { plan: 2, develop: 16, test: 3, review: 2 },
    reviewFixCycles: 1,
    commands: [{ classification: 'test-unit', durationMs: 1000, attempts: 1 }],
  },
  landscape: { filesChanged: 18, modules: ['estimation'], lanes: ['unit'], dependencyBreadth: 3 },
  variance: { vsAiP50Hours: 1, vsAiP80Hours: -8 },
  costClassification: {
    necessaryHours: 22,
    avoidableProcessWasteHours: 0.5,
    unclassifiedHours: 0.5,
    drivers: [{ kind: 'redundant-verification', hours: 0.5 }],
  },
};

const rubric = {
  schema: 'aitm.estimation-rubric/v1',
  version: 1,
  predecessorRecordId: null,
  generatedAt: '2026-08-02T13:00:00.000Z',
  cohort: [{ issue: 1091, outcomeRecordId: ids.outcome }],
  human: { coefficients: { wbsHour: 1 }, sampleSize: 1, confidence: 0.2 },
  ai: { coefficients: { wbsHour: 0.6 }, sampleSize: 1, confidence: 0.2 },
  workflowDiagnostics: { avoidableProcessWasteHours: 0.5 },
  testLandscape: { laneMinutes: { unit: 3 }, sandboxMinutes: 1 },
  review: { reworkProbability: 0.2 },
  accuracy: { refineToPlan: { maeHours: 0 }, aiP50: { maeHours: 1 }, aiP80Coverage: 1 },
};

function envelope(recordType, recordId, payload, overrides = {}) {
  return {
    schema: 'aitm.record/v1',
    recordId,
    recordType,
    repository: 'kburson/ai-task-manager',
    issue: 1091,
    createdAt: '2026-08-02T13:00:00.000Z',
    authority: { grantId: ids.grant, epoch: 1, actor: 'codex/1091' },
    predecessor: null,
    supersedes: null,
    payloadHash: hashRecordPayload(payload),
    payload,
    ...overrides,
  };
}

test('forecast, outcome, and rubric payloads validate their exact v1 schemas', () => {
  assert.equal(validateEstimationForecast(forecast, { expectedIssue: 1091 }), forecast);
  assert.equal(validateEstimationOutcome(outcome, { expectedIssue: 1091 }), outcome);
  assert.equal(validateEstimationRubric(rubric), rubric);
  assert.deepEqual(
    [FORECAST_RECORD_TYPE, OUTCOME_RECORD_TYPE, RUBRIC_RECORD_TYPE],
    ['estimation-forecast', 'estimation-outcome', 'estimation-rubric']
  );

  for (const [validator, value] of [
    [validateEstimationForecast, { ...forecast, invented: true }],
    [validateEstimationOutcome, { ...outcome, schema: 'aitm.estimation-outcome/v2' }],
    [validateEstimationRubric, { ...rubric, version: -1 }],
  ])
    assert.throws(() => validator(value), /estimation-record:/);
});

test('forecast rejects invalid sizes, WBS identity/totals, stage totals, and P80 ordering', () => {
  const cases = [
    { ...forecast, plan: { ...forecast.plan, size: 'HUGE' } },
    { ...forecast, wbs: [{ ...forecast.wbs[0], id: '' }, forecast.wbs[1]] },
    { ...forecast, wbs: [forecast.wbs[0], { ...forecast.wbs[1], id: 'records' }] },
    { ...forecast, wbs: [{ ...forecast.wbs[0], humanHours: 7 }, forecast.wbs[1]] },
    { ...forecast, ai: { ...forecast.ai, p80EngagedHours: 21 } },
    { ...forecast, ai: { ...forecast.ai, stages: { ...forecast.ai.stages, review: 3 } } },
    { ...forecast, ai: { ...forecast.ai, p50EngagedHours: Number.POSITIVE_INFINITY } },
  ];
  for (const value of cases)
    assert.throws(() => validateEstimationForecast(value), /estimation-record:/);
});

test('outcomes require a frozen forecast and coherent non-negative actuals', () => {
  const cases = [
    { ...outcome, forecastRecordId: null },
    { ...outcome, actual: { ...outcome.actual, engagedHours: -1 } },
    { ...outcome, actual: { ...outcome.actual, stages: { ...outcome.actual.stages, test: 4 } } },
    {
      ...outcome,
      actual: {
        ...outcome.actual,
        commands: [{ classification: 'test', durationMs: 1.5, attempts: 1 }],
      },
    },
  ];
  for (const value of cases)
    assert.throws(() => validateEstimationOutcome(value), /estimation-record:/);
});

test('rubrics require unique outcome identities and coherent samples', () => {
  assert.throws(
    () => validateEstimationRubric({ ...rubric, cohort: [...rubric.cohort, rubric.cohort[0]] }),
    /estimation-record:rubric-cohort-duplicate/
  );
  assert.throws(
    () => validateEstimationRubric({ ...rubric, human: { ...rubric.human, sampleSize: 2 } }),
    /estimation-record:/
  );
});

test('known estimation record types are validated and correlated by the canonical envelope', () => {
  const body = renderAitmRecord({
    envelope: envelope(FORECAST_RECORD_TYPE, ids.forecast, forecast),
    visibleMarkdown: renderEstimationForecast(forecast),
  });
  const parsed = parseAitmRecord({
    commentNodeId: 'IC_kwDO1091Forecast',
    body,
    expectedRepository: 'kburson/ai-task-manager',
    expectedIssue: 1091,
  });
  assert.equal(parsed.envelope.payload.issue, parsed.envelope.issue);

  const malformed = { ...forecast, issue: 999 };
  assert.throws(
    () => renderAitmRecord({ envelope: envelope(FORECAST_RECORD_TYPE, ids.forecast, malformed) }),
    /estimation-record:issue-correlation/
  );
});

test('visible renderers expose evidence while presentation edits leave payload hashes unchanged', () => {
  assert.match(renderEstimationForecast(forecast), /AI P50.*22h/i);
  assert.match(renderEstimationForecast(forecast), /Rubric.*v1/i);
  assert.match(renderEstimationOutcome(outcome), /variance/i);
  assert.match(renderEstimationRubric(rubric), /P80 coverage/i);

  const first = envelope(FORECAST_RECORD_TYPE, ids.forecast, forecast);
  const a = renderAitmRecord({
    envelope: first,
    visibleMarkdown: renderEstimationForecast(forecast),
  });
  const b = renderAitmRecord({
    envelope: first,
    visibleMarkdown: 'Different safe presentation.\n',
  });
  const parse = (body) =>
    parseAitmRecord({
      commentNodeId: 'IC_kwDO1091Forecast',
      body,
      expectedRepository: 'kburson/ai-task-manager',
      expectedIssue: 1091,
    });
  assert.equal(parse(a).envelope.payloadHash, parse(b).envelope.payloadHash);
});

test('immutable estimation writes use the comment store and accept success only after read-back', async () => {
  const forecastEnvelope = envelope(FORECAST_RECORD_TYPE, ids.forecast, forecast);
  const body = renderAitmRecord({
    envelope: forecastEnvelope,
    visibleMarkdown: renderEstimationForecast(forecast),
  });
  const commentNodeId = 'IC_kwDO1091Forecast';
  let writes = 0;
  let reads = 0;
  const result = await writeEstimationRecord({
    envelope: forecastEnvelope,
    repository: 'kburson/ai-task-manager',
    issue: 1091,
    rest: {
      createIssueComment: async ({ body: actual }) => {
        writes += 1;
        assert.equal(actual, body);
        return { node_id: commentNodeId };
      },
    },
    graphql: async () => {
      reads += 1;
      return {
        data: {
          nodes: [
            {
              __typename: 'IssueComment',
              id: commentNodeId,
              body,
              updatedAt: '2026-08-02T13:00:01Z',
              issue: { number: 1091, repository: { nameWithOwner: 'kburson/ai-task-manager' } },
            },
          ],
        },
      };
    },
  });
  assert.equal(result.commentNodeId, commentNodeId);
  assert.equal(writes, 1);
  assert.equal(reads, 1);
});
