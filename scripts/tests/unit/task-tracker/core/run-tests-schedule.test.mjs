// @story #1208
import assert from 'node:assert/strict';
import test from 'node:test';

import { partitionTestEntries } from '../../../../run-tests-schedule.mjs';

test('partitionTestEntries routes only unit entries into concurrent phases', () => {
  const entries = [
    { label: 'unit/pure-a.test.mjs', class: 'pooled' },
    { label: 'unit/sub-a.test.mjs', class: 'subprocess' },
    { label: 'integration/pure.test.mjs', class: 'pooled' },
    { label: 'unit/marked.test.mjs', class: 'serial' },
    { label: 'slow/sub.test.mjs', class: 'subprocess' },
    { label: 'unit/pure-b.test.mjs', class: 'pooled' },
    { label: 'unit/sub-b.test.mjs', class: 'subprocess' },
  ];
  const result = partitionTestEntries(entries, {
    laneOfEntry: (entry) => entry.label.split('/')[0],
    classify: (entry) => entry.class,
  });

  assert.deepEqual(
    result.pooledEntries.map((entry) => entry.label),
    ['unit/pure-a.test.mjs', 'unit/pure-b.test.mjs']
  );
  assert.deepEqual(
    result.subprocessEntries.map((entry) => entry.label),
    ['unit/sub-a.test.mjs', 'unit/sub-b.test.mjs']
  );
  assert.deepEqual(
    result.serialEntries.map((entry) => entry.label),
    ['integration/pure.test.mjs', 'unit/marked.test.mjs', 'slow/sub.test.mjs']
  );
});

test('partitionTestEntries rejects unknown classifier output fail-closed', () => {
  assert.throws(
    () =>
      partitionTestEntries([{ label: 'unit/unknown.test.mjs' }], {
        laneOfEntry: () => 'unit',
        classify: () => 'unknown',
      }),
    /unknown scheduling class/
  );
});
