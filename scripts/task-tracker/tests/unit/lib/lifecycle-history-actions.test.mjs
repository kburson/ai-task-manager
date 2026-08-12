// @story #1009
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  isEntryHistoryEdge,
  isTimingHistoryEdge,
  actionPolicyFor,
  validateExecutableTransition,
} from '../../../lib/lifecycle-policy/index.mjs';
import {
  STATE_IDS,
  EXECUTABLE_MATRIX,
  ENTRY_HISTORY_MATRIX,
  TIMING_HISTORY_MATRIX,
  ACTION_BASELINE,
} from '../../fixtures/state-engine-policy-baseline.mjs';
import { LEGAL_TRANSITIONS } from '../../../lib/stage-entry-markers.mjs';
import { VERB_HOME_STATE } from '../../../lib/verb-home-state-guard.mjs';
import { ALIAS_VERB } from '../../../verbs/promote.mjs';
import { LEGAL_FROM as DEMOTE_FROM, DEMOTE_TARGET } from '../../../verbs/demote.mjs';
import { LEGAL_FROM as PARK_FROM, PARK_TARGET } from '../../../verbs/park.mjs';

function orderedPairs() {
  return STATE_IDS.flatMap((from) => STATE_IDS.map((to) => [from, to]));
}

test('entry and timing history queries preserve both independent C1 8x8 projections', () => {
  for (const [from, to] of orderedPairs()) {
    const key = `${from}->${to}`;
    assert.equal(isEntryHistoryEdge(from, to), ENTRY_HISTORY_MATRIX[key], `entry ${key}`);
    assert.equal(isTimingHistoryEdge(from, to), TIMING_HISTORY_MATRIX[key], `timing ${key}`);
  }

  assert.equal(isEntryHistoryEdge('missing', 'test'), false);
  assert.equal(isEntryHistoryEdge('test', 'missing'), false);
  assert.equal(isTimingHistoryEdge('missing', 'test'), false);
  assert.equal(isTimingHistoryEdge('test', 'missing'), false);
});

test('every non-self executable edge is accepted by entry history', () => {
  for (const [key, executable] of Object.entries(EXECUTABLE_MATRIX)) {
    if (!executable.allowed || executable.noop) continue;
    const [from, to] = key.split('->');
    assert.equal(isEntryHistoryEdge(from, to), true, key);
  }
});

test('history-only edges remain distinct and never authorize executable movement', () => {
  const historyOnly = [
    ['develop', 'plan', 'entry'],
    ['refine', 'plan', 'entry'],
    ['done', 'test', 'timing'],
  ];

  for (const [from, to, projection] of historyOnly) {
    assert.equal(
      projection === 'entry' ? isEntryHistoryEdge(from, to) : isTimingHistoryEdge(from, to),
      true,
      `${projection} ${from}->${to}`
    );
    assert.equal(validateExecutableTransition(from, to).kind, 'refused');
  }
});

test('action policy returns frozen allowed, refused, unknown, and bootstrap outcomes', () => {
  assert.deepEqual(actionPolicyFor('test', 'develop'), {
    ok: true,
    kind: 'allowed',
    action: 'test',
    currentState: 'develop',
    allowedStates: ['develop', 'test', 'review'],
  });
  assert.deepEqual(actionPolicyFor('test', 'plan'), {
    ok: false,
    kind: 'refused',
    action: 'test',
    currentState: 'plan',
    allowedStates: ['develop', 'test', 'review'],
  });
  assert.deepEqual(actionPolicyFor('test', 'missing'), {
    ok: false,
    kind: 'unknown-state',
    action: 'test',
    currentState: 'missing',
    allowedStates: ['develop', 'test', 'review'],
  });
  assert.deepEqual(actionPolicyFor('test', null), {
    ok: true,
    kind: 'bootstrap',
    action: 'test',
    currentState: null,
    allowedStates: ['develop', 'test', 'review'],
    bootstrap: 'resolve-live-state',
  });
  assert.deepEqual(actionPolicyFor('ship', 'test'), {
    ok: false,
    kind: 'unknown-action',
    action: 'ship',
  });

  for (const result of [
    actionPolicyFor('test', 'develop'),
    actionPolicyFor('test', 'plan'),
    actionPolicyFor('test', 'missing'),
    actionPolicyFor('test', null),
    actionPolicyFor('ship', 'test'),
  ]) {
    assert.equal(Object.isFrozen(result), true);
    if (result.allowedStates) assert.equal(Object.isFrozen(result.allowedStates), true);
  }
});

