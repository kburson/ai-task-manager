// @story #1091
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  FORECAST_SCHEMA,
  FORECAST_RECORD_TYPE,
  LEGACY_FORECAST_SCHEMA,
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
import { createGitHubEstimationRecordIo } from '../../../../lib/estimation/runtime-adapter.mjs';
import {
  renderEstimationForecast,
  renderEstimationOutcome,
  renderEstimationRubric,
  writeEstimationRecord,
} from '../../../../lib/estimation/renderers.mjs';
import {
  createAitmRecordEnvelope,
  createRecordId,
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
const commandExecution = {
  receiptId: '01J00000000000000000000120',
  stage: 'test',
  commitSha: 'a'.repeat(40),
  command: 'npm',
  args: ['run', 'test:unit'],
  exitCode: 0,
  durationMs: 1000,
  reusedFrom: null,
};

test('production estimation transport uses the #1070 store without direct REST comment code', () => {
  const source = readFileSync(
    new URL('../../../../lib/estimation/runtime-adapter.mjs', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(source, /repos\/\$\{repository\}\/issues\/\$\{issue\}\/comments/);
  assert.match(source, /mutation\s+AitmEstimationAddComment/);
});

test('production estimation transport resolves the issue node and writes through GraphQL', async () => {
  const calls = [];
  const io = createGitHubEstimationRecordIo({
    graphql: async ({ query, variables }) => {
      calls.push({ query, variables });
      if (query.includes('AitmEstimationIssueNode')) {
        return { data: { repository: { issue: { id: 'I_1091' } } } };
      }
      return { data: { addComment: { commentEdge: { node: { id: 'IC_record' } } } } };
    },
  });

  const result = await io.rest.createIssueComment({
    repository: 'kburson/ai-task-manager',
    issue: 1091,
    body: 'immutable record',
  });

  assert.deepEqual(result, { node_id: 'IC_record' });
  assert.deepEqual(calls[0].variables, {
    owner: 'kburson',
    name: 'ai-task-manager',
    issue: 1091,
  });
  assert.deepEqual(calls[1].variables, { subjectId: 'I_1091', body: 'immutable record' });
  assert.match(calls[1].query, /mutation\s+AitmEstimationAddComment/);
});

test('record construction generates canonical ULIDs and validates the complete envelope', () => {
  const randomBytesFn = (length) => Buffer.alloc(length, 0x2a);
  const recordId = createRecordId({ nowMs: 1_722_604_800_000, randomBytesFn });
  assert.match(recordId, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  const built = createAitmRecordEnvelope({
    recordType: FORECAST_RECORD_TYPE,
    repository: 'kburson/ai-task-manager',
    issue: 1091,
    payload: forecast,
    actor: 'aitm/plan-estimate',
    createdAt: '2026-08-02T13:00:00.000Z',
    recordId,
    grantId: createRecordId({ nowMs: 1_722_604_800_001, randomBytesFn }),
  });

  assert.equal(built.payloadHash, hashRecordPayload(forecast));
  assert.equal(built.recordId, recordId);
  assert.doesNotThrow(() => renderAitmRecord({ envelope: built }));
});

const forecast = {
  schema: FORECAST_SCHEMA,
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
  kind: 'story',
  issue: 1091,
  forecastRecordId: ids.forecast,
  humanPlanHours: 40,
  aiForecast: { p50EngagedHours: 22, p80EngagedHours: 31 },
  actual: {
    engagedHours: 23,
    stages: { plan: 2, develop: 16, test: 3, review: 2 },
    reviewFixCycles: 1,
    commands: [
      {
        classification: 'test-unit',
        durationMs: 1000,
        attempts: 1,
        executions: [commandExecution],
      },
    ],
  },
  landscape: {
    filesChanged: 18,
    modules: ['estimation'],
    lanes: ['unit'],
    dependencyBreadth: 3,
    childOutcomeRecordIds: [],
  },
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
  planning: {
    dependencyBreadthLimit: 8,
    refineFurtherVarianceRatio: 0.6,
    sizeEnvelopeHours: { XS: 1, S: 3, M: 8, L: 20, XL: 60 },
  },
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

test('current forecast, outcome, and rubric payloads validate their exact schemas', () => {
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

test('published v1 forecasts with fractional hours remain readable but cannot be newly created', () => {
  const legacy = structuredClone(forecast);
  legacy.schema = LEGACY_FORECAST_SCHEMA;
  legacy.refine.humanHours = 20.15;
  legacy.plan.deltaHours = 19.85;

  assert.equal(validateEstimationForecast(legacy), legacy);
  assert.throws(
    () =>
      createAitmRecordEnvelope({
        recordType: FORECAST_RECORD_TYPE,
        repository: 'kburson/ai-task-manager',
        issue: 1091,
        payload: legacy,
        actor: 'aitm/plan-estimate',
        createdAt: '2026-08-02T13:00:00.000Z',
        recordId: ids.forecast,
        grantId: ids.grant,
      }),
    /estimation-record:forecast-schema/
  );

  const legacyEnvelope = envelope(FORECAST_RECORD_TYPE, ids.forecast, legacy);
  const body = renderAitmRecord({
    envelope: legacyEnvelope,
    visibleMarkdown: renderEstimationForecast(legacy),
  });
  const parsed = parseAitmRecord({
    commentNodeId: 'IC_kwDO1091LegacyForecast',
    body,
    expectedRepository: 'kburson/ai-task-manager',
    expectedIssue: 1091,
  });
  assert.equal(parsed.envelope.payload.refine.humanHours, 20.15);
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

test('forecast rejects arbitrary fractions on every published estimate surface', () => {
  const offGridPlan = structuredClone(forecast);
  offGridPlan.plan.humanHours = 40.25;
  offGridPlan.plan.deltaHours = 0.25;
  offGridPlan.wbs[1].humanHours = 32.25;

  const offGridWbs = structuredClone(forecast);
  offGridWbs.wbs[0].humanHours = 8.25;
  offGridWbs.wbs[1].humanHours = 31.75;

  const offGridStage = structuredClone(forecast);
  offGridStage.ai.stages.plan = 2.25;
  offGridStage.ai.stages.develop = 12.75;

  const offGridRefine = structuredClone(forecast);
  offGridRefine.refine.humanHours = 40.25;
  offGridRefine.plan.deltaHours = -0.25;

  const cases = [
    [offGridRefine, /forecast-hours-grid/],
    [offGridPlan, /forecast-hours-grid/],
    [offGridWbs, /forecast-wbs-hours-grid/],
    [offGridStage, /forecast-stage-hours-grid/],
    [{ ...forecast, ai: { ...forecast.ai, p50EngagedHours: 20.25 } }, /forecast-ai-hours-grid/],
    [{ ...forecast, ai: { ...forecast.ai, p80EngagedHours: 30.25 } }, /forecast-ai-hours-grid/],
  ];

  for (const [value, expected] of cases) {
    assert.throws(() => validateEstimationForecast(value), expected);
  }
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
        commands: [
          {
            classification: 'test',
            durationMs: 1.5,
            attempts: 1,
            executions: [commandExecution],
          },
        ],
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

test('published v1 rubrics without planning thresholds remain readable for migration', () => {
  const publishedV1 = structuredClone(rubric);
  delete publishedV1.planning;
  assert.equal(validateEstimationRubric(publishedV1), publishedV1);
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
  assert.match(renderEstimationForecast(forecast), /Comparable.*#1068/i);
  assert.match(renderEstimationForecast(forecast), /unit, integration/i);
  assert.match(renderEstimationForecast(forecast), /Partial multi-surface writes/i);
  assert.match(renderEstimationOutcome(outcome), /variance/i);
  assert.match(renderEstimationRubric(rubric), /P80 coverage/i);
  assert.match(renderEstimationRubric(rubric), /Refine-to-Plan MAE/i);

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
