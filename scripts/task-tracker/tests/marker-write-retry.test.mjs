// #168 — writeIssueBodyWithRetry: succeed-1st (1 call), succeed-on-retry
// (2 calls + stderr warn, no audit), fail-twice (2 calls + stderr +
// audit comment posted). noop when body unchanged.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { writeIssueBodyWithRetry } from '../lib/state-recording.mjs';

function makeWarn() {
  const lines = [];
  return { warn: (m) => lines.push(m), lines };
}

test('noop when body equals bodyBefore (no write attempted)', async () => {
  let calls = 0;
  const r = await writeIssueBodyWithRetry({
    issueNumber: 1,
    repo: 'o/r',
    body: 'same',
    bodyBefore: 'same',
    target: 'plan',
    writeIssueBody: async () => {
      calls++;
    },
  });
  assert.equal(r.status, 'noop');
  assert.equal(calls, 0);
});

test('succeeds on first attempt — 1 call, no warn, no audit', async () => {
  let writes = 0;
  let comments = 0;
  const { warn, lines } = makeWarn();
  const r = await writeIssueBodyWithRetry({
    issueNumber: 1,
    repo: 'o/r',
    body: 'new',
    bodyBefore: 'old',
    target: 'plan',
    writeIssueBody: async () => {
      writes++;
    },
    postComment: async () => {
      comments++;
    },
    warn,
  });
  assert.equal(r.status, 'ok');
  assert.equal(r.attempts, 1);
  assert.equal(writes, 1);
  assert.equal(comments, 0);
  assert.equal(lines.length, 0);
});

test('succeeds on retry — 2 calls + stderr warn, no audit comment', async () => {
  let writes = 0;
  let comments = 0;
  const { warn, lines } = makeWarn();
  const r = await writeIssueBodyWithRetry({
    issueNumber: 1,
    repo: 'o/r',
    body: 'new',
    bodyBefore: 'old',
    target: 'plan',
    writeIssueBody: async () => {
      writes++;
      if (writes === 1) throw new Error('transient');
    },
    postComment: async () => {
      comments++;
    },
    warn,
  });
  assert.equal(r.status, 'ok');
  assert.equal(r.attempts, 2);
  assert.equal(writes, 2);
  assert.equal(comments, 0);
  assert.match(lines.join('\n'), /succeeded on retry/);
});

test('fails twice — stderr + audit comment posted', async () => {
  let writes = 0;
  let comments = 0;
  const { warn, lines } = makeWarn();
  const r = await writeIssueBodyWithRetry({
    issueNumber: 168,
    repo: 'o/r',
    body: 'new',
    bodyBefore: 'old',
    target: 'plan',
    writeIssueBody: async () => {
      writes++;
      throw new Error('rate-limited');
    },
    postComment: async ({ body }) => {
      comments++;
      assert.match(body, /state-recording-failed/);
      assert.match(body, /plan/);
    },
    warn,
  });
  assert.equal(r.status, 'failed');
  assert.equal(r.attempts, 2);
  assert.equal(writes, 2);
  assert.equal(comments, 1);
  assert.equal(r.auditPosted, true);
  assert.match(lines.join('\n'), /FAILED after 2 attempts/);
});

test('audit-post failure does not throw — auditPosted=false', async () => {
  const { warn } = makeWarn();
  const r = await writeIssueBodyWithRetry({
    issueNumber: 168,
    repo: 'o/r',
    body: 'new',
    bodyBefore: 'old',
    target: 'plan',
    writeIssueBody: async () => {
      throw new Error('rate-limited');
    },
    postComment: async () => {
      throw new Error('also-down');
    },
    warn,
  });
  assert.equal(r.status, 'failed');
  assert.equal(r.auditPosted, false);
});
