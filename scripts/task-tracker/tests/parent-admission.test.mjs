#!/usr/bin/env node
// @story #83
// Unit tests for the parent-admission gate.
//
// Covers:
//   - solo bypass (no parentEpicNumber)
//   - refuse for each pre-Development parent state
//   - pass for each Development-or-later parent state
//   - unknown parent state (reader returns null) refuses with explicit message
//   - reader throws -> error propagates (fail-closed)
//
// The verb wire-up tests (formerly tests 7-11) were dropped in #98: the
// `analyze` and old plan→develop `approve` verbs they exercised were retired.
// The gate predicate itself is fully covered by tests 1-6 below.

import { strict as assert } from 'node:assert';
import { checkParentAdmission } from '../lib/body-gates.mjs';

function stubReader(value) {
  return async () => value;
}

// 1. Solo bypass — no parentEpicNumber, reader is never called.
{
  let called = false;
  const reader = async () => {
    called = true;
    return 'refine';
  };
  const r = await checkParentAdmission({
    parentEpicNumber: null,
    repo: 'o/r',
    projectId: 'P',
    readParentStatus: reader,
  });
  assert.deepEqual(r, [], 'solo issue should produce no refusals');
  assert.equal(called, false, 'reader must not be called when parent is null');
}

// 2. Refuse for each pre-Development parent state.
for (const state of ['backlog', 'refine', 'plan']) {
  const r = await checkParentAdmission({
    parentEpicNumber: 61,
    repo: 'o/r',
    projectId: 'P',
    readParentStatus: stubReader(state),
  });
  assert.equal(r.length, 1, `expected one refusal for parent state ${state}`);
  assert.equal(r[0].kind, 'parent-admission');
  assert.match(r[0].message, /parent #61/, `message must name parent #61, got: ${r[0].message}`);
  assert.match(
    r[0].message,
    new RegExp(state),
    `message must name parent state ${state}, got: ${r[0].message}`
  );
  assert.match(r[0].message, /advance the epic to Develop first \(child cannot lead parent\)/);
}

// 3. Pass for each Development-or-later parent state.
for (const state of ['develop', 'test', 'review', 'done']) {
  const r = await checkParentAdmission({
    parentEpicNumber: 61,
    repo: 'o/r',
    projectId: 'P',
    readParentStatus: stubReader(state),
  });
  assert.deepEqual(r, [], `parent in ${state} should produce no refusals`);
}

// 4. Unknown parent state (reader returns null) refuses with 'unknown' message.
{
  const r = await checkParentAdmission({
    parentEpicNumber: 61,
    repo: 'o/r',
    projectId: 'P',
    readParentStatus: stubReader(null),
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, 'parent-admission');
  assert.match(r[0].message, /unknown/i);
  assert.match(r[0].message, /parent #61/);
}

// 5. Reader throws -> error propagates (fail-closed).
{
  const reader = async () => {
    throw new Error('graphql down');
  };
  await assert.rejects(
    () =>
      checkParentAdmission({
        parentEpicNumber: 61,
        repo: 'o/r',
        projectId: 'P',
        readParentStatus: reader,
      }),
    /graphql down/
  );
}

// 6. Case-insensitive parent state matching (defensive — board may return mixed case).
{
  const r = await checkParentAdmission({
    parentEpicNumber: 61,
    repo: 'o/r',
    projectId: 'P',
    readParentStatus: stubReader('Develop'),
  });
  assert.deepEqual(r, [], 'Develop (capitalised) should pass');
}

console.log('parent-admission.test.mjs: all passed');
