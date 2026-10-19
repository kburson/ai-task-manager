// @story #1915 #1918
import assert from 'node:assert/strict';
const groupA = [
  'criteria-revision-partial-cancel.test.mjs',
  'criteria-revision-partial-final-source.test.mjs',
  'criteria-revision-partial-late-source.test.mjs',
  'native-stage-sentinel-effect-readback-failAfter.test.mjs',
  'native-stage-transition-comment.test.mjs',
];
const groupB = [
  'criteria-revision-partial-final-authority.test.mjs',
  'criteria-revision-partial-late-authority.test.mjs',
  'criteria-revision-partial-late-input.test.mjs',
  'native-stage-board-effect-readback-failAfter.test.mjs',
  'native-stage-phase-12-prefix-after-effect-readback.test.mjs',
];
export function reportingPartition(discovered) {
  const baseModes = new Set([
    'partial-reporting-14',
    'partial-reporting-15',
    'partial-reporting-16',
    'partial-reporting-unknown',
  ]);
  const originalNames = [
    'native-stage-phase-12-prefix-after-effect-readback.test.mjs',
    'native-stage-board-effect-readback-failAfter.test.mjs',
    'native-stage-sentinel-effect-readback-failAfter.test.mjs',
    'native-stage-transition-comment.test.mjs',
  ];
  const selected = discovered.filter(
    ({ filename, mode }) =>
      (mode.startsWith('partial-reporting-') && !baseModes.has(mode)) ||
      originalNames.includes(filename)
  );
  assert.deepEqual(
    selected.map(({ filename }) => filename).sort(),
    [...groupA, ...groupB].sort(),
    'reporting partition requires the exact nonempty, duplicate-free original population'
  );
  return {
    a: discovered.filter(({ filename }) => groupA.includes(filename)),
    b: discovered.filter(({ filename }) => groupB.includes(filename)),
  };
}
