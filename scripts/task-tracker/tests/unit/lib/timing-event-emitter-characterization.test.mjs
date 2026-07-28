// @story #1007
import test from 'node:test';
import assert from 'node:assert/strict';

import { PHASE_EVENTS } from '../../../phase-events.mjs';
import {
  EVENT_CLASS,
  PHASE_EVENT_SLUGS,
  classifyTimingEvent,
  isCanonicalPhaseSlug,
} from '../../../lib/timing-event-map.mjs';
import { TIMING_EVENT_BASELINE } from '../../fixtures/state-engine-policy-baseline.mjs';

const phaseSlugs = Object.values(PHASE_EVENTS).flatMap((state) =>
  Object.values(state).map(({ event }) => event)
);

function ruleFor(event) {
  if (TIMING_EVENT_BASELINE.exact.includes(event)) return 'exact';
  return TIMING_EVENT_BASELINE.parameterized.find(({ pattern }) => pattern.test(event))?.name;
}

test('the exact vocabulary includes every canonical lifecycle slug once', () => {
  assert.equal(phaseSlugs.length, 14);
  assert.equal(new Set(phaseSlugs).size, phaseSlugs.length);
  assert.deepEqual(PHASE_EVENT_SLUGS, phaseSlugs);
  for (const slug of phaseSlugs) {
    assert.ok(TIMING_EVENT_BASELINE.exact.includes(slug), slug);
    assert.equal(isCanonicalPhaseSlug(slug), true, slug);
    assert.equal(classifyTimingEvent(slug), EVENT_CLASS.PHASE, slug);
  }
});

test('every characterized production timing emitter maps to one known rule', () => {
  assert.ok(TIMING_EVENT_BASELINE.emitters.length >= phaseSlugs.length);
  for (const emitter of TIMING_EVENT_BASELINE.emitters) {
    assert.ok(emitter.file.length > 0);
    assert.ok(Number.isInteger(emitter.line) && emitter.line > 0);
    assert.ok(emitter.expression.length > 0);
    assert.equal(ruleFor(emitter.event), emitter.rule, `${emitter.file}: ${emitter.event}`);
  }
});

test('parameterized interruption and audit families retain their current classification', () => {
  const examples = new Map([
    ['demoted-target', ['demoted:develop', EVENT_CLASS.PHASE, true]],
    ['pause-reason', ['pause:orphan-recovery', EVENT_CLASS.DEPARTURE, false]],
    ['resume-reason', ['resume:manual', EVENT_CLASS.REENGAGEMENT, false]],
    ['switch-out-issue', ['switch-out:#1007', EVENT_CLASS.DEPARTURE, false]],
  ]);

  for (const { name, pattern } of TIMING_EVENT_BASELINE.parameterized) {
    const [slug, expectedClass, canonical] = examples.get(name);
    assert.equal(pattern.test(slug), true, `${name}: ${slug}`);
    assert.equal(classifyTimingEvent(slug), expectedClass, slug);
    assert.equal(isCanonicalPhaseSlug(slug), canonical, slug);
  }
});

test('retired timing slugs remain neutral read-side history only', () => {
  assert.deepEqual(TIMING_EVENT_BASELINE.retired, ['idle', 'active-work']);
  for (const slug of TIMING_EVENT_BASELINE.retired) {
    assert.equal(TIMING_EVENT_BASELINE.exact.includes(slug), false, slug);
    assert.equal(isCanonicalPhaseSlug(slug), false, slug);
    assert.equal(classifyTimingEvent(slug), EVENT_CLASS.PHASE, slug);
  }
});
