// @story #1040

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REVIEW_FAILED_START,
  REVIEW_FAILED_END,
  findReviewFailureBlockSpan,
} from '../../../../task-tracker/lib/review-failure-block.mjs';

test('canonical review-failure delimiters locate a complete inclusive span', () => {
  const lines = ['before', REVIEW_FAILED_START, 'failure prose', REVIEW_FAILED_END, 'after'];
  assert.deepEqual(findReviewFailureBlockSpan(lines), {
    start: 1,
    end: 3,
    complete: true,
  });
});

test('standalone delimiter recognition tolerates surrounding whitespace and case', () => {
  const lines = [
    '  <!-- AITM-REVIEW-FAILED:START --> ',
    'failure prose',
    '\t<!-- aitm-review-failed:END -->',
  ];
  assert.deepEqual(findReviewFailureBlockSpan(lines), {
    start: 0,
    end: 2,
    complete: true,
  });
});

test('inline prose quoting both delimiters is not a review-failure block', () => {
  const prose =
    'Docs: `<!-- aitm-review-failed:start -->` through `<!-- aitm-review-failed:end -->`.';
  assert.equal(findReviewFailureBlockSpan([prose]), null);
});

test('an unterminated block is not complete but can be kept opaque through EOF', () => {
  const lines = ['before', REVIEW_FAILED_START, 'failure prose'];
  assert.equal(findReviewFailureBlockSpan(lines), null);
  assert.deepEqual(findReviewFailureBlockSpan(lines, { includeUnterminated: true }), {
    start: 1,
    end: 2,
    complete: false,
  });
});

test('fromIndex and requireStartAt support repeated consumer scans without local grammar', () => {
  const lines = [
    REVIEW_FAILED_START,
    'first',
    REVIEW_FAILED_END,
    'between',
    REVIEW_FAILED_START,
    'second',
    REVIEW_FAILED_END,
  ];
  assert.deepEqual(findReviewFailureBlockSpan(lines, { fromIndex: 4, requireStartAt: true }), {
    start: 4,
    end: 6,
    complete: true,
  });
  assert.equal(findReviewFailureBlockSpan(lines, { fromIndex: 3, requireStartAt: true }), null);
});
