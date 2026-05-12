#!/usr/bin/env node
// Unit tests for the parent-admission gate.
//
// Covers:
//   - solo bypass (no parentEpicNumber)
//   - refuse for each pre-Development parent state
//   - pass for each Development-or-later parent state
//   - unknown parent state (reader returns null) refuses with explicit message
//   - reader throws -> error propagates (fail-closed)

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
  assert.match(r[0].message, /advance the epic to Develop first/);
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

// 7. Wire-up: analyze verb refuses when parent is in pre-Development state.
{
  const { runAnalyze } = await import('../verbs/analyze.mjs');
  let moveCalled = false;
  const result = await runAnalyze({
    issueNumber: 83,
    cfg: { repo: 'o/r', projectId: 'P' },
    deps: {
      fetchIssueContext: async () => ({
        title: 'sub-issue',
        body: '## Acceptance Criteria\n## Definition of Done\n## Pickup Directive\n<!-- aitm-fields: -->',
        labels: ['x'],
        parentEpicNumber: 61,
        isEpic: false,
      }),
      resolveFieldValues: async () => ({ estimate: 1, size: 'S', priority: 'P1', sequence: 1.3 }),
      admit: async () => ({ ok: true, blockers: [] }),
      fetchSubIssueStates: async () => [],
      readParentStatus: stubReader('refine'),
      moveState: async () => {
        moveCalled = true;
        return 0;
      },
    },
  });
  assert.equal(result.ok, false, 'analyze must refuse when parent is in groom');
  assert.equal(moveCalled, false, 'move-state must not be invoked on refusal');
  assert.ok(
    result.blockers.some((b) => b.kind === 'parent-admission' && /#61/.test(b.message)),
    `expected parent-admission blocker, got ${JSON.stringify(result.blockers)}`
  );
}

// 8. Wire-up: analyze verb passes when parent is in Development.
{
  const { runAnalyze } = await import('../verbs/analyze.mjs');
  let moveCalled = false;
  const result = await runAnalyze({
    issueNumber: 83,
    cfg: { repo: 'o/r', projectId: 'P' },
    deps: {
      fetchIssueContext: async () => ({
        title: 'sub-issue',
        body: '## Acceptance Criteria\n## Definition of Done\n## Pickup Directive\n<!-- aitm-fields: -->',
        labels: ['x'],
        parentEpicNumber: 61,
        isEpic: false,
      }),
      resolveFieldValues: async () => ({ estimate: 1, size: 'S', priority: 'P1', sequence: 1.3 }),
      admit: async () => ({ ok: true, blockers: [] }),
      fetchSubIssueStates: async () => [],
      readParentStatus: stubReader('develop'),
      moveState: async () => {
        moveCalled = true;
        return 0;
      },
    },
  });
  assert.equal(
    result.ok,
    true,
    `analyze must pass when parent is in development; got ${JSON.stringify(result)}`
  );
  assert.equal(moveCalled, true, 'move-state should be invoked when gates pass');
}

// 9. Wire-up: approve verb refuses --answer yes when parent in pre-Development.
{
  const { runApprove } = await import('../verbs/approve.mjs');
  let writeCalled = false;
  let moveCalled = false;
  const result = await runApprove({
    issueNumber: 83,
    answer: 'yes',
    cfg: { repo: 'o/r', projectId: 'P' },
    deps: {
      fetchIssueBody: async () => ({
        title: 't',
        body: '## Deep-Dive Analysis\n<!-- aitm-deep-dive-complete: 2026-05-11T00:00:00Z -->\n',
      }),
      writeIssueBody: async () => {
        writeCalled = true;
      },
      moveState: async () => {
        moveCalled = true;
        return 0;
      },
      postComment: async () => {},
      applyReevaluate: async () => {},
      isHeadless: () => false,
      fetchParentEpicNumber: async () => 61,
      readParentStatus: stubReader('plan'),
    },
  });
  assert.equal(
    result.status,
    'parent-admission-refused',
    `expected parent-admission-refused, got ${result.status}`
  );
  assert.equal(writeCalled, false, 'body must not be mutated when gate refuses');
  assert.equal(moveCalled, false, 'move-state must not be invoked when gate refuses');
  assert.match(result.message, /parent #61 is in plan/);
}

// 10. Wire-up: approve verb passes when parent is in Development.
{
  const { runApprove } = await import('../verbs/approve.mjs');
  let moveCalled = false;
  const result = await runApprove({
    issueNumber: 83,
    answer: 'yes',
    cfg: { repo: 'o/r', projectId: 'P' },
    deps: {
      fetchIssueBody: async () => ({
        title: 't',
        body: '## Deep-Dive Analysis\n<!-- aitm-deep-dive-complete: 2026-05-11T00:00:00Z -->\n',
      }),
      writeIssueBody: async () => {},
      moveState: async () => {
        moveCalled = true;
        return 0;
      },
      postComment: async () => {},
      applyReevaluate: async () => {},
      isHeadless: () => false,
      fetchParentEpicNumber: async () => 61,
      readParentStatus: stubReader('develop'),
    },
  });
  assert.equal(result.status, 'approved', `expected approved, got ${JSON.stringify(result)}`);
  assert.equal(moveCalled, true);
}

// 11. Wire-up: approve solo issue (no parent) passes the gate vacuously.
{
  const { runApprove } = await import('../verbs/approve.mjs');
  let moveCalled = false;
  const result = await runApprove({
    issueNumber: 99,
    answer: 'yes',
    cfg: { repo: 'o/r', projectId: 'P' },
    deps: {
      fetchIssueBody: async () => ({
        title: 't',
        body: '## Deep-Dive Analysis\n<!-- aitm-deep-dive-complete: 2026-05-11T00:00:00Z -->\n',
      }),
      writeIssueBody: async () => {},
      moveState: async () => {
        moveCalled = true;
        return 0;
      },
      postComment: async () => {},
      applyReevaluate: async () => {},
      isHeadless: () => false,
      fetchParentEpicNumber: async () => null,
      readParentStatus: async () => {
        throw new Error('reader must not be called for solo issue');
      },
    },
  });
  assert.equal(result.status, 'approved');
  assert.equal(moveCalled, true);
}

console.log('parent-admission.test.mjs: all passed');
