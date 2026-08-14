#!/usr/bin/env node
// @story #337
// Unit tests for develop-epic-children-done-guard (#337).
//
// The guard wraps `developEpicTestChildrenGate` from epic-children-gate.mjs.
// Mirrors the test layout of guard-registry-plan-exit / plan-epic-children-
// guard's coverage but scoped to the develop → test transition.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  developExitEpicChildrenDoneGuard,
  GUARD_ID,
} from '../../../../task-tracker/lib/develop-epic-children-done-guard.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

test('guard exposes the expected id', () => {
  assert.equal(developExitEpicChildrenDoneGuard.id, 'develop-exit-epic-children-done');
  assert.equal(GUARD_ID, 'develop-exit-epic-children-done');
});

test('short-circuits when toState is not "test" (e.g. rollback to plan)', async () => {
  const result = await developExitEpicChildrenDoneGuard.run({
    cfg,
    issueNumber: 999,
    toState: 'plan',
    deps: {
      developEpicTestChildrenGate: async () => {
        throw new Error('gate should not be called');
      },
    },
  });
  assert.deepEqual(result, { ok: true });
});

test('short-circuits when ctx is missing cfg', async () => {
  const result = await developExitEpicChildrenDoneGuard.run({
    issueNumber: 999,
    toState: 'test',
  });
  assert.deepEqual(result, { ok: true });
});

test('short-circuits when ctx is missing issueNumber', async () => {
  const result = await developExitEpicChildrenDoneGuard.run({
    cfg,
    toState: 'test',
  });
  assert.deepEqual(result, { ok: true });
});

test('passes when gate returns ok (leaf or all-children-done)', async () => {
  const result = await developExitEpicChildrenDoneGuard.run({
    cfg,
    issueNumber: 100,
    toState: 'test',
    deps: {
      developEpicTestChildrenGate: async () => ({ ok: true, children: [] }),
    },
  });
  assert.deepEqual(result, { ok: true });
});

test('surfaces gate refusal with reason + blockers', async () => {
  const blockers = [
    'epic-children-not-terminal: every required child must be Done or closed with an accepted terminal disposition before the epic promotes to Test: #101 (state=develop), #102 (state=plan)',
  ];
  const result = await developExitEpicChildrenDoneGuard.run({
    cfg,
    issueNumber: 100,
    toState: 'test',
    deps: {
      developEpicTestChildrenGate: async () => ({ ok: false, blockers }),
    },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.blockers, blockers);
  assert.equal(result.reason, blockers[0]);
});

test('omitted toState (legacy call site) still invokes the gate', async () => {
  // Older runGuards call sites that pre-date the toState propagation pass
  // ctx without toState. The guard must NOT short-circuit in that case
  // (otherwise the rule would be silently bypassed everywhere). It only
  // short-circuits when toState is *present and not "test"*.
  let called = false;
  await developExitEpicChildrenDoneGuard.run({
    cfg,
    issueNumber: 100,
    deps: {
      developEpicTestChildrenGate: async () => {
        called = true;
        return { ok: true };
      },
    },
  });
  assert.equal(called, true);
});

test('defaults reason to generic key when gate omits blockers', async () => {
  const result = await developExitEpicChildrenDoneGuard.run({
    cfg,
    issueNumber: 100,
    toState: 'test',
    deps: {
      developEpicTestChildrenGate: async () => ({ ok: false }),
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'epic-children-not-terminal');
  assert.deepEqual(result.blockers, []);
});
