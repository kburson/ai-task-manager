#!/usr/bin/env node
// Matrix test for the wave-admission parent-admission gate (#162, #176, #195).
//
// Rule:
//   - target = refine: pass iff parentIdx >= refineIdx. Children may sit in
//     Refine alongside the parent epic during grooming.
//   - target in {plan, develop, test, review, done}: pass iff parentIdx >=
//     developIdx. A child cannot enter Plan or beyond until the epic has
//     cleared its own Plan stage and entered Develop.
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

const REFINE_IDX = STATES.indexOf('refine');
const DEVELOP_IDX = STATES.indexOf('develop');

function requiredIdxFor(target) {
  return target === 'refine' ? REFINE_IDX : DEVELOP_IDX;
}

test('matrix: target=refine requires parent>=refine; all other targets require parent>=develop', async () => {
  for (const parentState of STATES) {
    for (const target of PROMOTABLE_TARGETS) {
      const parentIdx = STATES.indexOf(parentState);
      const requiredIdx = requiredIdxFor(target);
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
        const cap = requiredState[0].toUpperCase() + requiredState.slice(1);
        assert.match(r[0].message, new RegExp(cap));
        assert.match(r[0].message, /TASK_TRACKER_FORCE_PROMOTE=1/);
      }
    }
  }
});

test('child→plan refused when parent in Plan (the deadlock case)', async () => {
  const r = await checkParentAdmission({
    parentEpicNumber: 192,
    repo: 'o/r',
    projectId: 'P',
    readParentStatus: stub('plan'),
    targetState: 'plan',
  });
  assert.ok(Array.isArray(r) && r.length === 1, `expected refusal; got ${JSON.stringify(r)}`);
  assert.match(r[0].message, /Develop/);
  assert.match(r[0].message, /child cannot lead parent/);
});

test('child→plan admitted when parent in Develop', async () => {
  const r = await checkParentAdmission({
    parentEpicNumber: 9001,
    repo: 'o/r',
    projectId: 'P',
    readParentStatus: stub('develop'),
    targetState: 'plan',
  });
  assert.deepEqual(r, []);
});

test('child→refine admitted when parent in Refine (grooming together)', async () => {
  const r = await checkParentAdmission({
    parentEpicNumber: 9002,
    repo: 'o/r',
    projectId: 'P',
    readParentStatus: stub('refine'),
    targetState: 'refine',
  });
  assert.deepEqual(r, []);
});

test('arc-guard: parent=develop admits child→{test,review,done}', async () => {
  for (const target of ['test', 'review', 'done']) {
    const r = await checkParentAdmission({
      parentEpicNumber: 9003,
      repo: 'o/r',
      projectId: 'P',
      readParentStatus: stub('develop'),
      targetState: target,
    });
    assert.deepEqual(r, [], `parent=develop target=${target} must admit; got ${JSON.stringify(r)}`);
  }
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
