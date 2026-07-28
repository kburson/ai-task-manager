import { EVENT_CLASS } from './catalog.mjs';

function legacyDescriptor({
  event,
  kind,
  eventClass = EVENT_CLASS.PHASE,
  stage = null,
  retired = false,
  role = null,
  interruptionKind = null,
  reason = null,
  peer = null,
}) {
  return Object.freeze({
    event,
    family: retired ? 'retired' : 'legacy',
    kind,
    eventClass,
    stage,
    phase: null,
    description: '',
    emittable: false,
    legacy: true,
    retired,
    canonicalPhase: false,
    role,
    interruptionKind,
    reason,
    peer,
  });
}

const EXACT_LEGACY = new Map([
  [
    'pause',
    legacyDescriptor({
      event: 'pause',
      kind: 'departure',
      eventClass: EVENT_CLASS.DEPARTURE,
      role: 'open',
      interruptionKind: 'pause',
    }),
  ],
  [
    'switch-out',
    legacyDescriptor({
      event: 'switch-out',
      kind: 'departure',
      eventClass: EVENT_CLASS.DEPARTURE,
      role: 'open',
      interruptionKind: 'switch-out',
    }),
  ],
  [
    'switch-in',
    legacyDescriptor({
      event: 'switch-in',
      kind: 'reengagement',
      eventClass: EVENT_CLASS.REENGAGEMENT,
      role: 'close',
    }),
  ],
  ['end', legacyDescriptor({ event: 'end', kind: 'audit' })],
  [
    'done:started',
    legacyDescriptor({
      event: 'done:started',
      kind: 'lifecycle',
      stage: 'done',
    }),
  ],
  [
    'idle',
    legacyDescriptor({
      event: 'idle',
      kind: 'retired',
      retired: true,
      interruptionKind: 'idle',
    }),
  ],
  [
    'active-work',
    legacyDescriptor({
      event: 'active-work',
      kind: 'retired',
      retired: true,
    }),
  ],
]);

export function describeLegacyTimingEvent(event) {
  const exact = EXACT_LEGACY.get(event);
  if (exact) return exact;

  const match = event.match(/^switch-in:(\S+)$/);
  if (!match) return null;
  return legacyDescriptor({
    event,
    kind: 'reengagement',
    eventClass: EVENT_CLASS.REENGAGEMENT,
    role: 'close',
    peer: match[1],
  });
}

export function isRetiredTimingEventInput(event) {
  return (
    event === 'idle' ||
    event === 'active-work' ||
    event.startsWith('idle:') ||
    event.startsWith('active-work:')
  );
}
