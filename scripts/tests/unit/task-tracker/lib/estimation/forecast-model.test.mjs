// @story #1091
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildEstimationForecast } from '../../../../../task-tracker/lib/estimation/forecast-model.mjs';
import {
  ceilEstimateHours,
  isHalfHourEstimate,
} from '../../../../../task-tracker/lib/estimation/estimate-granularity.mjs';
import { parsePlanEstimationInput } from '../../../../../task-tracker/lib/estimation/plan-input.mjs';
import { createBootstrapRubric } from '../../../../../task-tracker/lib/estimation/rubric-model.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(
  path.resolve(here, '../../../../fixtures/estimation/plan-input.json'),
  'utf8'
);
const rubricRecordId = '01J00000000000000000000500';

test('story estimates ceil to the next half hour without moving downward', () => {
  for (const [raw, expected] of [
    [3, 3],
    [3.13, 3.5],
    [3.3333, 3.5],
    [3.5, 3.5],
    [3.633, 4],
  ]) {
    const actual = ceilEstimateHours(raw);
    assert.equal(actual, expected);
    assert.ok(actual >= raw);
    assert.equal(isHalfHourEstimate(actual), true);
  }

  assert.equal(ceilEstimateHours(3.5 + Number.EPSILON), 3.5);
  assert.equal(ceilEstimateHours(0), 0);
  for (const invalid of [-0.1, Number.NaN, Number.POSITIVE_INFINITY, '3']) {
    assert.throws(() => ceilEstimateHours(invalid), /estimate-hours:/);
  }
});

test('plan input v1 parses exact WBS, repository, test, risk, and comparable signals', () => {
  const input = parsePlanEstimationInput(fixture);
  assert.equal(input.schema, 'aitm.plan-estimation-input/v1');
  assert.equal(input.wbs.length, 2);
  assert.deepEqual(input.testImpact.lanes, ['unit', 'integration', 'slow']);
  assert.deepEqual(input.comparableIssueIds, [1068]);
});

test('plan input rejects placeholders, duplicate or missing WBS IDs, and incomplete test evidence', () => {
  const base = JSON.parse(fixture);
  const cases = [
    { ...base, invented: true },
    { ...base, wbs: [{ ...base.wbs[0], id: '' }, base.wbs[1]] },
    { ...base, wbs: [base.wbs[0], { ...base.wbs[1], id: base.wbs[0].id }] },
    { ...base, wbs: [{ ...base.wbs[0], description: 'TODO' }, base.wbs[1]] },
    { ...base, testImpact: { ...base.testImpact, lanes: [] } },
  ];
  for (const value of cases)
    assert.throws(() => parsePlanEstimationInput(value), /plan-estimation-input:/);
});

