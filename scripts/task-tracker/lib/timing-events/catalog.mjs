// Canonical exact Timing Log event descriptors.

export const EVENT_CLASS = Object.freeze({
  DEPARTURE: 'departure',
  REENGAGEMENT: 'reengagement',
  PHASE: 'phase',
});

function descriptor({
  event,
  kind,
  eventClass = EVENT_CLASS.PHASE,
  state = null,
  stage = null,
  phase = null,
  description = '',
  emittable = true,
  legacy = false,
  canonicalPhase = false,
  role = null,
  interruptionKind = null,
  terminalReviewHandoffCloser = false,
}) {
  return Object.freeze({
    event,
    family: 'exact',
    kind,
    eventClass,
    state: state ?? stage,
    stage,
    phase,
    description,
    emittable,
    legacy,
    retired: false,
    canonicalPhase,
    role,
    interruptionKind,
    terminalReviewHandoffCloser,
  });
}

const TERMINAL_REVIEW_HANDOFF_CLOSERS = new Set([
  'review:started',
  'review:failed',
  'review:approved',
  'issue:wrap',
  'issue:closed',
]);

const LIFECYCLE = [
  ['backlog:created', 'backlog', 'backlog', 'enter', 'task created in Backlog'],
  ['assigned:started', 'assigned', 'assigned', 'enter', 'assigned and ready to work'],
  ['refine:started', 'refine', 'refine', 'enter', 'start refinement'],
  ['refine:completed', 'refine', 'refine', 'complete', 'refinement completed'],
  ['plan:started', 'plan', 'plan', 'enter', 'plan started'],
  ['plan:completed', 'plan', 'plan', 'complete', 'plan completed — waiting approval'],
  ['develop:started', 'develop', 'develop', 'enter', 'start development'],
  ['develop:completed', 'develop', 'develop', 'complete', 'development complete'],
  ['test:started', 'test', 'test', 'enter', 'start testing'],
  ['test:passed', 'test', 'test', 'complete', 'testing complete'],
  ['review:started', 'review', 'review', 'enter', 'waiting in review'],
  ['review:approved', 'review', 'review', 'complete', 'story approved'],
  ['issue:wrap', 'done', null, 'enter', 'wrap-up — finalizing for close'],
  ['issue:closed', 'done', null, 'complete', 'issue closed — ready for next story'],
].map(([event, state, stage, phase, description]) =>
  descriptor({
    event,
    kind: 'lifecycle',
    state,
    stage,
    phase,
    description,
    canonicalPhase: true,
    terminalReviewHandoffCloser: TERMINAL_REVIEW_HANDOFF_CLOSERS.has(event),
  })
);

const CANONICAL_AUDIT_PHASES = new Set([
  'demoted',
  'out-of-band-move',
  'gate-refused',
  'update',
  'pre-compact-flush',
  'post-compact-resume',
  'session-end-recovery',
  'session-start',
  'lifecycle-warn',
  'unauthorized-close',
  'chore-mode-enter',
  'closed-with-dirty-tree',
  'switch-end',
]);

const AUDIT = [
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
].map((event) =>
  descriptor({
    event,
    kind: 'audit',
    emittable: event !== 'demoted',
    legacy: event === 'demoted',
    canonicalPhase: CANONICAL_AUDIT_PHASES.has(event),
    terminalReviewHandoffCloser: TERMINAL_REVIEW_HANDOFF_CLOSERS.has(event),
  })
);

const INTERRUPTION = [
  descriptor({
    event: 'paused',
    kind: 'departure',
    eventClass: EVENT_CLASS.DEPARTURE,
    role: 'open',
    interruptionKind: 'pause',
  }),
  descriptor({
    event: 'stop',
    kind: 'departure',
    eventClass: EVENT_CLASS.DEPARTURE,
    role: 'open',
    interruptionKind: 'stop',
  }),
  descriptor({
    event: 'start',
    kind: 'reengagement',
    eventClass: EVENT_CLASS.REENGAGEMENT,
    role: 'close',
  }),
  descriptor({
    event: 'resumed',
    kind: 'reengagement',
    eventClass: EVENT_CLASS.REENGAGEMENT,
    role: 'close',
  }),
  descriptor({
    event: 'resume',
    kind: 'reengagement',
    eventClass: EVENT_CLASS.REENGAGEMENT,
    role: 'close',
  }),
];

export const LIFECYCLE_EVENT_DESCRIPTORS = Object.freeze(LIFECYCLE);
export const EXACT_TIMING_EVENT_DESCRIPTORS = Object.freeze([
  ...LIFECYCLE,
  ...AUDIT,
  ...INTERRUPTION,
]);

const EXACT_TIMING_EVENT_BY_SLUG = new Map(
  EXACT_TIMING_EVENT_DESCRIPTORS.map((item) => [item.event, item])
);

export function describeExactTimingEvent(event) {
  return EXACT_TIMING_EVENT_BY_SLUG.get(event) ?? null;
}
