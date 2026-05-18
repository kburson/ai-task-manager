// Zero values must reach the project board. Previously `if (!value) continue`
// silently dropped legitimate 0-minute rollups, leaving stale non-zero data on
// the board. Regression coverage for D3 (issue #159).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFieldSyncPlan } from '../project-fields.mjs';

const cfg = {
  fieldIds: {
    engagedTime: 'PVTF_engaged',
    sessionTime: 'PVTF_session',
    reviewTime: 'PVTF_review',
    estimate: 'PVTF_estimate',
  },
};

const fieldDefs = [
  { key: 'engagedTime', type: 'number' },
  { key: 'sessionTime', type: 'number' },
  { key: 'reviewTime', type: 'number' },
  { key: 'estimate', type: 'number' },
];

test('buildFieldSyncPlan emits a write for value 0', () => {
  const plan = buildFieldSyncPlan({
    cfg,
    fieldDefs,
    values: { engagedTime: 0, sessionTime: 0, reviewTime: 0, estimate: 0 },
  });
  assert.equal(plan.length, 4);
  for (const entry of plan) {
    assert.deepEqual(entry.value, { number: 0 });
  }
});

test('buildFieldSyncPlan skips null and undefined', () => {
  const plan = buildFieldSyncPlan({
    cfg,
    fieldDefs,
    values: { engagedTime: null, sessionTime: undefined, reviewTime: 0, estimate: 3 },
  });
  assert.equal(plan.length, 2);
  const keys = plan.map((p) => p.key).sort();
  assert.deepEqual(keys, ['estimate', 'reviewTime']);
});

test('buildFieldSyncPlan emits non-zero numbers', () => {
  const plan = buildFieldSyncPlan({
    cfg,
    fieldDefs,
    values: { engagedTime: 5, sessionTime: 10, reviewTime: 2, estimate: 3 },
  });
  assert.equal(plan.length, 4);
  const engaged = plan.find((p) => p.key === 'engagedTime');
  assert.deepEqual(engaged.value, { number: 5 });
});

test('buildFieldSyncPlan skips empty-string values', () => {
  const plan = buildFieldSyncPlan({
    cfg,
    fieldDefs,
    values: { engagedTime: '', sessionTime: 0 },
  });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].key, 'sessionTime');
  assert.deepEqual(plan[0].value, { number: 0 });
});