test('forecast computes human work independently from AI coefficients and includes unavoidable repository cost', () => {
  const planInput = parsePlanEstimationInput(fixture);
  const rubric = createBootstrapRubric({ generatedAt: '2026-08-02T13:00:00.000Z' });
  const forecast = buildEstimationForecast({
    issue: 1091,
    refine: { size: 'XL', humanHours: 40 },
    planInput,
    rubric: { recordId: rubricRecordId, payload: rubric },
    comparableOutcomes: [],
  });
  assert.equal(forecast.plan.humanHours, 44);
  assert.equal(
    forecast.wbs.reduce((sum, item) => sum + item.humanHours, 0),
    44
  );
  assert.ok(forecast.ai.p50EngagedHours < forecast.plan.humanHours);

  const slowerAi = structuredClone(rubric);
  slowerAi.ai.coefficients.implementationHour = 1.8;
  const changed = buildEstimationForecast({
    issue: 1091,
    refine: { size: 'XL', humanHours: 40 },
    planInput,
    rubric: { recordId: rubricRecordId, payload: slowerAi },
    comparableOutcomes: [],
  });
  assert.equal(changed.plan.humanHours, forecast.plan.humanHours);
  assert.notEqual(changed.ai.p50EngagedHours, forecast.ai.p50EngagedHours);

  const learnedHuman = structuredClone(rubric);
  learnedHuman.human.coefficients.necessaryToPlanned = 0.5;
  const calibrated = buildEstimationForecast({
    issue: 1091,
    refine: { size: 'XL', humanHours: 40 },
    planInput,
    rubric: { recordId: rubricRecordId, payload: learnedHuman },
    comparableOutcomes: [],
  });
  assert.equal(calibrated.plan.humanHours, 24.5);
  assert.notEqual(calibrated.plan.humanHours, forecast.plan.humanHours);

  const humanBreadthOnly = structuredClone(rubric);
  humanBreadthOnly.human.coefficients.moduleBreadthHour += 10;
  humanBreadthOnly.human.coefficients.dependencyBreadthHour += 10;
  const separated = buildEstimationForecast({
    issue: 1091,
    refine: { size: 'XL', humanHours: 40 },
    planInput,
    rubric: { recordId: rubricRecordId, payload: humanBreadthOnly },
    comparableOutcomes: [],
  });
  assert.notEqual(separated.plan.humanHours, forecast.plan.humanHours);
  assert.equal(separated.ai.p50EngagedHours, forecast.ai.p50EngagedHours);
});

test('human estimate is invariant when identical repository breadth is split across WBS rows', () => {
  const rubric = {
    recordId: rubricRecordId,
    payload: createBootstrapRubric({ generatedAt: '2026-08-02T13:00:00.000Z' }),
  };
  const item = (id, baseHumanHours) => ({
    id,
    description: 'Implement the same scoped capability',
    baseHumanHours,
    signals: { modules: ['same-module'], dependencies: ['same-dependency'] },
    independentlyReviewable: true,
  });
  const input = (wbs) => ({
    schema: 'aitm.plan-estimation-input/v1',
    wbs,
    testImpact: { lanes: ['unit'], isolation: 'test-sandbox', expectedMinutes: 0 },
    risks: [],
    comparableIssueIds: [1068],
  });
  const comparableOutcomes = [
    {
      recordId: '01J00000000000000000000501',
      payload: {
        issue: 1068,
        landscape: {
          modules: ['same-module'],
          lanes: ['unit'],
          dependencyBreadth: 1,
          filesChanged: 5,
        },
      },
    },
  ];
  const one = buildEstimationForecast({
    issue: 1091,
    refine: { size: 'M', humanHours: 8 },
    planInput: input([item('one', 10)]),
    rubric,
    comparableOutcomes,
  });
  const two = buildEstimationForecast({
    issue: 1091,
    refine: { size: 'M', humanHours: 8 },
    planInput: input([item('one', 5), item('two', 5)]),
    rubric,
    comparableOutcomes,
  });
  assert.equal(two.plan.humanHours, one.plan.humanHours);
  assert.equal(two.ai.p50EngagedHours, one.ai.p50EngagedHours);
  assert.deepEqual(two.comparableIssues, one.comparableIssues);
});

test('forecast widens P80 from confidence and allocates P50 across exact lifecycle stages', () => {
  const forecast = buildEstimationForecast({
    issue: 1091,
    refine: { size: 'XL', humanHours: 40 },
    planInput: parsePlanEstimationInput(fixture),
    rubric: {
      recordId: rubricRecordId,
      payload: createBootstrapRubric({ generatedAt: '2026-08-02T13:00:00.000Z' }),
    },
    comparableOutcomes: [],
  });
  assert.ok(forecast.ai.p80EngagedHours > forecast.ai.p50EngagedHours);
  assert.equal(
    Number(
      Object.values(forecast.ai.stages)
        .reduce((sum, value) => sum + value, 0)
        .toFixed(4)
    ),
    forecast.ai.p50EngagedHours
  );
  assert.equal(forecast.rubric.confidence, 0.1);
});

