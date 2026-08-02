// @story #1091
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildEstimationForecast } from '../../../../lib/estimation/forecast-model.mjs';
import { parsePlanEstimationInput } from '../../../../lib/estimation/plan-input.mjs';
import { createBootstrapRubric } from '../../../../lib/estimation/rubric-model.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(
  path.resolve(here, '../../../fixtures/estimation/plan-input.json'),
  'utf8'
);
const rubricRecordId = '01J00000000000000000000500';

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
  assert.equal(forecast.plan.humanHours, 40);
  assert.equal(
    forecast.wbs.reduce((sum, item) => sum + item.humanHours, 0),
    40
  );
  assert.ok(forecast.ai.p50EngagedHours < forecast.plan.humanHours);

  const slowerAi = structuredClone(rubric);
  slowerAi.ai.coefficients.engagedToHuman = 1.8;
  const changed = buildEstimationForecast({
    issue: 1091,
    refine: { size: 'XL', humanHours: 40 },
    planInput,
    rubric: { recordId: rubricRecordId, payload: slowerAi },
    comparableOutcomes: [],
  });
  assert.equal(changed.plan.humanHours, forecast.plan.humanHours);
  assert.notEqual(changed.ai.p50EngagedHours, forecast.ai.p50EngagedHours);
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
    Object.values(forecast.ai.stages).reduce((sum, value) => sum + value, 0),
    forecast.ai.p50EngagedHours
  );
  assert.equal(forecast.rubric.confidence, 0.1);
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
});
