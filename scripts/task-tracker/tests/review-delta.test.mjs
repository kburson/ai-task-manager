#!/usr/bin/env node
// @story #73
import { strict as assert } from 'node:assert';
import {
  computeReviewDelta,
  buildDeltaCommentBody,
  DELTA_HEADER,
  DELTA_READ_ONLY_FOOTER,
} from '../lib/review-delta.mjs';

// computeReviewDelta — happy path (estimateHr=3, actualSec=1122 → −89.6%).
{
  const r = computeReviewDelta({ estimateHr: 3, actualSec: 1122 });
  assert.equal(r.estimateHr, 3);
  assert.equal(r.estimateSec, 10800);
  assert.equal(r.actualSec, 1122);
  assert.equal(r.deltaSec, -9678);
  assert.equal(Math.round(r.deltaPct * 10) / 10, -89.6);
  assert.equal(r.hasActual, true);
  assert.equal(r.hasEstimate, true);
}

// computeReviewDelta — over-budget (estimateHr=1, actualSec=5400 → +50%).
{
  const r = computeReviewDelta({ estimateHr: 1, actualSec: 5400 });
  assert.equal(r.estimateSec, 3600);
  assert.equal(r.deltaSec, 1800);
  assert.equal(r.deltaPct, 50);
}

// computeReviewDelta — sub-minute precision regression
// (estimateHr=0.5, actualSec=90 → −95.0%). Minute-rounding would have
// rendered actual as 0:00 and Δ as −100% — both wrong.
{
  const r = computeReviewDelta({ estimateHr: 0.5, actualSec: 90 });
  assert.equal(r.estimateSec, 1800);
  assert.equal(r.actualSec, 90);
  assert.equal(r.deltaSec, -1710);
  assert.equal(r.deltaPct, -95);
}

// computeReviewDelta — missing actual.
{
  const r = computeReviewDelta({ estimateHr: 8, actualSec: null });
  assert.equal(r.hasActual, false);
  assert.equal(r.deltaSec, null);
  assert.equal(r.deltaPct, null);
}

// computeReviewDelta — missing estimate.
{
  const r = computeReviewDelta({ estimateHr: null, actualSec: 1200 });
  assert.equal(r.hasEstimate, false);
  assert.equal(r.deltaSec, null);
  assert.equal(r.deltaPct, null);
}

// computeReviewDelta — both missing.
{
  const r = computeReviewDelta({});
  assert.equal(r.hasActual, false);
  assert.equal(r.hasEstimate, false);
}

// computeReviewDelta — non-finite inputs treated as missing.
{
  const r = computeReviewDelta({ estimateHr: NaN, actualSec: Infinity });
  assert.equal(r.estimateHr, null);
  assert.equal(r.actualSec, null);
}

// computeReviewDelta — zero estimate guards against divide-by-zero.
{
  const r = computeReviewDelta({ estimateHr: 0, actualSec: 240 });
  assert.equal(r.estimateSec, 0);
  assert.equal(r.deltaSec, 240);
  assert.equal(r.deltaPct, null);
}

// buildDeltaCommentBody — happy path renders DDd HHh MMm SSs table + percent.
{
  const r = computeReviewDelta({ estimateHr: 3, actualSec: 1122 });
  const body = buildDeltaCommentBody(r);
  assert.ok(body.startsWith(DELTA_HEADER), 'header line first');
  assert.match(body, /\| Description \| Estimated \| Actual \| Δ \|/, 'new table header present');
  assert.match(
    body,
    /\| Story effort \| 00d 03h 00m 00s \| 00d 00h 18m 42s \| -89\.6% \|/,
    'estimate/actual/delta row exact'
  );
  assert.match(body, /Estimate is whole-story hours/, 'explanatory note present');
  assert.doesNotMatch(body, /Drivers:/, 'no Drivers section when drivers empty');
  assert.doesNotMatch(body, /\bHours\b/, 'legacy "Hours" label gone');
  assert.ok(body.endsWith(DELTA_READ_ONLY_FOOTER), 'read-only footer at end');
}

// buildDeltaCommentBody — missing actual uses em-dash cells and fallback note.
{
  const r = computeReviewDelta({ estimateHr: 8, actualSec: null });
  const body = buildDeltaCommentBody(r);
  assert.match(
    body,
    /\| Story effort \| 00d 08h 00m 00s \| — \| — \|/,
    'em-dash cells when actual missing'
  );
  assert.match(body, /Actual Session Time.*not set/, 'fallback note present');
  assert.ok(body.endsWith(DELTA_READ_ONLY_FOOTER));
}

// buildDeltaCommentBody — missing estimate emits em-dash both sides.
{
  const r = computeReviewDelta({ estimateHr: null, actualSec: 1122 });
  const body = buildDeltaCommentBody(r);
  assert.match(body, /\| Story effort \| — \| 00d 00h 18m 42s \| — \|/);
}

// buildDeltaCommentBody — provided drivers list rendered as bullets.
{
  const r = computeReviewDelta({ estimateHr: 4, actualSec: 21600 });
  const body = buildDeltaCommentBody(r, {
    drivers: ['scope creep on tests', 'docs took longer than expected'],
  });
  assert.match(body, /Drivers:\n- scope creep on tests\n- docs took longer than expected/);
}

// buildDeltaCommentBody — no-mutation-language guarantee.
{
  const r = computeReviewDelta({ estimateHr: 5, actualSec: 18000 });
  const body = buildDeltaCommentBody(r);
  const beforeFooter = body.slice(0, body.indexOf(DELTA_READ_ONLY_FOOTER));
  assert.ok(!/\bedit(ed|ing)?\b/i.test(beforeFooter), 'no "edit" verb before footer');
  assert.ok(!/\bmutate(d|s)?\b/i.test(beforeFooter), 'no "mutate" verb before footer');
  assert.ok(!/\bupdate(d|s)?\b/i.test(beforeFooter), 'no "update" verb before footer');
}

// buildDeltaCommentBody — zero estimate guards against divide-by-zero.
{
  const r = computeReviewDelta({ estimateHr: 0, actualSec: 14400 });
  const body = buildDeltaCommentBody(r);
  assert.match(
    body,
    /\| Story effort \| 00d 00h 00m 00s \| 00d 04h 00m 00s \| — \|/,
    'delta cell em-dash when estimate is 0'
  );
}

console.log('review-delta.test.mjs: all passed');
