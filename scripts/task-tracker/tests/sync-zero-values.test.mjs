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

// #399 — the three timing fields are Text fields written as duration strings;
// estimate stays a Number field.
const fieldDefs = [
  { key: 'engagedTime', type: 'text' },
  { key: 'sessionTime', type: 'text' },
  { key: 'reviewTime', type: 'text' },
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
    if (entry.key === 'estimate') {
      assert.deepEqual(entry.value, { number: 0 });
    } else {
      assert.deepEqual(entry.value, { text: '00d 00h 00m 00s' });
    }
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

test('buildFieldSyncPlan emits duration strings for non-zero timing', () => {
  const plan = buildFieldSyncPlan({
    cfg,
    fieldDefs,
    values: { engagedTime: 5, sessionTime: 10, reviewTime: 2, estimate: 3 },
  });
  assert.equal(plan.length, 4);
  // #399 — the three timing fields are formatted as duration strings
  // (minutes×60 → seconds in the no-secondsByKey fallback path); estimate
  // passes through as-is.
  const engaged = plan.find((p) => p.key === 'engagedTime');
  assert.deepEqual(engaged.value, { text: '00d 00h 05m 00s' }); // 5 min
  const session = plan.find((p) => p.key === 'sessionTime');
  assert.deepEqual(session.value, { text: '00d 00h 10m 00s' }); // 10 min
  const review = plan.find((p) => p.key === 'reviewTime');
  assert.deepEqual(review.value, { text: '00d 00h 02m 00s' }); // 2 min
  const estimate = plan.find((p) => p.key === 'estimate');
  assert.deepEqual(estimate.value, { number: 3 }); // non-timing, unchanged
});

test('buildFieldSyncPlan skips empty-string values', () => {
  const plan = buildFieldSyncPlan({
    cfg,
    fieldDefs,
    values: { engagedTime: '', sessionTime: 0 },
  });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].key, 'sessionTime');
  assert.deepEqual(plan[0].value, { text: '00d 00h 00m 00s' });
});
