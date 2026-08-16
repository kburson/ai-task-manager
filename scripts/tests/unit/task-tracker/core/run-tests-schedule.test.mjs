// @story #1208
import assert from 'node:assert/strict';
import test from 'node:test';

import { partitionTestEntries, runTestPhases } from '../../../../run-tests-schedule.mjs';

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

test('runTestPhases preserves pure then subprocess then exclusive barriers', async () => {
  const events = [];
  const runOne = async (entry) => {
    events.push(`start:${entry}`);
    await new Promise((resolve) => setTimeout(resolve, 2));
    events.push(`end:${entry}`);
    return `result:${entry}`;
  };

  const result = await runTestPhases({
    pooledEntries: ['pure-a', 'pure-b'],
    subprocessEntries: ['sub-a', 'sub-b'],
    serialEntries: ['serial-a', 'serial-b'],
    pooledConcurrency: 2,
    subprocessConcurrency: 2,
    runOne,
  });

  const lastPureEnd = Math.max(events.indexOf('end:pure-a'), events.indexOf('end:pure-b'));
  const firstSubStart = Math.min(events.indexOf('start:sub-a'), events.indexOf('start:sub-b'));
  const lastSubEnd = Math.max(events.indexOf('end:sub-a'), events.indexOf('end:sub-b'));
  const firstSerialStart = events.indexOf('start:serial-a');
  assert.ok(lastPureEnd < firstSubStart, `pure/subprocess barrier missing: ${events.join(',')}`);
  assert.ok(
    lastSubEnd < firstSerialStart,
    `subprocess/serial barrier missing: ${events.join(',')}`
  );
  assert.ok(events.indexOf('end:serial-a') < events.indexOf('start:serial-b'));
  assert.deepEqual(result.pooledResults, ['result:pure-a', 'result:pure-b']);
  assert.deepEqual(result.subprocessResults, ['result:sub-a', 'result:sub-b']);
  assert.deepEqual(result.serialResults, ['result:serial-a', 'result:serial-b']);
  assert.equal(result.pooledPeakConcurrency, 2);
  assert.equal(result.subprocessPeakConcurrency, 2);
});
