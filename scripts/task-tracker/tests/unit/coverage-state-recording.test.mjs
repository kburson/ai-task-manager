// @story #626
// #626 — coverage lift for `state-recording.mjs`. The existing
// `marker-write-retry.test.mjs` suite exercises only the post-#295 MUTATE path
// (`writeIssueBodyWithRetry` with a `mutate` closure / `deps.mutateIssueBody`).
// This suite covers the remaining branches:
//
//   1. the `!target` guard,
//   2. the `StateRecordingFailedError` shape,
//   3. the LEGACY path (lines 80-118) — taken when `writeIssueBody` is a
//      function AND `body !== undefined` AND no `mutate` — across all five
//      sub-behaviors: noop, success-1st, success-on-retry (+warn),
//      fail-after-2 (audit posted), and fail with audit-post also throwing
//      (auditPosted:false),
//   4. `findRecordingFailureFromComments` (non-array, no-match, match, and the
//      most-recent-wins + sinceMs filter branches).
//
// No production code changes — all seams are the public params (`writeIssueBody`,
// `postComment`, `warn`) injected directly, so no real `gh` process spawns.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  writeIssueBodyWithRetry,
  findRecordingFailureFromComments,
  StateRecordingFailedError,
} from '../../lib/state-recording.mjs';

function makeWarn() {
  const lines = [];
  return { warn: (m) => lines.push(m), lines };
}

// A `writeIssueBody` stub whose per-call behavior is scripted: `throws` is an
// array of booleans indexed by call number (1-based). Records every call.
function makeWriter(throws = []) {
  const calls = [];
  return {
    calls,
    writeIssueBody: async ({ issueNumber, repo, body }) => {
      calls.push({ issueNumber, repo, body });
      if (throws[calls.length - 1]) throw new Error(`push failed #${calls.length}`);
    },
  };
}

test('throws when target is missing', async () => {
  await assert.rejects(
    () =>
      writeIssueBodyWithRetry({
        issueNumber: 1,
        repo: 'o/r',
        body: 'x',
        writeIssueBody: async () => {},
      }),
    /target is required/
  );
});

