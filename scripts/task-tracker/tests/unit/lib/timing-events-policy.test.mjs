// @story #1010
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  EVENT_CLASS,
  exactTimingEventDescriptors,
  describeTimingEvent,
  isKnownTimingEvent,
  classifyTimingEvent,
  classifyTimingEventForAccounting,
  lifecycleTimingEventSlugs,
  isCanonicalPhaseEvent,
  stageOfTimingEvent,
  isRetiredTimingEvent,
  isEmittableTimingEvent,
} from '../../../lib/timing-events/index.mjs';
import { PHASE_EVENTS, resolvePhaseEvent } from '../../../phase-events.mjs';
import { classifyEvent } from '../../../lib/bind-event.mjs';
import { buildRow, buildBackdatedDepartureRow } from '../../../gh-timing-comment.mjs';

const LIFECYCLE_EVENTS = [
  ['backlog:created', 'lifecycle', 'backlog'],
  ['on-deck:started', 'lifecycle', 'on-deck'],
  ['refine:started', 'lifecycle', 'refine'],
  ['refine:completed', 'lifecycle', 'refine'],
  ['plan:started', 'lifecycle', 'plan'],
  ['plan:completed', 'lifecycle', 'plan'],
  ['develop:started', 'lifecycle', 'develop'],
  ['develop:completed', 'lifecycle', 'develop'],
  ['test:started', 'lifecycle', 'test'],
  ['test:passed', 'lifecycle', 'test'],
  ['review:started', 'lifecycle', 'review'],
  ['review:approved', 'lifecycle', 'review'],
  ['issue:wrap', 'lifecycle', null],
  ['issue:closed', 'lifecycle', null],
];

const AUDIT_EVENTS = [
  'demoted',
  'out-of-band-move',
  'gate-refused',
  'update',
  'pre-compact-flush',
  'post-compact-resume',
  'session-start',
  'session-end-recovery',
  'lifecycle-warn',
  'unauthorized-close',
  'chore-mode-enter',
  'closed-with-dirty-tree',
  'switch-end',
  'review:failed',
  'review:passed',
  'test:failed',
  'rejected:develop',
  'discovery: idle-reconciled',
];

test('every exact event has one frozen canonical descriptor and classification', () => {
  const descriptors = exactTimingEventDescriptors();
  assert.equal(descriptors.length, 37);
  assert.equal(new Set(descriptors.map(({ event }) => event)).size, descriptors.length);
  assert.equal(Object.isFrozen(descriptors), true);

  for (const descriptor of descriptors) {
    assert.equal(Object.isFrozen(descriptor), true, descriptor.event);
    assert.equal(describeTimingEvent(descriptor.event), descriptor);
    assert.equal(isKnownTimingEvent(descriptor.event), true);
    assert.equal(classifyTimingEvent(descriptor.event), descriptor.eventClass);
  }

  for (const [event, kind, stage] of LIFECYCLE_EVENTS) {
    const descriptor = describeTimingEvent(event);
    assert.equal(descriptor.kind, kind, event);
    assert.equal(descriptor.stage, stage, event);
    assert.equal(descriptor.emittable, true, event);
  }
});

test('parameterized event families validate payload grammar', () => {
  const valid = [
    ['demoted:develop', EVENT_CLASS.PHASE, 'audit'],
    ['pause:orphan-recovery', EVENT_CLASS.DEPARTURE, 'departure'],
    ['resume:manual', EVENT_CLASS.REENGAGEMENT, 'reengagement'],
    ['switch-out:#1010', EVENT_CLASS.DEPARTURE, 'departure'],
  ];
  for (const [event, eventClass, kind] of valid) {
    const descriptor = describeTimingEvent(event);
    assert.ok(descriptor, event);
    assert.equal(Object.isFrozen(descriptor), true, event);
    assert.equal(descriptor.family, 'parameterized', event);
    assert.equal(descriptor.eventClass, eventClass, event);
    assert.equal(descriptor.kind, kind, event);
    assert.equal(descriptor.emittable, true, event);
  }

  for (const event of [
    'demoted:not-a-state',
    'pause:',
    'pause:two words',
    'pause:two:parts',
    'resume:',
    'resume:two words',
    'switch-out:#0',
    'switch-out:1010',
    'switch-out:#abc',
    'unknown:anything',
  ]) {
    assert.equal(describeTimingEvent(event), null, event);
    assert.equal(isKnownTimingEvent(event), false, event);
    assert.equal(isEmittableTimingEvent(event), false, event);
  }
});

