export const STATE_IDS = Object.freeze([
  'backlog',
  'refine',
  'ready-for-plan',
  'plan',
  'develop',
  'test',
  'review',
  'done',
]);

const FORWARD_EDGES = Object.freeze([
  'backlog->refine',
  'refine->ready-for-plan',
  'ready-for-plan->plan',
  'plan->develop',
  'develop->test',
  'test->review',
  'review->done',
]);

const EXECUTABLE_REVERSE_EDGES = Object.freeze([
  'ready-for-plan->backlog',
  'refine->backlog',
  'plan->ready-for-plan',
  'test->develop',
  'review->develop',
  'review->test',
]);

const ENTRY_HISTORY_REVERSE_EDGES = Object.freeze([
  'review->develop',
  'review->test',
  'test->develop',
  'develop->plan',
  'develop->ready-for-plan',
  'plan->ready-for-plan',
  'plan->backlog',
  'refine->backlog',
  'ready-for-plan->backlog',
  'backlog->ready-for-plan',
  'refine->plan',
  'ready-for-plan->refine',
]);

const TIMING_HISTORY_REVERSE_EDGES = Object.freeze([
  'ready-for-plan->backlog',
  'plan->ready-for-plan',
  'test->develop',
  'review->test',
  'review->develop',
  'done->test',
  'backlog->ready-for-plan',
  'refine->plan',
  'ready-for-plan->refine',
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
    from: Object.freeze(['backlog', 'refine']),
    selfRun: 'complete-to-ready-for-plan',
  }),
  demote: Object.freeze({
    from: Object.freeze(['test', 'review']),
    to: 'develop',
    requires: 'rework-reason',
  }),
  park: Object.freeze({
    from: Object.freeze(['refine', 'ready-for-plan']),
    to: 'backlog',
    requires: 'reason',
  }),
  shelve: Object.freeze({
    from: Object.freeze(['refine', 'ready-for-plan']),
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
  'refine:started',
  'refine:completed',
  'ready-for-plan:started',
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
      line: [52, 53, 54, 56, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71][index],
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
    timingEmitter('scripts/gh/dispatch-prep.mjs', 105, 'event-call', "'start'", ['start']),
    timingEmitter('scripts/gh/ensure-wave-parent.mjs', 335, 'event-call', "'start'", ['start']),
    timingEmitter(
      'scripts/task-tracker/gh-timing-comment.mjs',
      331,
      'phase-call',
      "{ state: 'review', phase: 'complete' }",
      ['review:approved']
    ),
    timingEmitter(
      'scripts/task-tracker/gh-timing-comment.mjs',
      340,
      'phase-call',
      "{ state: 'done', phase: 'enter' }",
      ['issue:wrap']
    ),
    timingEmitter(
      'scripts/task-tracker/hook-handler.mjs',
      166,
      'event-call',
      "'pre-compact-flush'",
      ['pre-compact-flush']
    ),
    timingEmitter(
      'scripts/task-tracker/hook-handler.mjs',
      212,
      'event-call',
      "'post-compact-resume'",
      ['post-compact-resume']
    ),
    timingEmitter(
      'scripts/task-tracker/hook-handler.mjs',
      274,
      'event-spec',
      "'session-end-recovery'",
      ['session-end-recovery']
    ),
    timingEmitter(
      'scripts/task-tracker/hook-handler.mjs',
      287,
      'event-spec',
      "'pause:orphan-recovery'",
      ['pause:orphan-recovery']
    ),
    timingEmitter('scripts/task-tracker/hook-handler.mjs', 296, 'event-spec', "'resumed'", [
      'resumed',
    ]),
    timingEmitter('scripts/task-tracker/hook-handler.mjs', 479, 'event-call', "'session-start'", [
      'session-start',
    ]),
    timingEmitter('scripts/task-tracker/hooks/on-ask.mjs', 184, 'event-call', "'paused'", [
      'paused',
    ]),
    timingEmitter('scripts/task-tracker/hooks/on-ask.mjs', 240, 'event-call', "'resume'", [
      'resume',
    ]),
    timingEmitter(
      'scripts/task-tracker/lib/move-state/audit-timing.mjs',
      110,
      'event-call',
      '`demoted:${stateArg}`',
      ['demoted:develop']
    ),
    timingEmitter(
      'scripts/task-tracker/lib/move-state/audit-timing.mjs',
      155,
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
      185,
      'phase-call',
      "{ state: 'done', phase: 'complete' }",
      ['issue:closed']
    ),
    timingEmitter(
      'scripts/task-tracker/lib/move-state/audit-timing.mjs',
      204,
      'phase-call',
      "{ state: stateArg, phase: 'enter' }",
      [
        'backlog:created',
        'ready-for-plan:started',
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
      322,
      'event-call',
      "'out-of-band-move'",
      ['out-of-band-move']
    ),
    timingEmitter(
      'scripts/task-tracker/lib/move-state/guard-execution.mjs',
      259,
      'event-call',
      "'gate-refused'",
      ['gate-refused']
    ),
    timingEmitter(
      'scripts/task-tracker/lib/move-state/guard-execution.mjs',
      322,
      'event-call',
      "'lifecycle-warn'",
      ['lifecycle-warn']
    ),
    timingEmitter('scripts/task-tracker/verbs/approve.mjs', 409, 'event-call', "'lifecycle-warn'", [
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
      1944,
      'event-call',
      "'unauthorized-close'",
      ['unauthorized-close']
    ),
    timingEmitter(
      'scripts/task-tracker/verbs/close.mjs',
      2142,
      'event-call',
      "'closed-with-dirty-tree'",
      ['closed-with-dirty-tree']
    ),
    timingEmitter('scripts/task-tracker/verbs/close.mjs', 2287, 'event-call', "'lifecycle-warn'", [
      'lifecycle-warn',
    ]),
    timingEmitter(
      'scripts/task-tracker/verbs/close.mjs',
      2521,
      'event-call',
      '_PEcascade.done.enter.event',
      ['issue:wrap']
    ),
    timingEmitter('scripts/task-tracker/verbs/discover.mjs', 16, 'flush-call', "'switch-end'", [
      'switch-end',
    ]),
    timingEmitter(
      'scripts/task-tracker/verbs/new.mjs',
      217,
      'flush-call',
      '`switch-out:${issue}`',
      ['switch-out:#1007']
    ),
    timingEmitter(
      'scripts/task-tracker/verbs/new.mjs',
      250,
      'event-call',
      'PHASE_EVENTS.backlog.enter.event',
      ['backlog:created']
    ),
    timingEmitter(
      'scripts/task-tracker/verbs/new.mjs',
      278,
      'event-call',
      "'discovery: idle-reconciled'",
      ['discovery: idle-reconciled']
    ),
    timingEmitter('scripts/task-tracker/verbs/new.mjs', 315, 'event-call', "'start'", ['start']),
    timingEmitter('scripts/task-tracker/verbs/pause.mjs', 31, 'flush-call', 'pauseEvent', [
      'pause:other',
    ]),
    timingEmitter('scripts/task-tracker/verbs/reject.mjs', 71, 'event-call', "'rejected:develop'", [
      'rejected:develop',
    ]),
    timingEmitter('scripts/task-tracker/verbs/resume.mjs', 244, 'event-call', "'resumed'", [
      'resumed',
    ]),
    timingEmitter(
      'scripts/task-tracker/verbs/resume.mjs',
      472,
      'event-call',
      "'pause:auto-detected-gap'",
      ['pause:auto-detected-gap']
    ),
    timingEmitter('scripts/task-tracker/verbs/resume.mjs', 497, 'event-call', 'bindEvent', [
      'start',
      'resumed',
    ]),
    timingEmitter('scripts/task-tracker/verbs/review.mjs', 617, 'event-call', "'review:failed'", [
      'review:failed',
    ]),
    timingEmitter('scripts/task-tracker/verbs/review.mjs', 658, 'event-call', "'review:passed'", [
      'review:passed',
    ]),
    timingEmitter('scripts/task-tracker/verbs/review.mjs', 694, 'event-call', "'test:failed'", [
      'test:failed',
    ]),
    timingEmitter('scripts/task-tracker/verbs/review.mjs', 868, 'event-call', "'gate-refused'", [
      'gate-refused',
    ]),
    timingEmitter('scripts/task-tracker/verbs/review.mjs', 1381, 'event-call', "'gate-refused'", [
      'gate-refused',
    ]),
    timingEmitter('scripts/task-tracker/verbs/stop.mjs', 48, 'flush-call', "'stop'", ['stop']),
    timingEmitter('scripts/task-tracker/verbs/switch.mjs', 117, 'flush-call', 'eventSlug', [
      'switch-out:#1007',
    ]),
    timingEmitter('scripts/task-tracker/verbs/switch.mjs', 235, 'event-call', 'bindEvent', [
      'start',
      'resumed',
    ]),
    timingEmitter('scripts/task-tracker/verbs/update.mjs', 22, 'flush-call', "'update'", [
      'update',
    ]),
  ]),
});
