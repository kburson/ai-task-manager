// @story #1007
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STATE_IDS,
  EXECUTABLE_MATRIX,
  ENTRY_HISTORY_MATRIX,
  TIMING_HISTORY_MATRIX,
  ACTION_BASELINE,
} from '../../fixtures/state-engine-policy-baseline.mjs';
import { stateIds, validateTransition } from '../../../lib/lifecycle-policy/index.mjs';
import { LEGAL_TRANSITIONS } from '../../../lib/stage-entry-markers.mjs';
import { validate as validateTimingLog } from '../../../lib/agent-review/validators/timing-log-sequence.mjs';
import { VERB_HOME_STATE, assertVerbHomeState } from '../../../lib/verb-home-state-guard.mjs';
import { PHASE_EVENTS } from '../../../phase-events.mjs';
import { ALIAS_VERB, runPromote } from '../../../verbs/promote.mjs';
import { runRefine } from '../../../verbs/refine.mjs';
import { LEGAL_FROM as DEMOTE_FROM, DEMOTE_TARGET } from '../../../verbs/demote.mjs';
import { LEGAL_FROM as PARK_FROM, PARK_TARGET } from '../../../verbs/park.mjs';

const TEST_CFG = { repo: 'owner/repo', projectId: 'PVT_TEST' };
const PRODUCTION_STATES = stateIds();

test('the production lifecycle keeps eight states and canonically names Ready for Planning', () => {
  assert.deepEqual(PRODUCTION_STATES, [
    'backlog',
    'refine',
    'ready-for-plan',
    'plan',
    'develop',
    'test',
    'review',
    'done',
  ]);
});

function orderedPairKeys() {
  return STATE_IDS.flatMap((from) => STATE_IDS.map((to) => `${from}->${to}`));
}

function timingWalkPasses(from, to) {
  const ts1 = '2026-07-27T00:00:00.000Z';
  const ts2 = '2026-07-27T00:00:01.000Z';
  const comments = [
    {
      body: [
        '## ⏱ Timing Log',
        '| Timestamp | Event | Active | Idle | Words | Marker | Description |',
        '|---|---|---:|---:|---:|---:|---|',
        `| ${ts1} | ${timingEntryEvent(from)} | 0 | 0 | 0 | 0 | first |`,
        `| ${ts2} | ${timingEntryEvent(to)} | 0 | 0 | 0 | 0 | second |`,
      ].join('\n'),
    },
  ];
  const enteredStages = [...new Set([from, to])].map((stage) => ({ stage }));
  return validateTimingLog({ comments, markers: { enteredStages } }).pass;
}

function timingEntryEvent(state) {
  // Done's canonical current event is `issue:wrap`, which intentionally has no
  // lifecycle-stage prefix. The strict reader retains `done:started` as a
  // historical alias so this C1 matrix can still observe done-stage edges.
  return state === 'done' ? 'done:started' : PHASE_EVENTS[state].enter.event;
}

function bodyWithRecordedState(state) {
  const marker =
    state == null
      ? ''
      : `<!-- aitm-last-known-state: ${state} -->\n` +
        '<!-- aitm-last-known-state-ts: 2026-07-27T00:00:00Z -->\n';
  return `${marker}\n## User Story\n\nCharacterization fixture.\n`;
}

async function observeRefine(recordedState) {
  const body = bodyWithRecordedState(recordedState);
  const promoteCalls = [];
  try {
    const result = await runRefine({
      args: {
        issueNumber: 1007,
        size: 'S',
        estimate: '2',
        priority: 'p1',
        reason: `characterize ${recordedState ?? 'bootstrap'}`,
      },
      cfg: TEST_CFG,
      deps: {
        projectDir: process.cwd(),
        assertBound: () => {},
        tetherIssueToProject: async () => ({ itemId: 'PVTI_TEST' }),
        fetchBody: async () => body,
        mutateBody: async ({ mutate }) => {
          mutate(body);
          return { status: 'ok' };
        },
        loadProjectFieldDefs: () => [],
        ensureIssueFieldDb: (next) => ({ body: next }),
        verbPromote: async () => {
          promoteCalls.push(recordedState);
        },
      },
    });
    return { recordedState, promoteCalls, result, error: null };
  } catch (error) {
    return { recordedState, promoteCalls, result: null, error };
  }
}

test('the baseline names the canonical eight states in production order', () => {
  assert.deepEqual(STATE_IDS, PRODUCTION_STATES);
});

test('all three lifecycle projections explicitly cover all 64 ordered pairs', () => {
  const keys = orderedPairKeys();
  assert.equal(keys.length, 64);
  for (const matrix of [EXECUTABLE_MATRIX, ENTRY_HISTORY_MATRIX, TIMING_HISTORY_MATRIX]) {
    assert.deepEqual(Object.keys(matrix), keys);
  }
});

test('the executable matrix matches pre-refactor transition validation for every pair', () => {
  for (const key of orderedPairKeys()) {
    const [from, to] = key.split('->');
    const actual = validateTransition(from, to);
    assert.deepEqual(
      EXECUTABLE_MATRIX[key],
      { allowed: actual.ok, noop: actual.noop === true },
      key
    );
  }
});

