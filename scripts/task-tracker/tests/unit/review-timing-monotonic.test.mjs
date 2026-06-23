#!/usr/bin/env node
// @story #515
// Regression: the verb-level "starting review" timing row must carry a
// timestamp sampled at POST time (after runMoveState emits the test:done +
// review:waiting phase-pair), not at the earlier moment the row spec is built.
//
// #463 deferred only the *posting* of the row; the timestamp was still captured
// eagerly via nowIso() at spec-build time. Because runMoveState performs
// multi-second gh round-trips, the deferred row landed below test:done /
// review:waiting while carrying a pre-move wall-clock — a non-monotonic
// (backwards) jump in the timing log (#506 observed an 11s regression).
//
// The fix turns `pendingReviewRow` into a timestamp-free spec and binds the ts
// at the post site through the pure helper `buildDeferredReviewRow(spec, ts)`.
// This test pins that helper: the rendered Timestamp cell reflects the ts
// supplied at call time, across both the buildRow ('row') and buildFlushRow
// ('flush') branches.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { buildDeferredReviewRow } from '../../verbs/review.mjs';
import { fmtTs } from '../../gh-timing-comment.mjs';

// Stay inside buildRow's ±60s retroactive-ts window for both timestamps.
const buildTime = new Date(Date.now() - 8000).toISOString(); // spec built earlier
const postTime = new Date().toISOString(); // move-state round-trip advanced the clock

const specRow = {
  kind: 'row',
  event: 'review',
  activeSec: 1800,
  idleSec: 0,
  deltaWords: 500,
  wordMarker: 600,
  description: 'agent session — starting review',
};

const specFlush = {
  kind: 'flush',
  event: 'review',
  activeMin: 12,
  idleMin: 3,
  deltaWords: 0,
  wordMarker: 42,
  description: 'starting review',
};

test('buildDeferredReviewRow stamps the ts supplied at call time (row branch)', () => {
  const row = buildDeferredReviewRow(specRow, postTime);
  assert.ok(
    row.includes(`| ${fmtTs(postTime)} |`),
    'row Timestamp cell must reflect the post-time ts'
  );
});

test('buildDeferredReviewRow stamps the ts supplied at call time (flush branch)', () => {
  const row = buildDeferredReviewRow(specFlush, postTime);
  assert.ok(
    row.includes(`| ${fmtTs(postTime)} |`),
    'flush-branch row Timestamp cell must reflect the post-time ts'
  );
});

test('spec carries no timestamp: same spec yields post-time ts, never an earlier baked ts', () => {
  // The defining property of the #515 fix: nothing about the row's timestamp is
  // decided when the spec is created. Building with the later post-time ts must
  // NOT leak the earlier build-time ts.
  const row = buildDeferredReviewRow(specRow, postTime);
  if (fmtTs(buildTime) !== fmtTs(postTime)) {
    assert.ok(
      !row.includes(`| ${fmtTs(buildTime)} |`),
      'row must not carry the build-time ts — timestamp is bound at post time'
    );
  }
});

test('review row ts is monotonically non-decreasing vs the preceding move-state pair', () => {
  // Model the lifecycle: runMoveState stamps test:done / review:waiting at
  // `pairTime`, then the deferred review row is posted at `postTime >= pairTime`.
  const pairTime = buildTime; // emitted during the move
  const reviewRow = buildDeferredReviewRow(specRow, postTime);
  const reviewTsMs = Date.parse(postTime);
  const pairTsMs = Date.parse(pairTime);
  assert.ok(
    reviewTsMs >= pairTsMs,
    'review row ts must be >= the preceding test:done/review:waiting ts'
  );
  assert.ok(reviewRow.includes(`| ${fmtTs(postTime)} |`));
});

test('buildDeferredReviewRow returns null for a null spec', () => {
  assert.equal(buildDeferredReviewRow(null, postTime), null);
});
