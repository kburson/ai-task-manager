// @story #168
// #168 — readTimingCommentBody contract: body on hit, '' on miss, '' on error.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readTimingCommentBody } from '../gh-timing-comment.mjs';

test('readTimingCommentBody returns body when timing comment exists', async () => {
  const body = await readTimingCommentBody({
    issueNumber: 1,
    repo: 'o/r',
    deps: {
      findTimingComment: async () => ({ id: 1, body: '⏱ Timing Log\n| ts | … |' }),
    },
  });
  assert.match(body, /Timing Log/);
});

test('readTimingCommentBody returns "" when comment is missing', async () => {
  const body = await readTimingCommentBody({
    issueNumber: 1,
    repo: 'o/r',
    deps: { findTimingComment: async () => null },
  });
  assert.equal(body, '');
});

test('readTimingCommentBody returns "" when underlying call throws', async () => {
  const body = await readTimingCommentBody({
    issueNumber: 1,
    repo: 'o/r',
    deps: {
      findTimingComment: async () => {
        throw new Error('network');
      },
    },
  });
  assert.equal(body, '');
});
