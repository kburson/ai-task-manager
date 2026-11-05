import assert from 'node:assert/strict';
import test from 'node:test';

import {
  currentPhase,
  isFinalPhase,
  isPhased,
  parsePhaseKinds,
} from '../../src/protocol/phases.mjs';
import { reduceEvents } from '../../src/protocol/reducer.mjs';
import { claim, event, FINGERPRINTS, sequence } from '../helpers/review-fixture.mjs';

test('parses a canonical ordered phase list', () => {
  const phases = parsePhaseKinds('spec,plan', 'spec');

  assert.deepEqual(phases, ['spec', 'plan']);
  assert.equal(Object.isFrozen(phases), true);
  assert.deepEqual(parsePhaseKinds('spec', 'spec'), ['spec']);
  assert.deepEqual(parsePhaseKinds('plan', 'plan'), ['plan']);
});

test('rejects noncanonical or contradictory phase declarations', () => {
  for (const [value, initialKind] of [
    ['', 'spec'],
    ['spec,', 'spec'],
    [',spec', 'spec'],
    ['spec, plan', 'spec'],
    ['spec,spec', 'spec'],
    ['spec,report', 'spec'],
    ['plan,spec', 'spec'],
    [null, 'spec'],
  ]) {
    assert.throws(() => parsePhaseKinds(value, initialKind), { code: 'APR_PHASE_INVALID' });
  }
});

test('derives current and final phase only from a closed projection', () => {
  const protocol = {
    phases: {
      kinds: ['spec', 'plan'],
      cursor: 0,
      current_kind: 'spec',
      phase_turns_used: 0,
      completed: [],
    },
  };

  assert.equal(isPhased(protocol), true);
  assert.deepEqual(currentPhase(protocol), { cursor: 0, kind: 'spec' });
  assert.equal(isFinalPhase(protocol), false);
  assert.equal(isPhased({}), false);
  assert.equal(currentPhase({}), null);
  assert.equal(isFinalPhase({}), true);
});

function phasedCreated() {
  return event('review-created', {
    payload: { phases: { kinds: ['spec', 'plan'] } },
  });
}

function phasedAuthorFinalization({ noCommit = false } = {}) {
  const events = sequence(
    [
      'review-created',
      'reviewer-joined',
      'turn-claimed',
      'reviewer-accepted',
      'turn-claimed',
      'finalization-started',
    ],
    {
      0: { payload: { phases: { kinds: ['spec', 'plan'] } } },
      1: { actor: FINGERPRINTS.reviewer },
      2: { actor: FINGERPRINTS.reviewer, payload: { claim: claim('reviewer') } },
      3: { actor: FINGERPRINTS.reviewer },
      4: { actor: FINGERPRINTS.author, payload: { claim: claim('author') } },
    }
  );
  if (noCommit) {
    events[0].payload.commit_mode = 'no-commit';
    events[0].payload.startup.no_commit_baseline = {
      head: events[0].payload.artifact.head,
      index_digest: `sha256:${'1'.repeat(64)}`,
      worktree_digest: `sha256:${'2'.repeat(64)}`,
      changed_paths: [],
    };
  }
  return events;
}

test('adds phase projection only when phased creation authority exists', () => {
  const phased = reduceEvents([phasedCreated()]);
  assert.deepEqual(phased.protocol.phases, {
    kinds: ['spec', 'plan'],
    cursor: 0,
    current_kind: 'spec',
    phase_turns_used: 0,
    completed: [],
  });
  assert.equal(Object.hasOwn(reduceEvents([event('review-created')]).protocol, 'phases'), false);
});

test('advances only through exact non-final phase evidence and preserves global turns', () => {
  const accepted = phasedAuthorFinalization();
  accepted.push(
    event('phase-acceptance-committed', {
      sequence: 7,
      revision: 5,
    })
  );
  const waiting = reduceEvents(accepted);
  assert.equal(waiting.protocol.state, 'awaiting-phase-artifact');
  assert.equal(waiting.protocol.current_actor, 'author');
  assert.equal(waiting.protocol.next_action, 'advance-phase-artifact');
  assert.equal(waiting.protocol.turns_used, 1);
  assert.equal(waiting.protocol.phases.phase_turns_used, 1);
  assert.equal(waiting.protocol.phases.completed.length, 1);

  accepted.push(
    event('phase-artifact-committed', {
      sequence: 8,
      revision: 6,
    })
  );
  const advanced = reduceEvents(accepted);
  assert.equal(advanced.protocol.state, 'reviewer-turn');
  assert.equal(advanced.protocol.phases.cursor, 1);
  assert.equal(advanced.protocol.phases.current_kind, 'plan');
  assert.equal(advanced.protocol.phases.phase_turns_used, 0);
  assert.equal(advanced.protocol.turns_used, 1);
  assert.equal(advanced.protocol.artifact.path, 'docs/plan.md');
});

test('rejects wrong-mode, wrong-cursor, and final-cursor phase lifecycle events', () => {
  const normal = phasedAuthorFinalization();
  assert.throws(
    () =>
      reduceEvents([
        ...normal,
        event('phase-acceptance-sealed-no-commit', { sequence: 7, revision: 5 }),
      ]),
    { code: 'APR_INVALID_TRANSITION' }
  );
  assert.throws(
    () =>
      reduceEvents([
        ...normal,
        event('phase-acceptance-committed', {
          sequence: 7,
          revision: 5,
          payload: { cursor: 1 },
        }),
      ]),
    { code: 'APR_INVALID_TRANSITION' }
  );

  const single = phasedAuthorFinalization();
  single[0].payload.phases = { kinds: ['spec'] };
  assert.throws(
    () =>
      reduceEvents([...single, event('phase-acceptance-committed', { sequence: 7, revision: 5 })]),
    { code: 'APR_INVALID_TRANSITION' }
  );
});
