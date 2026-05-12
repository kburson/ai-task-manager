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

console.log('project-fields.test.mjs: all passed');
