// @story #1091
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { buildEstimationOutcome } from '../../../../lib/estimation/outcome-builder.mjs';

const forecast = {
  recordId: '01J00000000000000000000800',
  payload: {
    issue: 1091,
    plan: { humanHours: 40 },
    ai: { p50EngagedHours: 20, p80EngagedHours: 30 },
  },
};
const timing = {
  stagesMs: { plan: 3_600_000, develop: 7_200_000, test: 3_600_000, review: 3_600_000 },
};
const verification = {
  classification: 'test-unit',
  durationMs: 1200,
  attempts: 2,
  executions: [
    {
      receiptId: '01J00000000000000000000810',
      stage: 'develop-final',
      commitSha: 'a'.repeat(40),
      command: 'npm',
      args: ['run', 'test:unit'],
      exitCode: 0,
      durationMs: 600,
      reusedFrom: null,
    },
    {
      receiptId: '01J00000000000000000000811',
      stage: 'review',
      commitSha: 'a'.repeat(40),
      command: 'npm',
      args: ['run', 'test:unit'],
      exitCode: 0,
      durationMs: 600,
      reusedFrom: null,
    },
  ],
};

test('completion outcome uses timing rows, exact verification, review, diff, and cost evidence', () => {
  const outcome = buildEstimationOutcome({
    issue: 1091,
    forecast,
    timing,
    verification: [verification],
    diff: { filesChanged: 8, modules: ['estimation'], lanes: ['unit'], dependencyBreadth: 2 },
    review: { fixCycles: 1 },
    cost: {
      avoidableProcessWasteHours: 0.25,
      unclassifiedHours: 0.25,
      drivers: [{ kind: 'redundant-verification', hours: 0.25 }],
    },
  });
  assert.equal(outcome.actual.engagedHours, 5);
  assert.equal(outcome.kind, 'story');
  assert.equal(outcome.actual.stages.develop, 2);
  assert.equal(outcome.actual.commands[0].attempts, 2);
  assert.equal(outcome.costClassification.necessaryHours, 4.5);
  assert.equal(outcome.variance.vsAiP50Hours, -15);
  assert.deepEqual(outcome.landscape.childOutcomeRecordIds, []);
});

test('malformed, negative, or zero timing fails closed for an eligible forecast', () => {
  for (const badTiming of [
    null,
    { stagesMs: { plan: 1 } },
    { stagesMs: { plan: 0, develop: 0, test: 0, review: 0 } },
    { stagesMs: { plan: -1, develop: 1, test: 1, review: 1 } },
  ])
    assert.throws(
      () =>
        buildEstimationOutcome({
          issue: 1091,
          forecast,
          timing: badTiming,
          verification: [],
          diff: { filesChanged: 0, modules: [], lanes: [], dependencyBreadth: 0 },
          review: { fixCycles: 0 },
        }),
      /estimation-outcome:/
    );
});

test('epic outcome records orchestration only and references child outcomes', () => {
  const outcome = buildEstimationOutcome({
    issue: 1067,
    forecast: null,
    timing,
    verification: [],
    diff: { filesChanged: 0, modules: ['epic-orchestration'], lanes: [], dependencyBreadth: 0 },
    review: { fixCycles: 0 },
    kind: 'epic-orchestration',
    childOutcomeRecordIds: ['01J00000000000000000000801', '01J00000000000000000000802'],
  });
  assert.deepEqual(outcome.landscape.childOutcomeRecordIds, [
    '01J00000000000000000000801',
    '01J00000000000000000000802',
  ]);
  assert.deepEqual(outcome.landscape.modules, ['epic-orchestration']);
  assert.equal(outcome.kind, 'epic-orchestration');
  assert.equal(outcome.forecastRecordId, null);
  assert.equal(outcome.humanPlanHours, null);
  assert.equal(outcome.aiForecast, null);
  assert.equal(outcome.variance, null);
});

test('unknown production cost remains unclassified instead of being labeled necessary', () => {
  const outcome = buildEstimationOutcome({
    issue: 1091,
    forecast,
    timing,
    verification: [],
    diff: { filesChanged: 1, modules: ['estimation'], lanes: ['sandbox'], dependencyBreadth: 1 },
    review: { fixCycles: 0 },
    cost: {},
  });
  assert.equal(outcome.costClassification.necessaryHours, 0);
  assert.equal(outcome.costClassification.unclassifiedHours, 5);
});