test('forecast publishes only reconciled whole or half-hour estimates', () => {
  const forecast = buildEstimationForecast({
    issue: 1091,
    refine: { size: 'XL', humanHours: 40 },
    planInput: parsePlanEstimationInput(fixture),
    rubric: {
      recordId: rubricRecordId,
      payload: createBootstrapRubric({ generatedAt: '2026-08-02T13:00:00.000Z' }),
    },
    comparableOutcomes: [],
  });

  assert.deepEqual(
    forecast.wbs.map((item) => item.humanHours),
    [10, 33, 1]
  );
  assert.deepEqual(forecast.ai.stages, { plan: 2, develop: 22.5, test: 4, review: 3.5 });
  assert.equal(forecast.plan.humanHours, 44);
  assert.equal(forecast.ai.p50EngagedHours, 32);
  assert.equal(forecast.ai.p80EngagedHours, 47);

  const published = [
    forecast.refine.humanHours,
    forecast.plan.humanHours,
    forecast.ai.p50EngagedHours,
    forecast.ai.p80EngagedHours,
    ...forecast.wbs.map((item) => item.humanHours),
    ...Object.values(forecast.ai.stages),
  ];
  assert.ok(published.every(isHalfHourEstimate));
  assert.equal(
    forecast.wbs.reduce((sum, item) => sum + item.humanHours, 0),
    forecast.plan.humanHours
  );
  assert.equal(
    Object.values(forecast.ai.stages).reduce((sum, hours) => sum + hours, 0),
    forecast.ai.p50EngagedHours
  );
  assert.ok(forecast.ai.p80EngagedHours >= forecast.ai.p50EngagedHours);
});

test('small forecasts account for repository execution once and never allocate a negative stage', () => {
  const input = JSON.parse(fixture);
  input.wbs = [
    {
      id: 'small',
      description: 'Implement one isolated behavior',
      baseHumanHours: 1,
      signals: { modules: ['small'], dependencies: ['runtime'] },
      independentlyReviewable: true,
    },
  ];
  input.testImpact = {
    lanes: ['slow'],
    isolation: 'test-sandbox',
    expectedMinutes: 30,
  };
  const forecast = buildEstimationForecast({
    issue: 1091,
    refine: { size: 'S', humanHours: 3 },
    planInput: parsePlanEstimationInput(input),
    rubric: {
      recordId: rubricRecordId,
      payload: createBootstrapRubric({ generatedAt: '2026-08-02T13:00:00.000Z' }),
    },
    comparableOutcomes: [],
  });
  assert.equal(forecast.plan.humanHours, 2.5);
  assert.ok(Object.values(forecast.ai.stages).every((hours) => hours >= 0));
  assert.equal(
    Number(
      Object.values(forecast.ai.stages)
        .reduce((sum, hours) => sum + hours, 0)
        .toFixed(4)
    ),
    forecast.ai.p50EngagedHours
  );
});

test('forecast uses learned lane plus sandbox cost as a non-overlapping execution floor', () => {
  const input = JSON.parse(fixture);
  input.wbs = [
    {
      id: 'learned-cost',
      description: 'Implement one learned-cost change',
      baseHumanHours: 1,
      signals: { modules: ['estimation'], dependencies: ['runtime'] },
      independentlyReviewable: true,
    },
  ];
  input.testImpact = { lanes: ['unit'], isolation: 'test-sandbox', expectedMinutes: 5 };
  const rubric = createBootstrapRubric({ generatedAt: '2026-08-02T13:00:00.000Z' });
  rubric.testLandscape = { laneMinutes: { unit: 20 }, sandboxMinutes: 10 };

  const learnedFloor = buildEstimationForecast({
    issue: 1091,
    refine: { size: 'S', humanHours: 3 },
    planInput: input,
    rubric: { recordId: rubricRecordId, payload: rubric },
  });
  assert.equal(learnedFloor.ai.stages.test, 0.5);
  assert.equal(learnedFloor.plan.humanHours, 2.5);

  input.testImpact.expectedMinutes = 40;
  const explicitFloor = buildEstimationForecast({
    issue: 1091,
    refine: { size: 'S', humanHours: 3 },
    planInput: input,
    rubric: { recordId: rubricRecordId, payload: rubric },
  });
  assert.equal(explicitFloor.ai.stages.test, 1);
});

