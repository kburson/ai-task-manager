#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import {
  computeReviewDelta,
  buildDeltaCommentBody,
  DELTA_HEADER,
  DELTA_READ_ONLY_FOOTER,
} from '../lib/review-delta.mjs';

// computeReviewDelta — happy path (estimate + actual, positive delta).
{
  const r = computeReviewDelta({ estimate: 16, actual: 22.5 });
  assert.equal(r.estimate, 16);
  assert.equal(r.actual, 22.5);
  assert.equal(r.deltaHours, 6.5);
  assert.equal(Math.round(r.deltaPct * 10) / 10, 40.6);
  assert.equal(r.hasActual, true);
  assert.equal(r.hasEstimate, true);
}

// computeReviewDelta — negative delta (under-budget).
{
  const r = computeReviewDelta({ estimate: 10, actual: 7 });
  assert.equal(r.deltaHours, -3);
  assert.equal(r.deltaPct, -30);
}

// computeReviewDelta — missing actual.
{
  const r = computeReviewDelta({ estimate: 8, actual: null });
  assert.equal(r.hasActual, false);
  assert.equal(r.deltaHours, null);
  assert.equal(r.deltaPct, null);
}

// computeReviewDelta — missing estimate.
{
  const r = computeReviewDelta({ estimate: null, actual: 12 });
  assert.equal(r.hasEstimate, false);
  assert.equal(r.deltaHours, null);
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
  const r = computeReviewDelta({ estimate: NaN, actual: Infinity });
  assert.equal(r.estimate, null);
  assert.equal(r.actual, null);
}

// buildDeltaCommentBody — happy path renders correct percent string.
{
  const r = computeReviewDelta({ estimate: 16, actual: 22.5 });
  const body = buildDeltaCommentBody(r);
  assert.ok(body.startsWith(DELTA_HEADER), 'header line first');
  assert.match(body, /\| Field \| Estimated \| Actual \| Δ \|/, 'table header present');
  assert.match(body, /\| Hours \| 16 \| 22\.5 \| \+40\.6% \|/, 'estimate/actual/delta row exact');
  assert.match(body, /Drivers: see review notes\./, 'default drivers line');
  assert.ok(body.endsWith(DELTA_READ_ONLY_FOOTER), 'read-only footer at end');
}

// buildDeltaCommentBody — missing actual uses em-dash cells and fallback note.
{
  const r = computeReviewDelta({ estimate: 8, actual: null });
  const body = buildDeltaCommentBody(r);
  assert.match(body, /\| Hours \| 8 \| — \| — \|/, 'em-dash cells when actual missing');
  assert.match(body, /Actual Session Time.*not set/, 'fallback note present');
  assert.ok(body.endsWith(DELTA_READ_ONLY_FOOTER));
}

// buildDeltaCommentBody — provided drivers list rendered as bullets.
{
  const r = computeReviewDelta({ estimate: 4, actual: 6 });
  const body = buildDeltaCommentBody(r, { drivers: ['scope creep on tests', 'docs took longer than expected'] });
  assert.match(body, /Drivers:\n- scope creep on tests\n- docs took longer than expected/);
}

// buildDeltaCommentBody — no-mutation-language guarantee.
{
  const r = computeReviewDelta({ estimate: 5, actual: 5 });
  const body = buildDeltaCommentBody(r);
  // The footer mentions "modified" by design; the body must NOT contain mutation verbs in the rest.
  const beforeFooter = body.slice(0, body.indexOf(DELTA_READ_ONLY_FOOTER));
  assert.ok(!/\bedit(ed|ing)?\b/i.test(beforeFooter), 'no "edit" verb before footer');
  assert.ok(!/\bmutate(d|s)?\b/i.test(beforeFooter), 'no "mutate" verb before footer');
  assert.ok(!/\bupdate(d|s)?\b/i.test(beforeFooter), 'no "update" verb before footer');
}

// buildDeltaCommentBody — zero estimate guards against divide-by-zero.
{
  const r = computeReviewDelta({ estimate: 0, actual: 4 });
  const body = buildDeltaCommentBody(r);
  assert.match(body, /\| Hours \| 0 \| 4 \| — \|/, 'delta cell em-dash when estimate is 0');
}

console.log('review-delta.test.mjs: all passed');
