// @story #1091
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  BOOTSTRAP_RUBRIC_PRIORS,
  createBootstrapRubric,
  updateEstimationRubric,
} from '../../../../lib/estimation/rubric-model.mjs';

const forecastId = '01J00000000000000000000200';
const outcomeId = '01J00000000000000000000201';

function outcome(overrides = {}) {
  return {
    recordId: outcomeId,
    createdAt: '2026-08-02T14:00:00.000Z',
    payload: {
      schema: 'aitm.estimation-outcome/v1',
      issue: 1091,
      forecastRecordId: forecastId,
      humanPlanHours: 10,
      aiForecast: { p50EngagedHours: 5, p80EngagedHours: 8 },
      actual: {
        engagedHours: 7,
        stages: { plan: 1, develop: 4, test: 1, review: 1 },
        reviewFixCycles: 1,
        commands: [],
      },
      landscape: {
        filesChanged: 4,
        modules: ['estimation'],
        lanes: ['unit'],
        dependencyBreadth: 1,
        childOutcomeRecordIds: [],
      },
      variance: { vsAiP50Hours: 2, vsAiP80Hours: -1 },
      costClassification: {
        necessaryHours: 5,
        avoidableProcessWasteHours: 2,
        unclassifiedHours: 0,
        drivers: [{ kind: 'redundant-verification', hours: 2 }],
      },
      ...overrides,
    },
  };
}

test('bootstrap priors explicitly separate human, AI, test, review, and uncertainty inputs', () => {
  const rubric = createBootstrapRubric({ generatedAt: '2026-08-02T13:00:00.000Z' });
  assert.deepEqual(Object.keys(BOOTSTRAP_RUBRIC_PRIORS).sort(), [
    'ai',
    'human',
    'review',
    'testLandscape',
    'uncertainty',
  ]);
  assert.equal(rubric.version, 1);
  assert.equal(rubric.cohort.length, 0);
  assert.equal(rubric.human.confidence, 0.1);
  assert.equal(rubric.ai.confidence, 0.1);
});

test('one outcome updates AI coefficients and diagnostics without leaking avoidable waste into human coefficients', () => {
  const previous = createBootstrapRubric({ generatedAt: '2026-08-02T13:00:00.000Z' });
  const updated = updateEstimationRubric({
    previous,
    outcomes: [outcome()],
    generatedAt: '2026-08-02T15:00:00.000Z',
  });
  assert.equal(updated.cohort[0].outcomeRecordId, outcomeId);
  assert.equal(updated.workflowDiagnostics.avoidableProcessWasteHours, 2);
  assert.ok(updated.ai.coefficients.engagedToHuman > previous.ai.coefficients.engagedToHuman);
  assert.equal(updated.human.coefficients.necessaryToPlanned, 0.5);

  const wasteOnlyChanged = updateEstimationRubric({
    previous,
    outcomes: [
      outcome({
        actual: {
          ...outcome().payload.actual,
          engagedHours: 9,
          stages: { plan: 1, develop: 6, test: 1, review: 1 },
        },
        costClassification: {
          necessaryHours: 5,
          avoidableProcessWasteHours: 4,
          unclassifiedHours: 0,
          drivers: [{ kind: 'redundant-verification', hours: 4 }],
        },
        variance: { vsAiP50Hours: 4, vsAiP80Hours: 1 },
      }),
    ],
    generatedAt: '2026-08-02T15:00:00.000Z',
  });
  assert.deepEqual(wasteOnlyChanged.human.coefficients, updated.human.coefficients);
  assert.notDeepEqual(wasteOnlyChanged.ai.coefficients, updated.ai.coefficients);
});

test('updates are recency bounded, weighted, and cap one outlier influence', () => {
  const previous = createBootstrapRubric({ generatedAt: '2026-08-01T00:00:00.000Z' });
  const outcomes = Array.from({ length: 60 }, (_, index) =>
    outcome({
      issue: 1000 + index,
      humanPlanHours: 10,
      actual: {
        ...outcome().payload.actual,
        engagedHours: index === 59 ? 1000 : 5,
        stages:
          index === 59
            ? { plan: 100, develop: 700, test: 100, review: 100 }
            : { plan: 1, develop: 2, test: 1, review: 1 },
      },
      costClassification:
        index === 59
          ? {
              necessaryHours: 1000,
              avoidableProcessWasteHours: 0,
              unclassifiedHours: 0,
              drivers: [],
            }
          : { necessaryHours: 5, avoidableProcessWasteHours: 0, unclassifiedHours: 0, drivers: [] },
      variance:
        index === 59
          ? { vsAiP50Hours: 995, vsAiP80Hours: 992 }
          : { vsAiP50Hours: 0, vsAiP80Hours: -3 },
    })
  ).map((entry, index) => ({
    ...entry,
    recordId: `01J00000000000000000000${String(index + 300).padStart(3, '0')}`,
    createdAt: `2026-08-02T${String(Math.floor(index / 3)).padStart(2, '0')}:${String((index % 3) * 20).padStart(2, '0')}:00.000Z`,
  }));
  const updated = updateEstimationRubric({
    previous,
    outcomes,
    generatedAt: '2026-08-03T00:00:00.000Z',
  });
  assert.equal(updated.cohort.length, 50);
  assert.ok(updated.human.coefficients.necessaryToPlanned <= 2);
  assert.ok(updated.ai.coefficients.engagedToHuman <= 2);
  assert.equal(updated.human.sampleSize, 50);
  assert.ok(updated.human.confidence > 0.1 && updated.human.confidence < 1);
});
