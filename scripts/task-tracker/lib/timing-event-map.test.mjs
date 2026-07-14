// #683 (AC1) — the closed event vocabulary. Asserts every Event-cell slug the
// timing log emits classifies into exactly one of {departure, reengagement,
// phase}, that the retired aliases fold correctly, and that the canonical
// phase-slug set stays in step with the frozen PHASE_EVENTS emitter table.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EVENT_CLASS,
  PHASE_EVENT_SLUGS,
  classifyTimingEvent,
  isDepartureEvent,
  isReengagementEvent,
  isPhaseEvent,
  isCanonicalPhaseSlug,
  opensIdleSpan,
} from './timing-event-map.mjs';
import { PHASE_EVENTS } from '../phase-events.mjs';

test('departure openers classify as departure', () => {
  for (const slug of [
    'pause',
    'paused',
    'pause:other',
    'pause:question',
    'switch-out',
    'switch-out:#626',
    'idle',
  ]) {
    assert.equal(classifyTimingEvent(slug), EVENT_CLASS.DEPARTURE, slug);
    assert.equal(isDepartureEvent(slug), true, slug);
    assert.equal(opensIdleSpan(slug), true, slug);
  }
});

test('re-engagement closers classify as reengagement', () => {
  for (const slug of ['start', 'resumed', 'resume', 'resume:foo', 'switch-in', 'switch-in:#626']) {
    assert.equal(classifyTimingEvent(slug), EVENT_CLASS.REENGAGEMENT, slug);
    assert.equal(isReengagementEvent(slug), true, slug);
    assert.equal(opensIdleSpan(slug), false, slug);
  }
});

test('phase events classify as phase', () => {
  for (const slug of [
    'refine:started',
    'refine:completed',
    'plan:started',
    'develop:completed',
    'test:passed',
    'review:approved',
    'on-deck:started',
    'backlog:created',
    'issue:wrap',
    'issue:closed',
    'demoted',
    'out-of-band-move',
  ]) {
    assert.equal(classifyTimingEvent(slug), EVENT_CLASS.PHASE, slug);
    assert.equal(isPhaseEvent(slug), true, slug);
    assert.equal(opensIdleSpan(slug), false, slug);
  }
});

test('classification is case-insensitive', () => {
  assert.equal(classifyTimingEvent('PAUSE:Other'), EVENT_CLASS.DEPARTURE);
  assert.equal(classifyTimingEvent('Resumed'), EVENT_CLASS.REENGAGEMENT);
  assert.equal(classifyTimingEvent('Refine:Started'), EVENT_CLASS.PHASE);
});

test('empty / nullish slug classifies as null', () => {
  assert.equal(classifyTimingEvent(''), null);
  assert.equal(classifyTimingEvent('   '), null);
  assert.equal(classifyTimingEvent(null), null);
  assert.equal(classifyTimingEvent(undefined), null);
});

test('every canonical PHASE_EVENTS slug is a phase event', () => {
  const emitted = Object.values(PHASE_EVENTS).flatMap((state) =>
    Object.values(state).map((kind) => kind.event)
  );
  assert.ok(emitted.length > 0, 'PHASE_EVENTS is non-empty');
  for (const slug of emitted) {
    assert.equal(classifyTimingEvent(slug), EVENT_CLASS.PHASE, slug);
    assert.ok(PHASE_EVENT_SLUGS.includes(slug), `${slug} in PHASE_EVENT_SLUGS`);
    assert.equal(isCanonicalPhaseSlug(slug), true, slug);
  }
});

test('PHASE_EVENT_SLUGS is the deduped canonical set', () => {
  assert.equal(new Set(PHASE_EVENT_SLUGS).size, PHASE_EVENT_SLUGS.length);
});

test('isCanonicalPhaseSlug rejects non-canonical neutral slugs', () => {
  // isPhaseEvent is permissive (any unrecognized slug reads as phase), but the
  // canonical check must reject a slug that is not in the frozen set.
  assert.equal(isPhaseEvent('not-a-real-event'), true);
  assert.equal(isCanonicalPhaseSlug('not-a-real-event'), false);
});

test('audit-phase slugs are canonical', () => {
  assert.equal(isCanonicalPhaseSlug('demoted'), true);
  assert.equal(isCanonicalPhaseSlug('out-of-band-move'), true);
  assert.equal(isCanonicalPhaseSlug('active-work'), true);
});

test('the ad-hoc review-verb slugs are recognized neutral phase rows (#812)', () => {
  // The `review` verb emits two bare-verb rows on every review entry; V3's
  // known-slug gate derives from isCanonicalPhaseSlug, so these must be
  // recognized or every timing log fails the moment it enters Review.
  for (const slug of ['review', 'review-ready']) {
    assert.equal(isCanonicalPhaseSlug(slug), true, slug);
    assert.equal(classifyTimingEvent(slug), EVENT_CLASS.PHASE, slug);
    assert.equal(isDepartureEvent(slug), false, slug);
    assert.equal(isReengagementEvent(slug), false, slug);
  }
});
