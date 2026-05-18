#!/usr/bin/env node
// Matrix test for the target-aware child-cannot-lead-epic gate (#162, #176).
//
// Two regimes:
//   - Entry-guard, targets in {refine, plan, develop}: pass iff parentIdx
//     >= targetIdx. A child cannot lead the epic into an early stage.
//   - Arc-guard, targets in {test, review, done}: pass iff parentIdx >=
//     develop. Once the epic is in Develop, children may complete their
//     arc independently (#176 — wave-model requires the epic to remain in
//     Develop until every wave member reaches Done).
//
// Solo issues (no parentEpicNumber) always bypass.
// TASK_TRACKER_FORCE_PROMOTE=1 demotes any refusal to a passing outcome
// carrying an `override` payload so the caller can post the audit comment.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { checkParentAdmission } from '../lib/body-gates.mjs';
import { STATES } from '../state-machine.mjs';

const PROMOTABLE_TARGETS = STATES.filter((s) => s !== 'backlog'); // can't promote to backlog

function stub(value) {
  return async () => value;
}

const DEVELOP_IDX = STATES.indexOf('develop');

function requiredIdxFor(targetIdx) {
  return targetIdx > DEVELOP_IDX ? DEVELOP_IDX : targetIdx;
}

test('matrix: entry-guard (target ≤ develop) refuses unless parent ≥ target; arc-guard (target > develop) refuses unless parent ≥ develop', async () => {
  for (const parentState of STATES) {
    for (const target of PROMOTABLE_TARGETS) {
      const parentIdx = STATES.indexOf(parentState);
      const targetIdx = STATES.indexOf(target);
      const requiredIdx = requiredIdxFor(targetIdx);
      const requiredState = STATES[requiredIdx];
      const expectedPass = parentIdx >= requiredIdx;
      const r = await checkParentAdmission({
        parentEpicNumber: 9000,
        repo: 'o/r',
        projectId: 'P',
        readParentStatus: stub(parentState),
        targetState: target,
      });
      if (expectedPass) {
        assert.deepEqual(
          r,
          [],
          `parent=${parentState} target=${target} should PASS but got: ${JSON.stringify(r)}`
        );
      } else {
        assert.ok(
          Array.isArray(r) && r.length === 1,
          `parent=${parentState} target=${target} should REFUSE (one blocker); got: ${JSON.stringify(r)}`
        );
        assert.equal(r[0].kind, 'parent-admission');
        assert.match(r[0].message, new RegExp(`#9000`));
        assert.match(r[0].message, new RegExp(parentState));
        // refusal message names the *required* floor state, not the literal target.
        const cap = requiredState[0].toUpperCase() + requiredState.slice(1);
        assert.match(r[0].message, new RegExp(cap));
        assert.match(r[0].message, /TASK_TRACKER_FORCE_PROMOTE=1/);
      }
    }
  }
});

test('#176 arc-guard: parent=develop, target ∈ {test, review, done} now admits without override', async () => {
  for (const target of ['test', 'review', 'done']) {
    const r = await checkParentAdmission({
      parentEpicNumber: 9001,
      repo: 'o/r',
      projectId: 'P',
      readParentStatus: stub('develop'),
      targetState: target,
    });
    assert.deepEqual(r, [], `parent=develop target=${target} must admit; got ${JSON.stringify(r)}`);
  }
});

test('#176 arc-guard floor: parent below develop refuses any post-develop target', async () => {
  for (const parentState of ['backlog', 'refine', 'plan']) {
    for (const target of ['test', 'review', 'done']) {
      const r = await checkParentAdmission({
        parentEpicNumber: 9002,
        repo: 'o/r',
        projectId: 'P',
        readParentStatus: stub(parentState),
        targetState: target,
      });
      assert.ok(
        Array.isArray(r) && r.length === 1,
        `parent=${parentState} target=${target} must refuse; got ${JSON.stringify(r)}`
      );
      assert.match(r[0].message, /Develop/);
    }
  }
});

