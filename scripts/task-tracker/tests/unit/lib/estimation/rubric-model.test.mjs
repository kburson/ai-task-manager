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
let executionSequence = 600;

function verificationCommand(
  classification,
  durations,
  commitShas = durations.map(() => 'a'.repeat(40))
) {
  const executions = durations.map((durationMs, index) => ({
    receiptId: `01J00000000000000000000${String(executionSequence++).padStart(3, '0')}`,
    stage: index === 0 ? 'develop-final' : 'review',
    commitSha: commitShas[index],
    command: 'npm',
    args: ['run', `test:${classification.replace(/^test-/, '')}`],
    exitCode: 0,
    durationMs,
    reusedFrom: null,
  }));
  return {
    classification,
    durationMs: durations.reduce((sum, duration) => sum + duration, 0),
    attempts: durations.length,
    executions,
  };
}

function outcome(overrides = {}) {
  return {
    recordId: outcomeId,
    createdAt: '2026-08-02T14:00:00.000Z',
    payload: {
      schema: 'aitm.estimation-outcome/v1',
      kind: 'story',
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
    'planning',
    'review',
    'testLandscape',
    'uncertainty',
  ]);
  assert.equal(rubric.version, 1);
  assert.equal(rubric.cohort.length, 0);
  assert.equal(rubric.human.confidence, 0.1);
  assert.equal(rubric.ai.confidence, 0.1);
});

test('agent outcomes update AI diagnostics without calibrating human effort from AI duration', () => {
  const previous = createBootstrapRubric({ generatedAt: '2026-08-02T13:00:00.000Z' });
  const updated = updateEstimationRubric({
    previous,
    outcomes: [outcome()],
    generatedAt: '2026-08-02T15:00:00.000Z',
  });
  assert.equal(updated.cohort[0].outcomeRecordId, outcomeId);
  assert.equal(updated.workflowDiagnostics.avoidableProcessWasteHours, 2);
  assert.equal(updated.ai.coefficients.implementationHour, 0.4);
  assert.deepEqual(updated.human.coefficients, previous.human.coefficients);
  assert.equal(updated.human.sampleSize, previous.human.sampleSize);
  assert.equal(updated.human.confidence, previous.human.confidence);

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
  assert.deepEqual(updated.human.coefficients, previous.human.coefficients);
  assert.ok(updated.ai.coefficients.implementationHour <= 2);
  assert.equal(updated.human.sampleSize, 0);
  assert.equal(updated.human.confidence, 0.1);
});

test('lane and sandbox costs use their own observed sample counts', () => {
  const previous = createBootstrapRubric({ generatedAt: '2026-08-01T00:00:00.000Z' });
  const unit = outcome({
    actual: {
      ...outcome().payload.actual,
      commands: [verificationCommand('test-unit', [120_000])],
    },
    landscape: { ...outcome().payload.landscape, lanes: ['unit', 'sandbox'] },
  });
  const integration = outcome({
    issue: 1092,
    actual: {
      ...outcome().payload.actual,
      stages: { plan: 2, develop: 4, test: 2, review: 1 },
      engagedHours: 9,
      commands: [verificationCommand('test-integration', [300_000])],
    },
    variance: { vsAiP50Hours: 4, vsAiP80Hours: 1 },
    costClassification: {
      necessaryHours: 5,
      avoidableProcessWasteHours: 2,
      unclassifiedHours: 2,
      drivers: [],
    },
    landscape: { ...outcome().payload.landscape, lanes: ['integration'] },
  });
  integration.recordId = '01J00000000000000000000202';
  integration.createdAt = '2026-08-02T15:00:00.000Z';

  const updated = updateEstimationRubric({
    previous,
    outcomes: [unit, integration],
    generatedAt: '2026-08-02T16:00:00.000Z',
  });
  assert.equal(updated.testLandscape.laneMinutes.unit, 2);
  assert.equal(updated.testLandscape.laneMinutes.integration, 5);
  assert.equal(updated.testLandscape.sandboxMinutes, 58);
});

