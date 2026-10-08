// @story #1855
import test from 'node:test';
import assert from 'node:assert/strict';
import * as scheduling from '../../../../run-tests-schedule.mjs';

const base = 'scripts/tests/integration/task-tracker/lib/';
const entry = (direction, suffix) => ({
  label: base + `native-stage-phase-12-prefix-${direction}-${suffix}.test.mjs`,
  nativeMetadata: {
    mode: 'phase-12-prefix',
    when: direction === 'before' ? 'failBefore' : 'failAfter',
    suffix,
  },
});
test('semantic serial planner keeps all exact phase intent members and ordinary cases in distinct bounded sections', () => {
  assert.equal(typeof scheduling.planSerialSections, 'function');
  const ordinary = { label: base + 'ordinary.test.mjs' };
  const members = [
    entry('before', 'intent-write'),
    entry('after', 'intent-write'),
    entry('before', 'intent-readback'),
    entry('after', 'intent-readback'),
  ];
  const planned = scheduling.planSerialSections([ordinary, ...members]);
  assert.deepEqual(
    planned.map((s) => s.name),
    ['native/phase-12/intent', 'serial']
  );
  assert.deepEqual(planned[0].entries, members);
  assert.deepEqual(planned[1].entries, [ordinary]);
  assert.equal(new Set(planned.flatMap((s) => s.entries)).size, 5);
});
test('semantic serial planner rejects unknown native membership and malformed or substituted registration data', () => {
  assert.equal(typeof scheduling.planSerialSections, 'function');
  const original = entry('before', 'intent-write');
  for (const changed of [
    { ...original, label: base + 'native-unclassified.test.mjs' },
    { ...original, nativeMetadata: undefined },
    { ...original, nativeMetadata: { ...original.nativeMetadata, mode: 'unknown' } },
    { ...original, nativeMetadata: { ...original.nativeMetadata, when: 'maybe' } },
    { ...original, nativeMetadata: { ...original.nativeMetadata, suffix: 'other' } },
    { ...original, nativeMetadata: { ...original.nativeMetadata, ready: true } },
    { ...original, nativeMetadata: { ...original.nativeMetadata, when: 'failAfter' } },
  ])
    assert.throws(() => scheduling.planSerialSections([changed]), /native|metadata|section/);
  assert.throws(() => scheduling.planSerialSections([original, original]), /duplicate/);
});

import { parseNativeSerialRegistration } from '../../../../run-tests-native-sections.mjs';
const wrapper = (fault) =>
  `// @story #1855\nimport { registerNativeStageCase } from './native-stage-continuation-fixture.mjs';\nregisterNativeStageCase("phase-12-prefix", import.meta.url, ${fault});\n`;
test('closed registration syntax rejects duplicate fault keys and executable or partial wrappers', () => {
  assert.deepEqual(
    parseNativeSerialRegistration(wrapper('{"when":"failBefore","suffix":"intent-write"}')),
    { mode: 'phase-12-prefix', when: 'failBefore', suffix: 'intent-write' }
  );
  for (const source of [
    wrapper('{"when":"failBefore","when":"failBefore","suffix":"intent-write"}'),
    wrapper('{"when":"failBefore","suffix":"intent-write","ready":true}'),
    wrapper('{"when":"failBefore","suffix":"not-intent"}'),
    wrapper('{"when":"failBefore","suffix":"intent-write"}') + 'doSomething();',
    wrapper('{"when":"failBefore","suffix":"intent-write"}').replace(
      'import.meta.url',
      'callerUrl'
    ),
  ])
    assert.throws(() => parseNativeSerialRegistration(source), /metadata/);
});

test('actual scheduler executes semantic sections sequentially and records ordered measured section membership', async () => {
  const ordinary = { label: 'scripts/tests/integration/ordinary.test.mjs' };
  const native = entry('before', 'intent-write');
  const events = [];
  let clock = 0n;
  const result = await scheduling.runTestPhases({
    pooledEntries: [{ label: 'unit/pure.test.mjs' }],
    subprocessEntries: [],
    slowParallelEntries: [],
    serialEntries: [ordinary, native],
    pooledConcurrency: 1,
    subprocessConcurrency: 1,
    now: () => (clock += 1000000n),
    runOne: async (value) => {
      events.push(value.label);
      return value.label;
    },
  });
  assert.deepEqual(events, ['unit/pure.test.mjs', native.label, ordinary.label]);
  assert.deepEqual(
    result.serialResults,
    [ordinary.label, native.label],
    'result association retains canonical input order'
  );
  assert.deepEqual(result.executionSections, [
    { name: 'pooled', files: ['unit/pure.test.mjs'], elapsedMs: 1 },
    { name: 'native/phase-12/intent', files: [native.label], elapsedMs: 1 },
    { name: 'serial', files: [ordinary.label], elapsedMs: 1 },
  ]);
  assert.ok(result.serialElapsedMs >= 2, 'aggregate remains separately observed');
});

test('native formatted fault literals retain the same closed registration as original JSON', () => {
  const expected = { mode: 'phase-12-prefix', when: 'failBefore', suffix: 'intent-write' };
  assert.deepEqual(
    parseNativeSerialRegistration(wrapper('{"when":"failBefore","suffix":"intent-write"}')),
    expected
  );
  assert.deepEqual(
    parseNativeSerialRegistration(wrapper("{ when: 'failBefore', suffix: 'intent-write', }")),
    expected
  );
  assert.deepEqual(
    parseNativeSerialRegistration(wrapper("{ 'suffix': 'intent-write', when: 'failBefore' }")),
    expected
  );
});

test('native fault literal parsing rejects executable and ambiguous property forms', () => {
  for (const fault of [
    "{ ['when']: 'failBefore', suffix: 'intent-write' }",
    "{ when: 'failBefore', when: 'failAfter', suffix: 'intent-write' }",
    "{ when, suffix: 'intent-write' }",
    "{ ...other, when: 'failBefore', suffix: 'intent-write' }",
    "{ get when() { return 'failBefore'; }, suffix: 'intent-write' }",
    "{ when() { return 'failBefore'; }, suffix: 'intent-write' }",
    "{ when: `failBefore`, suffix: 'intent-write' }",
    "{ when: caller(), suffix: 'intent-write' }",
    "{ when: 'fail' + 'Before', suffix: 'intent-write' }",
    "{ when: 'failBefore', suffix: 'intent-write', ready: true }",
    "{ when: null, suffix: 'intent-write' }",
  ])
    assert.throws(() => parseNativeSerialRegistration(wrapper(fault)), /metadata/);
});
