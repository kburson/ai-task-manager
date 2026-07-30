export const STATE_IDS = Object.freeze([
  'backlog',
  'on-deck',
  'refine',
  'plan',
  'develop',
  'test',
  'review',
  'done',
]);

const FORWARD_EDGES = Object.freeze([
  'backlog->on-deck',
  'on-deck->refine',
  'refine->plan',
  'plan->develop',
  'develop->test',
  'test->review',
  'review->done',
]);

const EXECUTABLE_REVERSE_EDGES = Object.freeze([
  'on-deck->backlog',
  'refine->backlog',
  'plan->backlog',
  'test->develop',
  'review->develop',
  'review->test',
]);

const ENTRY_HISTORY_REVERSE_EDGES = Object.freeze([
  'review->develop',
  'review->test',
  'test->develop',
  'develop->plan',
  'develop->refine',
  'plan->refine',
  'plan->backlog',
  'refine->backlog',
  'on-deck->backlog',
]);

const TIMING_HISTORY_REVERSE_EDGES = Object.freeze([
  'test->develop',
  'review->test',
  'review->develop',
  'done->test',
]);

function pairMatrix(build) {
  return Object.freeze(
    Object.fromEntries(
      STATE_IDS.flatMap((from) =>
        STATE_IDS.map((to) => {
          const key = `${from}->${to}`;
          return [key, build({ from, to, key })];
        })
      )
    )
  );
}

export const EXECUTABLE_MATRIX = pairMatrix(({ from, to, key }) =>
  Object.freeze({
    allowed: from === to || FORWARD_EDGES.includes(key) || EXECUTABLE_REVERSE_EDGES.includes(key),
    noop: from === to,
  })
);

export const ENTRY_HISTORY_MATRIX = pairMatrix(
  ({ key }) => FORWARD_EDGES.includes(key) || ENTRY_HISTORY_REVERSE_EDGES.includes(key)
);

export const TIMING_HISTORY_MATRIX = pairMatrix(
  ({ from, to, key }) =>
    from === to || FORWARD_EDGES.includes(key) || TIMING_HISTORY_REVERSE_EDGES.includes(key)
);

export const ACTION_BASELINE = Object.freeze({
  homeStates: Object.freeze({
    test: Object.freeze(['develop', 'test', 'review']),
    review: Object.freeze(['test', 'review']),
    close: 'review',
  }),
  promoteDelegation: Object.freeze({
    develop: 'test',
    test: 'review',
    review: 'close',
  }),
  refine: Object.freeze({
    from: Object.freeze(['backlog', 'on-deck']),
    selfRun: 're-estimate-in-place',
  }),
  demote: Object.freeze({
    from: Object.freeze(['test', 'review']),
    to: 'develop',
    requires: 'rework-reason',
  }),
  park: Object.freeze({
    from: Object.freeze(['refine', 'plan']),
    to: 'backlog',
    requires: 'reason',
  }),
  bootstrap: Object.freeze({
    recordedState: null,
    behavior: 'resolve-live-state-then-apply-action-policy',
    missingBoardItem: 'refuse',
  }),
});

const TIMING_EXACT = Object.freeze([
  'backlog:created',
  'on-deck:started',
  'refine:started',
  'refine:completed',
  'plan:started',
  'plan:completed',
  'develop:started',
  'develop:completed',
  'test:started',
  'test:passed',
  'review:started',
  'review:approved',
  'issue:wrap',
  'issue:closed',
  'demoted',
  'out-of-band-move',
  'gate-refused',
  'update',
  'start',
  'resumed',
  'paused',
  'resume',
  'pre-compact-flush',
  'post-compact-resume',
  'session-start',
  'session-end-recovery',
  'lifecycle-warn',
  'unauthorized-close',
  'chore-mode-enter',
  'closed-with-dirty-tree',
  'switch-end',
  'stop',
  'review:failed',
  'review:passed',
  'test:failed',
  'rejected:develop',
  'discovery: idle-reconciled',
]);

const TIMING_DEFINITIONS = Object.freeze(
  TIMING_EXACT.slice(0, 14).map((event, index) =>
    Object.freeze({
      file: 'scripts/task-tracker/lib/timing-events/catalog.mjs',
      line: [42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55][index],
      expression: `'${event}'`,
      event,
    })
  )
);