test('#176 entry-guard preserved: parent=refine, child→develop still refuses', async () => {
  const r = await checkParentAdmission({
    parentEpicNumber: 9003,
    repo: 'o/r',
    projectId: 'P',
    readParentStatus: stub('refine'),
    targetState: 'develop',
  });
  assert.ok(Array.isArray(r) && r.length === 1);
  assert.match(r[0].message, /Develop/);
});

test('#176 entry-guard boundary: parent=plan admits child→plan; parent=refine refuses child→plan', async () => {
  const admit = await checkParentAdmission({
    parentEpicNumber: 9004,
    repo: 'o/r',
    projectId: 'P',
    readParentStatus: stub('plan'),
    targetState: 'plan',
  });
  assert.deepEqual(admit, []);
  const refuse = await checkParentAdmission({
    parentEpicNumber: 9004,
    repo: 'o/r',
    projectId: 'P',
    readParentStatus: stub('refine'),
    targetState: 'plan',
  });
  assert.ok(Array.isArray(refuse) && refuse.length === 1);
});

test('override: TASK_TRACKER_FORCE_PROMOTE=1 demotes refusal to override payload', async () => {
  const prev = process.env.TASK_TRACKER_FORCE_PROMOTE;
  process.env.TASK_TRACKER_FORCE_PROMOTE = '1';
  try {
    const r = await checkParentAdmission({
      parentEpicNumber: 42,
      repo: 'o/r',
      projectId: 'P',
      readParentStatus: stub('refine'),
      targetState: 'develop',
    });
    assert.ok(!Array.isArray(r), 'override outcome should be an object, not an array');
    assert.deepEqual(r.blockers, []);
    assert.equal(r.override.parentNumber, 42);
    assert.equal(r.override.parentState, 'refine');
    assert.equal(r.override.targetState, 'develop');
    assert.equal(r.override.reason, 'parent-admission-below-target');
  } finally {
    if (prev === undefined) delete process.env.TASK_TRACKER_FORCE_PROMOTE;
    else process.env.TASK_TRACKER_FORCE_PROMOTE = prev;
  }
});

test('override: unknown parent state under force returns parent-admission-unknown override', async () => {
  const prev = process.env.TASK_TRACKER_FORCE_PROMOTE;
  process.env.TASK_TRACKER_FORCE_PROMOTE = '1';
  try {
    const r = await checkParentAdmission({
      parentEpicNumber: 7,
      repo: 'o/r',
      projectId: 'P',
      readParentStatus: stub(null),
      targetState: 'test',
    });
    assert.deepEqual(r.blockers, []);
    assert.equal(r.override.reason, 'parent-admission-unknown');
    assert.equal(r.override.parentState, 'unknown');
    assert.equal(r.override.targetState, 'test');
  } finally {
    if (prev === undefined) delete process.env.TASK_TRACKER_FORCE_PROMOTE;
    else process.env.TASK_TRACKER_FORCE_PROMOTE = prev;
  }
});

test('unknown targetState throws (fail-closed)', async () => {
  await assert.rejects(
    () =>
      checkParentAdmission({
        parentEpicNumber: 1,
        repo: 'o/r',
        projectId: 'P',
        readParentStatus: stub('develop'),
        targetState: 'bogus',
      }),
    /unknown targetState "bogus"/
  );
});

test('solo issue (parentEpicNumber=null) bypasses regardless of targetState', async () => {
  for (const target of PROMOTABLE_TARGETS) {
    const r = await checkParentAdmission({
      parentEpicNumber: null,
      repo: 'o/r',
      projectId: 'P',
      readParentStatus: stub('backlog'),
      targetState: target,
    });
    assert.deepEqual(r, [], `solo target=${target} should bypass; got: ${JSON.stringify(r)}`);
  }
});