test('the entry-history matrix matches the current marker-history edge set', () => {
  for (const key of orderedPairKeys()) {
    assert.equal(ENTRY_HISTORY_MATRIX[key], LEGAL_TRANSITIONS.has(key), key);
  }
});

test('the timing-history matrix matches the current strict timing walk', () => {
  for (const key of orderedPairKeys()) {
    const [from, to] = key.split('->');
    assert.equal(TIMING_HISTORY_MATRIX[key], timingWalkPasses(from, to), key);
  }
});

test('same-state requests are executable no-ops but remain valid history rows', () => {
  for (const state of STATE_IDS) {
    const key = `${state}->${state}`;
    assert.deepEqual(EXECUTABLE_MATRIX[key], { allowed: true, noop: true });
    assert.equal(ENTRY_HISTORY_MATRIX[key], false);
    assert.equal(TIMING_HISTORY_MATRIX[key], true);
  }
});

test('reverse and history-only distinctions remain explicit', () => {
  assert.deepEqual(EXECUTABLE_MATRIX['develop->plan'], { allowed: false, noop: false });
  assert.equal(ENTRY_HISTORY_MATRIX['develop->plan'], true);
  assert.equal(TIMING_HISTORY_MATRIX['develop->plan'], false);
  assert.deepEqual(EXECUTABLE_MATRIX['done->test'], { allowed: false, noop: false });
  assert.equal(ENTRY_HISTORY_MATRIX['done->test'], false);
  assert.equal(TIMING_HISTORY_MATRIX['done->test'], true);
});

test('action eligibility and delegation match current verb exports', () => {
  assert.deepEqual(ACTION_BASELINE.homeStates, VERB_HOME_STATE);
  assert.deepEqual(ACTION_BASELINE.promoteDelegation, ALIAS_VERB);
  assert.deepEqual(ACTION_BASELINE.demote, {
    from: [...DEMOTE_FROM],
    to: DEMOTE_TARGET,
    requires: 'rework-reason',
  });
  assert.deepEqual(ACTION_BASELINE.park, {
    from: [...PARK_FROM],
    to: PARK_TARGET,
    requires: 'reason',
  });
});

test('refine entry and self-run policy match injected production behavior', async () => {
  const observations = await Promise.all(
    ['backlog', 'refine', 'ready-for-plan', 'plan'].map(observeRefine)
  );
  assert.deepEqual(
    observations.map(({ promoteCalls }) => promoteCalls.length),
    [1, 1, 0, 0]
  );
  assert.deepEqual(
    ACTION_BASELINE.refine.from,
    observations
      .filter(({ promoteCalls }) => promoteCalls.length > 0)
      .map(({ recordedState }) => recordedState)
  );
  const refineSelfRun = observations.find(({ recordedState }) => recordedState === 'refine');
  assert.equal(refineSelfRun.result.status, 'refined');
  assert.equal(refineSelfRun.result.promoted, true);
  for (const state of ['ready-for-plan', 'plan']) {
    assert.match(
      observations.find(({ recordedState }) => recordedState === state).error.message,
      /is not Backlog or Refine/
    );
  }
  assert.equal(ACTION_BASELINE.refine.selfRun, 'complete-to-ready-for-plan');
});

test('bootstrap policy resolves live state and refuses a missing board item', async () => {
  assert.doesNotThrow(() =>
    assertVerbHomeState({ verb: 'test', currentState: null, issueNumber: 1007 })
  );

  const missing = await runPromote({
    issueNumber: 1007,
    cfg: TEST_CFG,
    deps: {
      projectDir: process.cwd(),
      assertBound: () => {},
      fetchIssueBody: async () => ({ body: bodyWithRecordedState(null) }),
      getLiveState: async () => null,
    },
  });
  assert.equal(missing.status, 'error');
  assert.match(missing.message, /no recorded state and no live state/);
  assert.equal(ACTION_BASELINE.bootstrap.recordedState, null);
  assert.equal(ACTION_BASELINE.bootstrap.missingBoardItem, 'refuse');

  let bootstrappedBody = null;
  const resolved = await runPromote({
    issueNumber: 1007,
    cfg: TEST_CFG,
    deps: {
      projectDir: process.cwd(),
      assertBound: () => {},
      fetchIssueBody: async () => ({ body: bodyWithRecordedState(null) }),
      getLiveState: async () => 'backlog',
      mutateIssueBody: async ({ mutate }) => {
        bootstrappedBody = mutate(bodyWithRecordedState(null));
        return { status: 'ok' };
      },
      runMoveState: async () => 0,
    },
  });
  assert.equal(resolved.status, 'promoted');
  assert.equal(resolved.bootstrapped, true);
  assert.deepEqual([resolved.from, resolved.to], ['backlog', 'refine']);
  assert.match(bootstrappedBody, /aitm-last-known-state state="backlog"/);
  assert.equal(ACTION_BASELINE.bootstrap.behavior, 'resolve-live-state-then-apply-action-policy');
});