test('StateRecordingFailedError carries issueNumber/target/cause and message', () => {
  const cause = new Error('boom');
  const err = new StateRecordingFailedError({ issueNumber: 42, target: 'develop', cause });
  assert.equal(err.name, 'StateRecordingFailedError');
  assert.equal(err.issueNumber, 42);
  assert.equal(err.target, 'develop');
  assert.equal(err.cause, cause);
  assert.match(err.message, /issue #42 marker write to "develop" failed: boom/);
});

test('legacy path: noop when body === bodyBefore (no write attempted)', async () => {
  const { writeIssueBody, calls } = makeWriter();
  const res = await writeIssueBodyWithRetry({
    issueNumber: 7,
    repo: 'o/r',
    target: 'plan',
    body: 'same',
    bodyBefore: 'same',
    writeIssueBody,
  });
  assert.deepEqual(res, { status: 'noop' });
  assert.equal(calls.length, 0);
});

test('legacy path: success on first attempt (no warn, no audit)', async () => {
  const { writeIssueBody, calls } = makeWriter([false]);
  const { warn, lines } = makeWarn();
  const audits = [];
  const res = await writeIssueBodyWithRetry({
    issueNumber: 8,
    repo: 'o/r',
    target: 'develop',
    body: 'next',
    bodyBefore: 'prev',
    writeIssueBody,
    postComment: async (c) => audits.push(c),
    warn,
  });
  assert.deepEqual(res, { status: 'ok', attempts: 1 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body, 'next');
  assert.equal(lines.length, 0);
  assert.equal(audits.length, 0);
});

test('legacy path: first attempt throws, retry succeeds (+warn, no audit)', async () => {
  const { writeIssueBody, calls } = makeWriter([true, false]);
  const { warn, lines } = makeWarn();
  const audits = [];
  const res = await writeIssueBodyWithRetry({
    issueNumber: 9,
    repo: 'o/r',
    target: 'test',
    body: 'next',
    bodyBefore: 'prev',
    writeIssueBody,
    postComment: async (c) => audits.push(c),
    warn,
  });
  assert.deepEqual(res, { status: 'ok', attempts: 2 });
  assert.equal(calls.length, 2);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /issue #9 marker write to "test" succeeded on retry/);
  assert.equal(audits.length, 0);
});

test('legacy path: both attempts throw → warn + audit comment posted (auditPosted:true)', async () => {
  const { writeIssueBody, calls } = makeWriter([true, true]);
  const { warn, lines } = makeWarn();
  const audits = [];
  const res = await writeIssueBodyWithRetry({
    issueNumber: 10,
    repo: 'o/r',
    target: 'review',
    body: 'next',
    bodyBefore: 'prev',
    writeIssueBody,
    postComment: async (c) => audits.push(c),
    warn,
  });
  assert.equal(res.status, 'failed');
  assert.equal(res.attempts, 2);
  assert.equal(res.auditPosted, true);
  assert.match(res.error, /push failed #2/);
  assert.equal(calls.length, 2);
  assert.match(lines[0], /FAILED after 2 attempts/);
  assert.equal(audits.length, 1);
  assert.match(audits[0].body, /⚠ state-recording-failed/);
  assert.match(audits[0].body, /Marker write to `review`/);
  assert.match(audits[0].body, /<!-- aitm-state-recording-failed -->/);
});

test('legacy path: both attempts throw AND audit-post throws → auditPosted:false', async () => {
  const { writeIssueBody } = makeWriter([true, true]);
  const { warn, lines } = makeWarn();
  const res = await writeIssueBodyWithRetry({
    issueNumber: 11,
    repo: 'o/r',
    target: 'done',
    body: 'next',
    bodyBefore: 'prev',
    writeIssueBody,
    postComment: async () => {
      throw new Error('comment API down');
    },
    warn,
  });
  assert.equal(res.status, 'failed');
  assert.equal(res.attempts, 2);
  assert.equal(res.auditPosted, false);
  assert.match(res.error, /push failed #2/);
  assert.match(lines[0], /FAILED after 2 attempts/);
});

test('findRecordingFailureFromComments: non-array input returns null', () => {
  assert.equal(findRecordingFailureFromComments(null), null);
  assert.equal(findRecordingFailureFromComments(undefined), null);
  assert.equal(findRecordingFailureFromComments('nope'), null);
});

test('findRecordingFailureFromComments: no marker → null; skips missing/invalid dates', () => {
  const comments = [
    { body: 'unrelated comment', createdAt: '2026-01-01T00:00:00Z' },
    { body: '<!-- aitm-state-recording-failed -->', createdAt: undefined },
    { body: '<!-- aitm-state-recording-failed -->', createdAt: 'not-a-date' },
  ];
  assert.equal(findRecordingFailureFromComments(comments), null);
});

test('findRecordingFailureFromComments: returns most-recent match with parsed target', () => {
  const comments = [
    {
      body: '> ⚠ state-recording-failed\nMarker write to `plan` failed\n<!-- aitm-state-recording-failed -->',
      createdAt: '2026-06-01T00:00:00Z',
    },
    {
      body: '> ⚠ state-recording-failed\nMarker write to `develop` failed\n<!-- aitm-state-recording-failed -->',
      created_at: '2026-06-10T00:00:00Z',
    },
  ];
  const res = findRecordingFailureFromComments(comments);
  assert.equal(res.target, 'develop');
  assert.equal(res.createdAt, '2026-06-10T00:00:00Z');
});

test('findRecordingFailureFromComments: sinceMs filters out older matches', () => {
  const comments = [
    {
      body: 'Marker write to `plan` failed <!-- aitm-state-recording-failed -->',
      createdAt: '2026-06-01T00:00:00Z',
    },
  ];
  const since = Date.parse('2026-06-05T00:00:00Z');
  assert.equal(findRecordingFailureFromComments(comments, since), null);
});

test('findRecordingFailureFromComments: match with no parseable target yields target:null', () => {
  const comments = [
    {
      body: 'no backticked target here <!-- aitm-state-recording-failed -->',
      createdAt: '2026-06-01T00:00:00Z',
    },
  ];
  const res = findRecordingFailureFromComments(comments);
  assert.equal(res.target, null);
  assert.equal(res.createdAt, '2026-06-01T00:00:00Z');
});
