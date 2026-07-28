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
]);

const PHASE_EMITTERS = Object.freeze(
  TIMING_EXACT.slice(0, 14).map((event, index) =>
    Object.freeze({
      file: 'scripts/task-tracker/phase-events.mjs',
      line: [45, 48, 51, 52, 55, 57, 62, 63, 66, 67, 70, 72, 79, 81][index],
      expression: `PHASE_EVENTS lifecycle record for ${event}`,
      event,
      rule: 'exact',
    })
  )
);

export const TIMING_EVENT_BASELINE = Object.freeze({
  exact: TIMING_EXACT,
  parameterized: Object.freeze([
    Object.freeze({ name: 'demoted-target', pattern: /^demoted:[a-z-]+$/ }),
    Object.freeze({ name: 'pause-reason', pattern: /^pause:.+$/ }),
    Object.freeze({ name: 'resume-reason', pattern: /^resume:.+$/ }),
    Object.freeze({ name: 'switch-out-issue', pattern: /^switch-out:#\d+$/ }),
  ]),
  retired: Object.freeze(['idle', 'active-work']),
  emitters: Object.freeze([
    ...PHASE_EMITTERS,
    Object.freeze({
      file: 'scripts/task-tracker/lib/move-state/audit-timing.mjs',
      line: 100,
      expression: '`demoted:${stateArg}`',
      event: 'demoted:develop',
      rule: 'demoted-target',
    }),
    Object.freeze({
      file: 'scripts/task-tracker/lib/move-state/audit-timing.mjs',
      line: 286,
      expression: "'out-of-band-move'",
      event: 'out-of-band-move',
      rule: 'exact',
    }),
    Object.freeze({
      file: 'scripts/task-tracker/lib/move-state/guard-execution.mjs',
      line: 198,
      expression: "'gate-refused'",
      event: 'gate-refused',
      rule: 'exact',
    }),
    Object.freeze({
      file: 'scripts/task-tracker/verbs/review.mjs',
      line: 317,
      expression: "'gate-refused'",
      event: 'gate-refused',
      rule: 'exact',
    }),
    Object.freeze({
      file: 'scripts/task-tracker/verbs/update.mjs',
      line: 21,
      expression: "'update'",
      event: 'update',
      rule: 'exact',
    }),
  ]),
});
