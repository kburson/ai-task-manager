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

// #399 — the four timing fields are Text fields (migrated in #398) written as
// fixed-width duration strings ("DDd HHh MMm SSs"), never minutes or float-hours.
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
  { key: 'engagedTime', type: 'text' },
  { key: 'sessionTime', type: 'text' },
  { key: 'reviewTime', type: 'text' },
  { key: 'planTime', type: 'text' },
];

// With secondsByKey: true second precision → duration strings; non-timing
// estimate passes through unchanged as a number.
const durationPlan = buildFieldSyncPlan({
  cfg: timingCfg,
  fieldDefs: timingDefs,
  values: { estimate: 1.5, engagedTime: 24, sessionTime: 23, reviewTime: 1, planTime: 0 },
  secondsByKey: { engagedTime: 1415, sessionTime: 1380, reviewTime: 60, planTime: 0 },
});
assert.deepEqual(durationPlan, [
  { key: 'estimate', type: 'number', fieldId: 'F_EST', value: { number: 1.5 } },
  { key: 'engagedTime', type: 'text', fieldId: 'F_ENG', value: { text: '00d 00h 23m 35s' } },
  { key: 'sessionTime', type: 'text', fieldId: 'F_SES', value: { text: '00d 00h 23m 00s' } },
  { key: 'reviewTime', type: 'text', fieldId: 'F_REV', value: { text: '00d 00h 01m 00s' } },
  { key: 'planTime', type: 'text', fieldId: 'F_PLN', value: { text: '00d 00h 00m 00s' } },
]);
// Every timing field emits a duration string, never a number.
for (const item of durationPlan) {
  if (item.key === 'estimate') continue;
  assert.ok(typeof item.value.text === 'string', `${item.key} emits text`);
  assert.match(item.value.text, /^\d{2}d \d{2}h \d{2}m \d{2}s$/, `${item.key} is DDd HHh MMm SSs`);
  assert.ok(!('number' in item.value), `${item.key} emits no number`);
}

// Fractional seconds are rounded to whole seconds before formatting.
const roundPlan = buildFieldSyncPlan({
  cfg: timingCfg,
  fieldDefs: timingDefs,
  values: {},
  secondsByKey: { engagedTime: 90.6, sessionTime: 90.4 },
});
assert.deepEqual(
  roundPlan.find((p) => p.key === 'engagedTime').value,
  { text: '00d 00h 01m 31s' },
  'engagedTime 90.6s rounds up to 91s'
);
assert.deepEqual(
  roundPlan.find((p) => p.key === 'sessionTime').value,
  { text: '00d 00h 01m 30s' },
  'sessionTime 90.4s rounds down to 90s'
);

// Without secondsByKey (migration tools): fall back to field-DB minutes × 60,
// still emitting duration strings — no call site writes raw minutes or numbers.
const minutesFallback = buildFieldSyncPlan({
  cfg: timingCfg,
  fieldDefs: timingDefs,
  values: { estimate: 2, engagedTime: 90, sessionTime: 90, reviewTime: 5, planTime: 30 },
});
assert.deepEqual(minutesFallback, [
  { key: 'estimate', type: 'number', fieldId: 'F_EST', value: { number: 2 } },
  { key: 'engagedTime', type: 'text', fieldId: 'F_ENG', value: { text: '00d 01h 30m 00s' } },
  { key: 'sessionTime', type: 'text', fieldId: 'F_SES', value: { text: '00d 01h 30m 00s' } },
  { key: 'reviewTime', type: 'text', fieldId: 'F_REV', value: { text: '00d 00h 05m 00s' } },
  { key: 'planTime', type: 'text', fieldId: 'F_PLN', value: { text: '00d 00h 30m 00s' } },
]);

console.log('project-fields.test.mjs: all passed');
