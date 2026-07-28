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
import { STATES as PRODUCTION_STATES, validateTransition } from '../../../state-machine.mjs';
import { LEGAL_TRANSITIONS } from '../../../lib/stage-entry-markers.mjs';
import { validate as validateTimingLog } from '../../../lib/agent-review/validators/timing-log-sequence.mjs';
import { VERB_HOME_STATE } from '../../../lib/verb-home-state-guard.mjs';
import { ALIAS_VERB } from '../../../verbs/promote.mjs';
import { LEGAL_FROM as DEMOTE_FROM, DEMOTE_TARGET } from '../../../verbs/demote.mjs';
import { LEGAL_FROM as PARK_FROM, PARK_TARGET } from '../../../verbs/park.mjs';

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
        `| ${ts1} | ${from}:started | 0 | 0 | 0 | 0 | first |`,
        `| ${ts2} | ${to}:started | 0 | 0 | 0 | 0 | second |`,
      ].join('\n'),
    },
  ];
  const enteredStages = [...new Set([from, to])].map((stage) => ({ stage }));
  return validateTimingLog({ comments, markers: { enteredStages } }).pass;
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
  assert.deepEqual(ACTION_BASELINE.refine, {
    from: ['backlog', 'on-deck'],
    selfRun: 're-estimate-in-place',
  });
});

test('bootstrap semantics remain explicit rather than inferred as a transition edge', () => {
  assert.deepEqual(ACTION_BASELINE.bootstrap, {
    recordedState: null,
    behavior: 'resolve-live-state-then-apply-action-policy',
    missingBoardItem: 'refuse',
  });
});
