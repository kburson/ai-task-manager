// @story #168 #568
// #168 — readTimingCommentBody contract.
// #568 — fail-closed: the result is a discriminated { status, body, error } so a
// genuine read failure (throw/timeout) is distinguishable from "no timing
// comment exists". A thrown read MUST NOT collapse to ''-as-empty-history.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readTimingCommentBody, bodyOf } from '../../../gh-timing-comment.mjs';

test('readTimingCommentBody: hit → status "found" with body', async () => {
  const res = await readTimingCommentBody({
    issueNumber: 1,
    repo: 'o/r',
    deps: {
      findTimingComment: async () => ({ id: 1, body: '⏱ Timing Log\n| ts | … |' }),
    },
  });
  assert.equal(res.status, 'found');
  assert.match(res.body, /Timing Log/);
  assert.equal(res.error, null);
  assert.match(bodyOf(res), /Timing Log/);
});

test('readTimingCommentBody: normalizes numeric issue IDs before the production reader', async () => {
  let receivedIssueNumber;
  const res = await readTimingCommentBody({
    issueNumber: 1091,
    repo: 'o/r',
    deps: {
      findTimingComment: async (issueNumber) => {
        receivedIssueNumber = issueNumber;
        return { id: 1, body: '⏱ Timing Log' };
      },
    },
  });

  assert.equal(res.status, 'found');
  assert.equal(receivedIssueNumber, '1091');
});

test('readTimingCommentBody: missing comment → status "absent", body ""', async () => {
  const res = await readTimingCommentBody({
    issueNumber: 1,
    repo: 'o/r',
    deps: { findTimingComment: async () => null },
  });
  assert.equal(res.status, 'absent');
  assert.equal(res.body, '');
  assert.equal(bodyOf(res), '');
});

test('readTimingCommentBody: underlying throw → status "error", NOT absent', async () => {
  const boom = new Error('network');
  const res = await readTimingCommentBody({
    issueNumber: 1,
    repo: 'o/r',
    deps: {
      findTimingComment: async () => {
        throw boom;
      },
    },
  });
  // #568 AC1 — a thrown read is an ERROR, never silently "empty history".
  assert.equal(res.status, 'error');
  assert.notEqual(res.status, 'absent');
  assert.equal(res.error, boom);
  // The string body is still '' (so legacy word-delta callers don't crash) but
  // the status carries the distinguishing signal the bind path needs.
  assert.equal(bodyOf(res), '');
});

test('bodyOf tolerates a legacy bare-string result', () => {
  assert.equal(bodyOf('⏱ Timing Log'), '⏱ Timing Log');
  assert.equal(bodyOf(''), '');
  assert.equal(bodyOf(null), '');
  assert.equal(bodyOf(undefined), '');
});
