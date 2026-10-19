// @story #1915 #1918
import assert from 'node:assert/strict';
import test from 'node:test';
import { discoverOriginalCases } from '../../../helpers/criteria-revision-transition-profiles.mjs';
import { reportingPartition } from '../../../helpers/criteria-revision-reporting-partition.mjs';

const discovered = discoverOriginalCases();
const expectedA = [
  'criteria-revision-partial-cancel.test.mjs',
  'criteria-revision-partial-final-source.test.mjs',
  'criteria-revision-partial-late-source.test.mjs',
  'native-stage-sentinel-effect-readback-failAfter.test.mjs',
  'native-stage-transition-comment.test.mjs',
].sort();
const expectedB = [
  'criteria-revision-partial-final-authority.test.mjs',
  'criteria-revision-partial-late-authority.test.mjs',
  'criteria-revision-partial-late-input.test.mjs',
  'native-stage-board-effect-readback-failAfter.test.mjs',
  'native-stage-phase-12-prefix-after-effect-readback.test.mjs',
].sort();
const names = (group) => group.map(({ filename }) => filename).sort();

test('reporting partition preserves every actual extracted native case exactly once', () => {
  const { a, b } = reportingPartition(discovered);
  assert.deepEqual(names(a), expectedA);
  assert.deepEqual(names(b), expectedB);
  assert.equal(new Set([...a, ...b].map(({ filename }) => filename)).size, 10);
  for (const item of [...a, ...b]) assert.ok(discovered.includes(item));
});
test('a missing actual native member refuses instead of silently shrinking a group', () => {
  assert.throws(
    () => reportingPartition(discovered.filter(({ filename }) => filename !== expectedA[0])),
    /reporting partition/
  );
});
test('a repeated actual native registration refuses duplicate execution', () => {
  const item = discovered.find(({ filename }) => filename === expectedB[0]);
  assert.throws(() => reportingPartition([...discovered, item]), /reporting partition/);
});
test('an unclassified reporting mode refuses rather than disappearing from qualification', () => {
  assert.throws(
    () =>
      reportingPartition([
        ...discovered,
        { filename: 'new-report.test.mjs', mode: 'partial-reporting-new', fault: null },
      ]),
    /reporting partition/
  );
});
test('empty discovery refuses without claiming a complete partition', () => {
  assert.throws(() => reportingPartition([]), /reporting partition/);
});
