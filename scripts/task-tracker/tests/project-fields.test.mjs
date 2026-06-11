import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFieldSyncPlan, valueForProjectField } from '../project-fields.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultDefs = JSON.parse(
  readFileSync(path.join(here, '../../../config/project-fields.default.json'), 'utf8')
);
const keys = defaultDefs.map((d) => d.key);
assert.ok(keys.includes('reviewTime'), 'default field defs include reviewTime');
assert.ok(!keys.includes('contextLength'), 'default field defs no longer include contextLength');

assert.deepEqual(valueForProjectField(12, 'number'), { number: 12 });
assert.deepEqual(valueForProjectField('2026-05-06', 'date'), { date: '2026-05-06' });
assert.deepEqual(valueForProjectField('P1', 'single_select'), { singleSelectOptionName: 'P1' });
assert.equal(valueForProjectField('not-a-date', 'date'), null);

const cfg = {
  fieldIds: {
    estimate: 'F_EST',
    priority: 'F_PRI',
  },
};
const defs = [
  { key: 'estimate', type: 'number' },
  { key: 'priority', type: 'single_select' },
  { key: 'missing', type: 'number' },
];
const plan = buildFieldSyncPlan({
  cfg,
  fieldDefs: defs,
  values: { estimate: 4, priority: 'P2', missing: 1 },
});
assert.deepEqual(plan, [
  { key: 'estimate', type: 'number', fieldId: 'F_EST', value: { number: 4 } },
  {
    key: 'priority',
    type: 'single_select',
    fieldId: 'F_PRI',
    value: { singleSelectOptionName: 'P2' },
  },
]);

// #230 — the four timing fields are written in float-HOURS, never minutes.
const timingCfg = {
  fieldIds: {
    estimate: 'F_EST',
    engagedTime: 'F_ENG',
    sessionTime: 'F_SES',
    reviewTime: 'F_REV',
    planTime: 'F_PLN',
  },
};
const timingDefs = [
  { key: 'estimate', type: 'number' },
  { key: 'engagedTime', type: 'number' },
  { key: 'sessionTime', type: 'number' },
  { key: 'reviewTime', type: 'number' },
  { key: 'planTime', type: 'number' },
];

// With secondsByKey: true second precision → float-hours; non-timing estimate
// passes through unchanged.
const hoursPlan = buildFieldSyncPlan({
  cfg: timingCfg,
  fieldDefs: timingDefs,
  values: { estimate: 1.5, engagedTime: 24, sessionTime: 23, reviewTime: 1, planTime: 0 },
  secondsByKey: { engagedTime: 1415, sessionTime: 1380, reviewTime: 60, planTime: 0 },
});
assert.deepEqual(hoursPlan, [
  { key: 'estimate', type: 'number', fieldId: 'F_EST', value: { number: 1.5 } },
  { key: 'engagedTime', type: 'number', fieldId: 'F_ENG', value: { number: 0.39306 } },
  { key: 'sessionTime', type: 'number', fieldId: 'F_SES', value: { number: 0.38333 } },
  { key: 'reviewTime', type: 'number', fieldId: 'F_REV', value: { number: 0.01667 } },
  { key: 'planTime', type: 'number', fieldId: 'F_PLN', value: { number: 0 } },
]);

// Without secondsByKey (migration tools): fall back to field-DB minutes × 60,
// still emitting float-hours — no call site writes raw minutes.
const minutesFallback = buildFieldSyncPlan({
  cfg: timingCfg,
  fieldDefs: timingDefs,
  values: { estimate: 2, engagedTime: 90, sessionTime: 90, reviewTime: 5, planTime: 30 },
});
assert.deepEqual(minutesFallback, [
  { key: 'estimate', type: 'number', fieldId: 'F_EST', value: { number: 2 } },
  { key: 'engagedTime', type: 'number', fieldId: 'F_ENG', value: { number: 1.5 } },
  { key: 'sessionTime', type: 'number', fieldId: 'F_SES', value: { number: 1.5 } },
  { key: 'reviewTime', type: 'number', fieldId: 'F_REV', value: { number: 0.08333 } },
  { key: 'planTime', type: 'number', fieldId: 'F_PLN', value: { number: 0.5 } },
]);

console.log('project-fields.test.mjs: all passed');
