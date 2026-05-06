import assert from 'node:assert/strict';
import { buildFieldSyncPlan, valueForProjectField } from '../project-fields.mjs';

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
  { key: 'priority', type: 'single_select', fieldId: 'F_PRI', value: { singleSelectOptionName: 'P2' } },
]);

console.log('project-fields.test.mjs: all passed');