function timingEmitter(file, line, kind, expression, events) {
  return Object.freeze({
    file,
    line,
    kind,
    expression,
    events: Object.freeze(events),
  });
}

export const TIMING_EVENT_BASELINE = Object.freeze({
  exact: TIMING_EXACT,
  parameterized: Object.freeze([
    Object.freeze({ name: 'demoted-target', pattern: /^demoted:[a-z-]+$/ }),
    Object.freeze({ name: 'pause-reason', pattern: /^pause:.+$/ }),
    Object.freeze({ name: 'resume-reason', pattern: /^resume:.+$/ }),
    Object.freeze({ name: 'switch-out-issue', pattern: /^switch-out:#\d+$/ }),
  ]),
  retired: Object.freeze(['idle', 'active-work']),
  definitions: TIMING_DEFINITIONS,
  emitters: Object.freeze([
    timingEmitter('scripts/gh/dispatch-prep.mjs', 104, 'event-call', "'start'", ['start']),
    timingEmitter('scripts/gh/ensure-wave-parent.mjs', 329, 'event-call', "'start'", ['start']),
    timingEmitter(
      'scripts/task-tracker/gh-timing-comment.mjs',
      255,
      'phase-call',
      "{ state: 'review', phase: 'complete' }",
      ['review:approved']
    ),
    timingEmitter(
      'scripts/task-tracker/gh-timing-comment.mjs',
      263,
      'phase-call',
      "{ state: 'done', phase: 'enter' }",
      ['issue:wrap']
    ),
    timingEmitter(
      'scripts/task-tracker/hook-handler.mjs',
      163,
      'event-call',
      "'pre-compact-flush'",
      ['pre-compact-flush']
    ),
    timingEmitter(
      'scripts/task-tracker/hook-handler.mjs',
      186,
      'event-call',
      "'post-compact-resume'",
      ['post-compact-resume']
    ),
    timingEmitter(
      'scripts/task-tracker/hook-handler.mjs',
      245,
      'event-spec',
      "'session-end-recovery'",
      ['session-end-recovery']
    ),
    timingEmitter(
      'scripts/task-tracker/hook-handler.mjs',
      258,
      'event-spec',
      "'pause:orphan-recovery'",
      ['pause:orphan-recovery']
    ),
    timingEmitter('scripts/task-tracker/hook-handler.mjs', 267, 'event-spec', "'resumed'", [
      'resumed',
    ]),
    timingEmitter('scripts/task-tracker/hook-handler.mjs', 430, 'event-call', "'session-start'", [
      'session-start',
    ]),
    timingEmitter('scripts/task-tracker/hooks/on-ask.mjs', 183, 'event-call', "'paused'", [
      'paused',
    ]),
    timingEmitter('scripts/task-tracker/hooks/on-ask.mjs', 237, 'event-call', "'resume'", [
      'resume',
    ]),
    timingEmitter(
      'scripts/task-tracker/lib/move-state/audit-timing.mjs',
      100,
      'event-call',
      '`demoted:${stateArg}`',
      ['demoted:develop']
    ),
    timingEmitter(
      'scripts/task-tracker/lib/move-state/audit-timing.mjs',
      139,
      'phase-call',
      "{ state: prev, phase: 'complete' }",
      [
        'refine:completed',
        'plan:completed',
        'develop:completed',
        'test:passed',
        'review:approved',
        'issue:closed',
      ]
    ),
    timingEmitter(
      'scripts/task-tracker/lib/move-state/audit-timing.mjs',
      163,
      'phase-call',
      "{ state: 'done', phase: 'complete' }",
      ['issue:closed']
    ),
    timingEmitter(
      'scripts/task-tracker/lib/move-state/audit-timing.mjs',
      176,
      'phase-call',
      "{ state: stateArg, phase: 'enter' }",
      [
        'backlog:created',
        'on-deck:started',
        'refine:started',
        'plan:started',
        'develop:started',
        'test:started',
        'review:started',
        'issue:wrap',
      ]
    ),
    timingEmitter(
      'scripts/task-tracker/lib/move-state/audit-timing.mjs',
      287,
      'event-call',
      "'out-of-band-move'",
      ['out-of-band-move']
    ),
    timingEmitter(
      'scripts/task-tracker/lib/move-state/guard-execution.mjs',
      216,
      'event-call',
      "'gate-refused'",
      ['gate-refused']
    ),
    timingEmitter(
      'scripts/task-tracker/lib/move-state/guard-execution.mjs',
      273,
      'event-call',
      "'lifecycle-warn'",
      ['lifecycle-warn']
    ),
    timingEmitter('scripts/task-tracker/verbs/approve.mjs', 545, 'event-call', "'lifecycle-warn'", [
      'lifecycle-warn',
    ]),
    timingEmitter(
      'scripts/task-tracker/verbs/chore-mode.mjs',
      131,
      'flush-call',
      "'chore-mode-enter'",
      ['chore-mode-enter']
    ),
    timingEmitter(
      'scripts/task-tracker/verbs/close.mjs',
      603,
      'event-call',
      "'unauthorized-close'",
      ['unauthorized-close']
    ),
    timingEmitter(
      'scripts/task-tracker/verbs/close.mjs',
      784,
      'event-call',
      "'closed-with-dirty-tree'",
      ['closed-with-dirty-tree']
    ),
    timingEmitter('scripts/task-tracker/verbs/close.mjs', 917, 'event-call', "'lifecycle-warn'", [
      'lifecycle-warn',
    ]),
    timingEmitter(
      'scripts/task-tracker/verbs/close.mjs',
      1094,
      'event-call',
      '_PEcascade.done.enter.event',
      ['issue:wrap']
    ),
    timingEmitter('scripts/task-tracker/verbs/discover.mjs', 16, 'flush-call', "'switch-end'", [
      'switch-end',
    ]),
    timingEmitter(
      'scripts/task-tracker/verbs/new.mjs',
      205,
      'flush-call',
      '`switch-out:${issue}`',
      ['switch-out:#1007']
    ),
    timingEmitter(
      'scripts/task-tracker/verbs/new.mjs',
      217,
      'event-call',
      'PHASE_EVENTS.backlog.enter.event',
      ['backlog:created']
    ),
    timingEmitter(
      'scripts/task-tracker/verbs/new.mjs',
      244,
      'event-call',
      "'discovery: idle-reconciled'",
      ['discovery: idle-reconciled']
    ),
    timingEmitter('scripts/task-tracker/verbs/new.mjs', 286, 'event-call', "'start'", ['start']),
    timingEmitter('scripts/task-tracker/verbs/pause.mjs', 30, 'flush-call', 'pauseEvent', [
      'pause:other',
    ]),
    timingEmitter('scripts/task-tracker/verbs/reject.mjs', 70, 'event-call', "'rejected:develop'", [
      'rejected:develop',
    ]),
    timingEmitter(
      'scripts/task-tracker/lib/work-lease/bind-orchestration.mjs',
      649,
      'flush-call',
      '`switch-out:${target}`',
      ['switch-out:#1007']
    ),
    timingEmitter(
      'scripts/task-tracker/lib/work-lease/bind-orchestration.mjs',
      1055,
      'event-call',
      "'pause:auto-detected-gap'",
      ['pause:auto-detected-gap']
    ),
    timingEmitter(
      'scripts/task-tracker/lib/work-lease/bind-orchestration.mjs',
      1080,
      'event-call',
      'event',
      ['start', 'resumed', 'resume:other']
    ),
    timingEmitter('scripts/task-tracker/verbs/review.mjs', 433, 'event-call', "'review:failed'", [
      'review:failed',
    ]),
    timingEmitter('scripts/task-tracker/verbs/review.mjs', 473, 'event-call', "'review:passed'", [
      'review:passed',
    ]),
    timingEmitter('scripts/task-tracker/verbs/review.mjs', 507, 'event-call', "'test:failed'", [
      'test:failed',
    ]),
    timingEmitter('scripts/task-tracker/verbs/review.mjs', 617, 'event-call', "'gate-refused'", [
      'gate-refused',
    ]),
    timingEmitter('scripts/task-tracker/verbs/review.mjs', 899, 'event-call', "'gate-refused'", [
      'gate-refused',
    ]),
    timingEmitter('scripts/task-tracker/verbs/stop.mjs', 13, 'flush-call', "'stop'", ['stop']),
    timingEmitter('scripts/task-tracker/verbs/update.mjs', 21, 'flush-call', "'update'", [
      'update',
    ]),
  ]),
});
