// @story #977

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  DURATION_FIELD_LABELS,
  durationFieldLookupNames,
  formatRollupSummaryLines,
} from '../../../../gh/log-issue-time.mjs';

test('log-issue-time exposes current Project duration labels for operator output', () => {
  assert.deepEqual(DURATION_FIELD_LABELS, {
    engagedTime: 'Engaged',
    sessionTime: 'Session',
    reviewTime: 'Review',
    planTime: 'Plan',
  });

  const lines = formatRollupSummaryLines({
    engagedMin: 61,
    totalActiveMin: 57,
    reviewMin: 4,
    planMin: 13,
    thresholdMin: 5,
  });

  assert.match(lines[0], /^\s+Engaged\s+:/);
  assert.match(lines[1], /^\s+Session\s+:/);
  assert.match(lines[2], /^\s+Review\s+:/);
  assert.match(lines[3], /^\s+Plan\s+:/);
  assert.doesNotMatch(lines.join('\n'), /Engaged Time|Session Time|Review Time|Plan Time/);
});

test('log-issue-time prefers renamed fields while retaining legacy aliases', () => {
  assert.deepEqual(durationFieldLookupNames('engagedTime'), [
    'Engaged',
    'Engaged Time',
    'Actual Hours',
  ]);
  assert.deepEqual(durationFieldLookupNames('sessionTime'), [
    'Session',
    'Session Time',
    'Actual Session Time',
  ]);
  assert.deepEqual(durationFieldLookupNames('reviewTime'), ['Review', 'Review Time']);
  assert.deepEqual(durationFieldLookupNames('planTime'), ['Plan', 'Plan Time']);
});