test('avoidable repeated verification is excluded from learned human repository cost', () => {
  const previous = createBootstrapRubric({ generatedAt: '2026-08-01T00:00:00.000Z' });
  const clean = outcome({
    actual: {
      ...outcome().payload.actual,
      stages: { plan: 1, develop: 4, test: 1, review: 1 },
      commands: [verificationCommand('test-unit', [3_600_000])],
    },
    costClassification: {
      necessaryHours: 7,
      avoidableProcessWasteHours: 0,
      unclassifiedHours: 0,
      drivers: [],
    },
    landscape: { ...outcome().payload.landscape, lanes: ['unit', 'sandbox'] },
  });
  const rerun = outcome({
    actual: {
      ...outcome().payload.actual,
      engagedHours: 8,
      stages: { plan: 1, develop: 4, test: 2, review: 1 },
      commands: [verificationCommand('test-unit', [3_600_000, 3_600_000])],
    },
    variance: { vsAiP50Hours: 3, vsAiP80Hours: 0 },
    costClassification: {
      necessaryHours: 7,
      avoidableProcessWasteHours: 1,
      unclassifiedHours: 0,
      drivers: [{ kind: 'redundant-verification', hours: 1 }],
    },
    landscape: { ...outcome().payload.landscape, lanes: ['unit', 'sandbox'] },
  });

  const cleanRubric = updateEstimationRubric({ previous, outcomes: [clean] });
  const rerunRubric = updateEstimationRubric({ previous, outcomes: [rerun] });

  assert.equal(cleanRubric.testLandscape.laneMinutes.unit, 60);
  assert.equal(rerunRubric.testLandscape.laneMinutes.unit, 60);
  assert.equal(cleanRubric.testLandscape.sandboxMinutes, 0);
  assert.equal(rerunRubric.testLandscape.sandboxMinutes, 0);
});

test('distinct focused commands on the same SHA are not learned as repeated verification waste', () => {
  const previous = createBootstrapRubric({ generatedAt: '2026-08-01T00:00:00.000Z' });
  const sample = outcome({
    actual: {
      ...outcome().payload.actual,
      commands: [
        {
          classification: 'test-focused',
          durationMs: 120_000,
          attempts: 2,
          executions: [
            {
              receiptId: '01J00000000000000000000921',
              stage: 'review',
              commitSha: 'a'.repeat(40),
              command: 'node',
              args: ['--test', 'a.test.mjs'],
              exitCode: 0,
              durationMs: 60_000,
              reusedFrom: null,
            },
            {
              receiptId: '01J00000000000000000000922',
              stage: 'review',
              commitSha: 'a'.repeat(40),
              command: 'node',
              args: ['--test', 'b.test.mjs'],
              exitCode: 0,
              durationMs: 60_000,
              reusedFrom: null,
            },
          ],
        },
      ],
    },
    costClassification: {
      necessaryHours: 6,
      avoidableProcessWasteHours: 1,
      unclassifiedHours: 0,
      drivers: [{ kind: 'unrelated-process-waste', hours: 1 }],
    },
  });
  const updated = updateEstimationRubric({ previous, outcomes: [sample] });
  assert.equal(updated.testLandscape.laneMinutes.focused, 2);
});

test('AI implementation learning uses Develop only and calibrates other lifecycle stages separately', () => {
  const previous = createBootstrapRubric({ generatedAt: '2026-08-01T00:00:00.000Z' });
  const baseline = outcome({
    actual: {
      ...outcome().payload.actual,
      engagedHours: 7,
      stages: { plan: 1, develop: 4, test: 1, review: 1 },
    },
  });
  const lifecycleOnlyChanged = outcome({
    actual: {
      ...outcome().payload.actual,
      engagedHours: 10,
      stages: { plan: 2, develop: 4, test: 2, review: 2 },
    },
    variance: { vsAiP50Hours: 5, vsAiP80Hours: 2 },
    costClassification: {
      necessaryHours: 8,
      avoidableProcessWasteHours: 2,
      unclassifiedHours: 0,
      drivers: [{ kind: 'redundant-verification', hours: 2 }],
    },
  });

  const first = updateEstimationRubric({ previous, outcomes: [baseline] });
  const second = updateEstimationRubric({ previous, outcomes: [lifecycleOnlyChanged] });

  assert.equal(first.ai.coefficients.implementationHour, second.ai.coefficients.implementationHour);
  assert.notEqual(first.ai.coefficients.planningHour, second.ai.coefficients.planningHour);
  assert.notEqual(first.ai.coefficients.verificationHour, second.ai.coefficients.verificationHour);
  assert.notEqual(first.ai.coefficients.reviewHour, second.ai.coefficients.reviewHour);
});

test('Refine-to-Plan accuracy learns from the frozen forecast paired with each outcome', () => {
  const previous = createBootstrapRubric({ generatedAt: '2026-08-01T00:00:00.000Z' });
  const sample = outcome();
  sample.forecastPayload = {
    issue: 1091,
    refine: { humanHours: 6 },
    plan: { humanHours: 10 },
  };

  const updated = updateEstimationRubric({
    previous,
    outcomes: [sample],
    generatedAt: '2026-08-02T16:00:00.000Z',
  });

  assert.equal(updated.accuracy.refineToPlan.maeHours, 4);
});
