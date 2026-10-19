// @story #2037
import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyMeasurement } from '../../../../maintenance/measure-graphql-read-dedup.mjs';

function sample() {
  let attempt = 0;
  const row = () => ({
    cost: 1,
    bodyHash: 'b'.repeat(64),
    queryHash: 'c'.repeat(64),
    reset: '1792431218',
    remaining: 3000,
    httpStatus: 200,
    telemetry: {
      callId: `measured-attempt-${++attempt}`,
      observationKind: 'http-attempt',
      outcome: 'success',
      kind: 'query',
      pointCost: 1,
      costSource: 'same-response-rate-limit',
      costCoverage: 'complete-observation',
      hiddenRequestCount: 0,
      sessionSource: 'runtime',
    },
  });
  return {
    schema: 'aitm.graphql-read-dedup-measurement/v1',
    scope: 'readiness-body',
    endpoint: 'https://api.github.com/graphql',
    account: { login: 'operator', id: 123 },
    runs: [
      ['baseline', 'bind', 2],
      ['candidate', 'bind', 1],
      ['candidate', 'resume', 1],
      ['baseline', 'resume', 2],
    ].map(([variant, action, count]) => ({
      variant,
      action,
      source: { commit: 'a'.repeat(40), sha256: (variant === 'baseline' ? 'd' : 'e').repeat(64) },
      result: { status: 'ready', blockers: [], warnings: [] },
      observations: Array.from({ length: count }, row),
    })),
  };
}

test('matched direct costs show one saved point for each readiness action', () => {
  const result = verifyMeasurement(sample());
  assert.deepEqual(
    result.comparisons,
    ['bind', 'resume'].map((action) => ({
      action,
      before: { requests: 2, points: 2 },
      after: { requests: 1, points: 1 },
      savedPoints: 1,
      savedPercent: 50,
    }))
  );
  assert.equal(result.requests, 6);
  assert.equal(result.points, 6);
});

test('different reset windows are disclosed without remaining-counter arithmetic', () => {
  const value = sample();
  value.runs[1].observations[0].reset = '1792431242';
  value.runs[1].observations[0].remaining = 4800;
  const result = verifyMeasurement(value);
  assert.deepEqual(result.resetWindows, ['1792431218', '1792431242']);
  assert.equal(result.sharedBudgetKnown, false);
  assert.equal(result.comparisons[0].savedPoints, 1);
});

for (const [name, change] of [
  [
    'body drift',
    (v) => {
      v.runs[1].observations[0].bodyHash = 'f'.repeat(64);
    },
  ],
  [
    'query drift',
    (v) => {
      v.runs[1].observations[0].queryHash = 'f'.repeat(64);
    },
  ],
  [
    'missing cost',
    (v) => {
      v.runs[1].observations[0].cost = null;
    },
  ],
  [
    'unknown hidden attempts',
    (v) => {
      v.runs[1].observations[0].telemetry.hiddenRequestCount = null;
    },
  ],
  [
    'opaque observation',
    (v) => {
      v.runs[1].observations[0].telemetry.observationKind = 'opaque-cli-invocation';
    },
  ],
  [
    'cost mismatch',
    (v) => {
      v.runs[1].observations[0].telemetry.pointCost = 2;
    },
  ],
  [
    'changed decision',
    (v) => {
      v.runs[1].result.status = 'indeterminate';
    },
  ],
  [
    'missing variant',
    (v) => {
      v.runs.pop();
    },
  ],
]) {
  test(`cost comparison refuses ${name}`, () => {
    const value = sample();
    change(value);
    assert.throws(() => verifyMeasurement(value), /measurement:/);
  });
}
