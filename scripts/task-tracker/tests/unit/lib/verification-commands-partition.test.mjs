// @story #1158
//
// `partitionVerificationCommands` gained the `includeCompleteLanes` switch. The
// contract these tests pin is deliberately narrow: the default must be
// indistinguishable from the pre-#1158 function for every caller, and the only
// bucket the switch may touch is `completeLanes`.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  COMPLETE_TEST_LANES,
  partitionVerificationCommands,
} from '../../../lib/verification-commands.mjs';

const COMMANDS = [
  'npm run lint',
  'npm run format:check',
  'npm run test:all',
  'node --test focused.test.mjs',
];
const REUSABLE = ['lint-full', 'format-full'];

test('omitting includeCompleteLanes keeps the full lane floor (pre-#1158 behavior)', () => {
  const partition = partitionVerificationCommands({
    commands: COMMANDS,
    reusableClassifications: REUSABLE,
  });
  assert.deepEqual(
    partition.completeLanes.map(({ classification }) => classification),
    ['test-unit', 'test-integration', 'test-slow']
  );
  assert.deepEqual(
    partition.completeLanes.map(({ command }) => command),
    ['npm run test:unit', 'npm run test:integration', 'npm run test:slow']
  );
});

test('includeCompleteLanes:true is byte-identical to omitting it', () => {
  const implicit = partitionVerificationCommands({
    commands: COMMANDS,
    reusableClassifications: REUSABLE,
  });
  const explicit = partitionVerificationCommands({
    commands: COMMANDS,
    reusableClassifications: REUSABLE,
    includeCompleteLanes: true,
  });
  assert.deepEqual(explicit, implicit);
});

test('includeCompleteLanes:false empties completeLanes and touches nothing else', () => {
  const kept = partitionVerificationCommands({
    commands: COMMANDS,
    reusableClassifications: REUSABLE,
  });
  const dropped = partitionVerificationCommands({
    commands: COMMANDS,
    reusableClassifications: REUSABLE,
    includeCompleteLanes: false,
  });
  assert.deepEqual(dropped.completeLanes, []);
  assert.deepEqual(dropped.reused, kept.reused);
  assert.deepEqual(dropped.targeted, kept.targeted);
  assert.deepEqual(dropped.compatibility, kept.compatibility);
});

test('a dropped lane set still reports the legacy aggregate as declared', () => {
  // The caller needs this to fail loud: an aggregate whose verdict is derived
  // from the lanes must remain visible after the lanes are gone.
  const partition = partitionVerificationCommands({
    commands: ['npm run test:all'],
    includeCompleteLanes: false,
  });
  assert.deepEqual(
    partition.compatibility.map(({ command }) => command),
    ['npm run test:all']
  );
});

test('the returned lanes are copies, so a caller cannot mutate the shared floor', () => {
  const partition = partitionVerificationCommands({ commands: [] });
  partition.completeLanes[0].command = 'npm run mischief';
  assert.equal(COMPLETE_TEST_LANES[0].command, 'npm run test:unit');
  assert.equal(
    partitionVerificationCommands({ commands: [] }).completeLanes[0].command,
    'npm run test:unit'
  );
});