test('comparable outcomes retain exact IDs and rank by module, dependency, lane, and diff similarity', () => {
  const makeOutcome = (recordId, issue, landscape) => ({ recordId, payload: { issue, landscape } });
  const close = makeOutcome('01J00000000000000000000501', 1068, {
    modules: ['estimation', 'reports'],
    lanes: ['unit', 'integration'],
    dependencyBreadth: 4,
    filesChanged: 10,
  });
  const far = makeOutcome('01J00000000000000000000502', 999, {
    modules: ['unrelated'],
    lanes: ['slow'],
    dependencyBreadth: 20,
    filesChanged: 100,
  });
  const input = JSON.parse(fixture);
  input.comparableIssueIds = [1068, 999];
  const forecast = buildEstimationForecast({
    issue: 1091,
    refine: { size: 'XL', humanHours: 40 },
    planInput: parsePlanEstimationInput(input),
    rubric: {
      recordId: rubricRecordId,
      payload: createBootstrapRubric({ generatedAt: '2026-08-02T13:00:00.000Z' }),
    },
    comparableOutcomes: [far, close],
  });
  assert.deepEqual(
    forecast.comparableIssues.map((item) => item.issue),
    [1068, 999]
  );
  assert.ok(forecast.comparableIssues[0].weight > forecast.comparableIssues[1].weight);
  assert.equal(forecast.comparableIssues[0].outcomeRecordId, close.recordId);
});

test('recommendation splits non-reviewable or over-broad work and otherwise proceeds', () => {
  const base = JSON.parse(fixture);
  const build = (input) =>
    buildEstimationForecast({
      issue: 1091,
      refine: { size: 'XL', humanHours: 40 },
      planInput: parsePlanEstimationInput(input),
      rubric: {
        recordId: rubricRecordId,
        payload: createBootstrapRubric({ generatedAt: '2026-08-02T13:00:00.000Z' }),
      },
      comparableOutcomes: [],
    });
  assert.equal(build(base).recommendation.action, 'proceed');
  const nonReviewable = structuredClone(base);
  nonReviewable.wbs[0].independentlyReviewable = false;
  assert.equal(build(nonReviewable).recommendation.action, 'split');
  const broad = structuredClone(base);
  broad.wbs[0].signals.dependencies = Array.from({ length: 10 }, (_, index) => `dep-${index}`);
  assert.equal(build(broad).recommendation.action, 'split');

  const uncertainRubric = createBootstrapRubric({ generatedAt: '2026-08-02T13:00:00.000Z' });
  uncertainRubric.planning.refineFurtherVarianceRatio = 0.1;
  uncertainRubric.planning.sizeEnvelopeHours.XL = 100;
  const uncertain = buildEstimationForecast({
    issue: 1091,
    refine: { size: 'XL', humanHours: 40 },
    planInput: parsePlanEstimationInput(base),
    rubric: { recordId: rubricRecordId, payload: uncertainRubric },
    comparableOutcomes: [],
  });
  assert.equal(uncertain.recommendation.action, 'refine-further');

  const overEnvelopeRubric = createBootstrapRubric({ generatedAt: '2026-08-02T13:00:00.000Z' });
  overEnvelopeRubric.planning.sizeEnvelopeHours.XL = 30;
  const overEnvelope = buildEstimationForecast({
    issue: 1091,
    refine: { size: 'XL', humanHours: 40 },
    planInput: parsePlanEstimationInput(base),
    rubric: { recordId: rubricRecordId, payload: overEnvelopeRubric },
    comparableOutcomes: [],
  });
  assert.equal(overEnvelope.recommendation.action, 'split');
});
