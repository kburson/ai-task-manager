// @story #1413
// TIA still reaches the CI-only integration lane.
//
// #1413 took the integration lane out of the local composite lanes, which is a
// real reduction in local signal. It is only acceptable because of a second
// guarantee: when a story touches code that a heavy-system test exercises, the
// test-impact selector pulls that test back into Develop, before the change ever
// reaches CI. CI gates delivery; TIA gates CI.
//
// That guarantee is load-bearing for the whole test-architecture direction, and
// it is currently implicit — `selectAffectedTests` resolves candidates from the
// full discovered set and consults `laneOf` only to escalate a lane, never to
// filter direct selection. Implicit is fine until someone adds a lane filter for
// a good-looking reason. This test makes it explicit.

import assert from 'node:assert/strict';
import test from 'node:test';

import { laneOf } from '../../../task-tracker/lib/test-lanes.mjs';
import { selectAffectedTests } from '../../../task-tracker/lib/test-impact-selector.mjs';

const PROJECT_DIR = process.cwd();

// A relocated file: it imports the module under test directly, so a change to
// that module must select it.
const INTEGRATION_TEST = 'scripts/tests/integration/task-tracker/lib/action-capture.test.mjs';
const ITS_SOURCE = 'scripts/task-tracker/lib/scratch-dir.mjs';

test('the fixture really is in the CI-only integration lane', () => {
  // If this file is ever moved back to the unit lane, the case below would still
  // pass while proving nothing. Pin the premise.
  assert.equal(laneOf(INTEGRATION_TEST), 'integration');
});

test('changing a source file selects the integration-lane test that exercises it', () => {
  const selection = selectAffectedTests({
    projectDir: PROJECT_DIR,
    changedPaths: [ITS_SOURCE],
  });
  assert.ok(
    selection.tests.includes(INTEGRATION_TEST),
    `TIA must pull ${INTEGRATION_TEST} into Develop when ${ITS_SOURCE} changes; ` +
      `selected ${selection.tests.length} tests without it`
  );
});

test('editing an integration test selects itself', () => {
  const selection = selectAffectedTests({
    projectDir: PROJECT_DIR,
    changedPaths: [INTEGRATION_TEST],
  });
  assert.ok(selection.tests.includes(INTEGRATION_TEST));
});

test('selection is not filtered to the unit lane', () => {
  // The regression this guards: a well-meaning "only run local lanes" filter
  // that silently drops every integration candidate.
  const selection = selectAffectedTests({
    projectDir: PROJECT_DIR,
    changedPaths: [ITS_SOURCE, 'scripts/task-tracker/lib/scratch-dir.mjs'],
  });
  const lanes = new Set(selection.tests.map((file) => laneOf(file)));
  assert.ok(
    lanes.has('integration'),
    `expected at least one integration-lane test in the selection; got lanes ${[...lanes].join(', ')}`
  );
});
