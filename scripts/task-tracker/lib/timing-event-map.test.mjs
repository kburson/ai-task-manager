// #683 (AC1) — the closed event vocabulary. Asserts every Event-cell slug the
// timing log emits classifies into exactly one of {departure, reengagement,
// phase}, that the retired aliases fold correctly, and that the canonical
// phase-slug set stays in step with the frozen PHASE_EVENTS emitter table.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EVENT_CLASS,
  lifecycleTimingEventSlugs,
  classifyTimingEventForAccounting as classifyTimingEvent,
  isDepartureEvent,
  isReengagementEvent,
  isPhaseEventForAccounting as isPhaseEvent,
  isCanonicalPhaseEvent as isCanonicalPhaseSlug,
  opensIdleSpan,
} from './timing-events/index.mjs';
import { PHASE_EVENTS } from '../phase-events.mjs';

const PHASE_EVENT_SLUGS = lifecycleTimingEventSlugs();

test('departure openers classify as departure', () => {
  // EPIC #823 timing model v2 (C1): `idle` is no longer a departure opener — it
  // is retired vocabulary the READ side treats as neutral PHASE. See the retired
  // case below and no-idle-emitters.test.mjs.
  for (const slug of [
    'pause',
    'paused',
    'pause:other',
    'pause:question',
    'switch-out',
    'switch-out:#626',
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
    'assigned:started',
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
  // EPIC #823 timing model v2 (C1): `active-work` is retired vocabulary, no
  // longer a canonical/recognized slug. (Guarded positively in
  // no-idle-emitters.test.mjs.)
  assert.equal(isCanonicalPhaseSlug('active-work'), false);
});

test('target-suffixed demote slug is canonical + classifies as PHASE (C7 / #831 D3)', () => {
  // EPIC #823 timing model v2 (C7 / defect D3): the demote audit row names its
  // TARGET state (`demoted:<target>`, e.g. `demoted:develop`). The prefixed form
  // must be a canonical phase slug so the strict v2 validator (C5) accepts it,
  // and it must classify as neutral PHASE (never a departure/reengagement).
  for (const slug of ['demoted:develop', 'demoted:test', 'demoted:backlog']) {
    assert.equal(isCanonicalPhaseSlug(slug), true, slug);
    assert.equal(classifyTimingEvent(slug), EVENT_CLASS.PHASE, slug);
    assert.equal(isDepartureEvent(slug), false, slug);
    assert.equal(isReengagementEvent(slug), false, slug);
    assert.equal(opensIdleSpan(slug), false, slug);
  }
  // Case-insensitive, and the bare legacy form stays canonical.
  assert.equal(isCanonicalPhaseSlug('DEMOTED:Develop'), true);
  assert.equal(isCanonicalPhaseSlug('demoted'), true);
  // A malformed suffix (non-slug chars) is NOT canonical.
  assert.equal(isCanonicalPhaseSlug('demoted:'), false);
  assert.equal(isCanonicalPhaseSlug('demoted:Dev123'), false);
});

test('the retired review-verb slugs are no longer canonical (C6 / #830)', () => {
  // The `review` verb used to emit two bare-verb rows (`review`, `review-ready`)
  // on every review entry, and #812 registered them as canonical so V3 would not
  // reject a live review log. EPIC #823 timing model v2 (C6) STOPS emitting them
  // and strips them from historical logs, so they are no longer canonical. A
  // legacy log that still carries them classifies them as neutral PHASE (never a
  // departure/reengagement) until the heal removes them — accounting stays
  // invariant pre-heal.
  for (const slug of ['review', 'review-ready']) {
    assert.equal(isCanonicalPhaseSlug(slug), false, slug);
    assert.equal(classifyTimingEvent(slug), EVENT_CLASS.PHASE, slug);
    assert.equal(isDepartureEvent(slug), false, slug);
    assert.equal(isReengagementEvent(slug), false, slug);
  }
});