test('action descriptors preserve home states, delegation, demote, park, and refine policy', () => {
  for (const [action, allowedStates] of Object.entries(ACTION_BASELINE.homeStates)) {
    const expected = Array.isArray(allowedStates) ? allowedStates : [allowedStates];
    assert.deepEqual(actionPolicyFor(action).allowedStates, expected, action);
  }

  for (const [from, delegate] of Object.entries(ACTION_BASELINE.promoteDelegation)) {
    const result = actionPolicyFor('promote', from);
    assert.equal(result.kind, 'allowed');
    assert.equal(result.delegate, delegate);
  }
  assert.equal(actionPolicyFor('promote', 'backlog').delegate, undefined);
  assert.deepEqual(actionPolicyFor('promote', 'done'), {
    ok: false,
    kind: 'refused',
    action: 'promote',
    currentState: 'done',
    allowedStates: STATE_IDS.slice(0, -1),
  });

  assert.deepEqual(
    {
      from: actionPolicyFor('demote').allowedStates,
      to: actionPolicyFor('demote').target,
      requires: actionPolicyFor('demote').requires,
    },
    ACTION_BASELINE.demote
  );
  assert.deepEqual(
    {
      from: actionPolicyFor('park').allowedStates,
      to: actionPolicyFor('park').target,
      requires: actionPolicyFor('park').requires,
    },
    ACTION_BASELINE.park
  );
  assert.deepEqual(actionPolicyFor('refine').entryStates, ACTION_BASELINE.refine.from);
  assert.equal(actionPolicyFor('refine').selfRun, ACTION_BASELINE.refine.selfRun);
});

test('compatibility exports are derived from canonical history and action policy', () => {
  for (const [from, to] of orderedPairs()) {
    assert.equal(LEGAL_TRANSITIONS.has(`${from}->${to}`), isEntryHistoryEdge(from, to));
  }
  assert.deepEqual(VERB_HOME_STATE, ACTION_BASELINE.homeStates);
  assert.deepEqual(ALIAS_VERB, ACTION_BASELINE.promoteDelegation);
  assert.deepEqual([...DEMOTE_FROM], ACTION_BASELINE.demote.from);
  assert.equal(DEMOTE_TARGET, ACTION_BASELINE.demote.to);
  assert.deepEqual([...PARK_FROM], ACTION_BASELINE.park.from);
  assert.equal(PARK_TARGET, ACTION_BASELINE.park.to);
});

test('history and action policy keep a sibling-only package dependency boundary', async () => {
  for (const relativePath of [
    '../../../lib/lifecycle-policy/history.mjs',
    '../../../lib/lifecycle-policy/actions.mjs',
  ]) {
    const source = await readFile(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
    assert.ok(
      imports.every((specifier) => specifier.startsWith('./')),
      `${relativePath}: ${imports.join(', ')}`
    );
    assert.doesNotMatch(source, /gh-timing|stage-entry|agent-review|verbs\//);
  }
});

test('migrated consumers import lifecycle policy rather than owning action/history tables', async () => {
  for (const relativePath of [
    '../../../lib/stage-entry-markers.mjs',
    '../../../lib/agent-review/validators/timing-log-sequence.mjs',
    '../../../lib/verb-home-state-guard.mjs',
    '../../../verbs/promote.mjs',
    '../../../verbs/refine.mjs',
    '../../../verbs/demote.mjs',
    '../../../verbs/park.mjs',
  ]) {
    const source = await readFile(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
    assert.match(source, /lifecycle-policy\/index\.mjs/, relativePath);
  }
});