test('legacy aliases remain readable while retired vocabulary cannot be emitted', () => {
  for (const event of ['pause', 'switch-out', 'switch-in', 'switch-in:#1010', 'end']) {
    const descriptor = describeTimingEvent(event);
    assert.equal(descriptor.legacy, true, event);
    assert.equal(descriptor.retired, false, event);
    assert.equal(descriptor.emittable, false, event);
    assert.equal(isKnownTimingEvent(event), true, event);
  }

  for (const event of ['idle', 'active-work']) {
    const descriptor = describeTimingEvent(event);
    assert.equal(descriptor.retired, true, event);
    assert.equal(descriptor.emittable, false, event);
    assert.equal(descriptor.eventClass, EVENT_CLASS.PHASE, event);
    assert.equal(isRetiredTimingEvent(event), true, event);
    assert.equal(isEmittableTimingEvent(event), false, event);
  }
  assert.equal(isRetiredTimingEvent('idle:legacy-detail'), true);
  assert.equal(isRetiredTimingEvent('active-work:legacy-detail'), true);
});

test('central row construction refuses unknown, legacy, and retired emission', () => {
  const row = {
    ts: new Date().toISOString(),
    activeSec: 0,
    idleSec: 0,
    deltaWords: 0,
    wordMarker: 0,
  };
  for (const event of ['unknown:anything', 'pause', 'idle', 'active-work']) {
    assert.throws(
      () => buildRow({ ...row, event }),
      /refusing non-emittable Timing Log event/,
      event
    );
  }
  assert.match(buildRow({ ...row, event: 'update' }), /\| update \|/);

  for (const event of ['unknown:anything', 'idle', 'active-work', 'update']) {
    assert.throws(
      () =>
        buildBackdatedDepartureRow({
          ts: row.ts,
          event,
          wordMarker: 0,
        }),
      /refusing non-emittable departure Timing Log event/,
      event
    );
  }
  assert.match(
    buildBackdatedDepartureRow({
      ts: row.ts,
      event: 'pause:auto-detected-gap',
      wordMarker: 0,
    }),
    /\| pause:auto-detected-gap \|/
  );
});

test('audit events are neutral timing phases without lifecycle-stage identity', () => {
  for (const event of AUDIT_EVENTS) {
    const descriptor = describeTimingEvent(event);
    assert.equal(descriptor.kind, 'audit', event);
    assert.equal(descriptor.eventClass, EVENT_CLASS.PHASE, event);
    assert.equal(stageOfTimingEvent(event), null, event);
  }
  assert.equal(stageOfTimingEvent('review:failed'), null);
  assert.equal(stageOfTimingEvent('test:failed'), null);
});

test('canonical timing queries preserve lifecycle and accounting contracts', () => {
  assert.deepEqual(
    lifecycleTimingEventSlugs(),
    LIFECYCLE_EVENTS.map(([event]) => event)
  );
  for (const [event, , stage] of LIFECYCLE_EVENTS) {
    assert.equal(classifyTimingEventForAccounting(event), EVENT_CLASS.PHASE, event);
    assert.equal(isCanonicalPhaseEvent(event), true, event);
    if (stage && PHASE_EVENTS[stage]) {
      const kind = PHASE_EVENTS[stage].enter?.event === event ? 'enter' : 'complete';
      assert.equal(resolvePhaseEvent({ state: stage, phase: kind })?.event, event);
    }
  }

  assert.deepEqual(classifyEvent('pause:manual'), {
    role: 'open',
    kind: 'pause',
    reason: 'manual',
  });
  assert.deepEqual(classifyEvent('switch-out:#1010'), {
    role: 'open',
    kind: 'switch-out',
    peer: '#1010',
  });
  assert.deepEqual(classifyEvent('idle'), { role: 'open', kind: 'idle' });
  assert.deepEqual(classifyEvent('resumed'), { role: 'close' });
});

test('accounting classification keeps unknown historical rows neutral while strict reads reject them', () => {
  assert.equal(classifyTimingEvent('historical-unknown'), null);
  assert.equal(classifyTimingEventForAccounting('historical-unknown'), EVENT_CLASS.PHASE);
  assert.equal(classifyTimingEventForAccounting(''), null);
  assert.equal(classifyTimingEventForAccounting(null), null);
});

test('timing-event policy is a leaf package with only sibling lifecycle identity input', () => {
  for (const file of ['catalog.mjs', 'parameterized.mjs', 'legacy.mjs', 'index.mjs']) {
    const source = readFileSync(
      new URL(`../../../lib/timing-events/${file}`, import.meta.url),
      'utf8'
    );
    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      assert.match(match[1], /^(\.\/|\.\.\/lifecycle-policy\/)/, `${file}: ${match[1]}`);
    }
  }
});
