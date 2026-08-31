// @story #1452

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTaskSnapshot,
  deriveStateVisitId,
  provenance,
  reconcileCurrentState,
  requireFresh,
} from '../../../../task-tracker/lib/task-snapshot.mjs';

const COMPLETE_REVIEW = Object.freeze({
  sentinelState: 'review',
  statusState: 'review',
  entryMarkerPresent: true,
  exitRowPresent: true,
  entryRowPresent: true,
});

function snapshotInput({ checksFresh = true } = {}) {
  return {
    currentState: provenance('review', 'move-completion-reconciliation', {
      fresh: true,
      signals: COMPLETE_REVIEW,
    }),
    headSha: provenance('abc123', 'git-head', { fresh: true }),
    checks: provenance([{ name: 'fast', status: 'passed' }], 'check-runs', {
      fresh: checksFresh,
    }),
    derived: { refinementPlan: { estimate: 5 } },
    actionLedger: { status: 'damaged', diagnostics: [{ code: 'missing-event' }] },
    invocation: { mode: 'online', reads: ['issue', 'git'] },
  };
}

test('confirmed movement selects the target from all five signals', () => {
  const current = reconcileCurrentState({
    target: 'review',
    signals: COMPLETE_REVIEW,
    lastKnownState: 'review',
  });
  assert.deepEqual(current, { status: 'current', state: 'review', recovery: null });
  assert.equal(Object.isFrozen(current), true);
});

test('no single move-completion signal may be omitted', () => {
  for (const [key, value] of [
    ['sentinelState', 'test'],
    ['statusState', 'test'],
    ['entryMarkerPresent', false],
    ['exitRowPresent', false],
    ['entryRowPresent', false],
  ]) {
    const result = reconcileCurrentState({
      target: 'review',
      signals: { ...COMPLETE_REVIEW, [key]: value },
      lastKnownState: 'review',
    });
    assert.notEqual(result.status, 'current', key);
  }
});

test('marker-ahead-of-board is an incomplete move that must be replayed', () => {
  const current = reconcileCurrentState({
    target: 'review',
    signals: {
      sentinelState: 'test',
      statusState: 'test',
      entryMarkerPresent: true,
      exitRowPresent: true,
      entryRowPresent: true,
    },
    lastKnownState: 'review',
  });
  assert.deepEqual(current, {
    status: 'incomplete-move',
    state: 'test',
    recovery: 'retry the same /task movement command',
  });
});

test('Status at target without the terminal sentinel remains incomplete', () => {
  const current = reconcileCurrentState({
    target: 'review',
    signals: { ...COMPLETE_REVIEW, sentinelState: 'test' },
    lastKnownState: 'review',
  });
  assert.equal(current.status, 'incomplete-move');
  assert.equal(current.state, 'review');
});

test('sentinel post-condition contradiction is drift', () => {
  const current = reconcileCurrentState({
    target: 'review',
    signals: { ...COMPLETE_REVIEW, statusState: 'test' },
    lastKnownState: 'review',
  });
  assert.deepEqual(current, {
    status: 'drift',
    state: 'review',
    recovery: '/task reconcile accept-live #N',
  });
});

test('modern visit identity selects the marker transition ID and diagnoses missing commit provenance', () => {
  assert.deepEqual(
    deriveStateVisitId({
      state: 'review',
      marker: { visit: 2, occurrence: 17, move: 'transition-review-2' },
      occurrence: 17,
      transitionCommit: null,
    }),
    {
      id: 'transition-review-2',
      kind: 'transition',
      commitProvenance: 'missing',
      diagnostics: ['commit-provenance-missing'],
    }
  );

  const verified = deriveStateVisitId({
    state: 'review',
    marker: { visit: 2, move: 'transition-review-2' },
    occurrence: 17,
    transitionCommit: { transitionId: 'transition-review-2', verified: true },
  });
  assert.equal(verified.commitProvenance, 'verified');
  assert.deepEqual(verified.diagnostics, []);
  assert.equal(Object.isFrozen(verified), true);
});

test('legacy visit identity uses state, visit suffix, and durable occurrence but not timestamp', () => {
  const first = deriveStateVisitId({
    state: 'review',
    marker: { visit: 2, ts: '2026-08-31T01:02:03Z' },
    occurrence: 17,
  });
  const second = deriveStateVisitId({
    state: 'review',
    marker: { visit: 2, ts: '2030-01-01T00:00:00Z' },
    occurrence: 17,
  });
  assert.deepEqual(first, second);
  assert.equal(first.id, 'legacy:review:2:17');
  assert.equal(first.kind, 'legacy');
});

test('snapshot freshness is field-scoped and immutable', () => {
  const input = snapshotInput({ checksFresh: false });
  const snapshot = createTaskSnapshot(input);
  assert.deepEqual(requireFresh(snapshot, ['currentState', 'headSha']), {
    ok: true,
    missing: [],
  });
  assert.deepEqual(requireFresh(snapshot, ['checks']), { ok: false, missing: ['checks'] });
  assert.deepEqual(requireFresh(snapshot, ['checks', 'absent']), {
    ok: false,
    missing: ['checks', 'absent'],
  });
  assert.throws(() => {
    snapshot.currentState.value = 'done';
  }, TypeError);
  assert.throws(() => {
    snapshot.derived.refinementPlan.estimate = 99;
  }, TypeError);
  assert.throws(() => {
    snapshot.actionLedger.diagnostics.push({ code: 'other' });
  }, TypeError);
  assert.throws(() => {
    snapshot.invocation.reads.push('checks');
  }, TypeError);
  assert.equal(input.derived.refinementPlan.estimate, 5, 'caller-owned input is not mutated');
});

test('provenance copies and deeply freezes details', () => {
  const details = { fresh: true, evidence: { comments: ['101'] } };
  const field = provenance('review', 'issue-record', details);
  details.evidence.comments.push('102');
  assert.deepEqual(field.evidence.comments, ['101']);
  assert.equal(Object.isFrozen(field), true);
  assert.equal(Object.isFrozen(field.evidence), true);
  assert.equal(Object.isFrozen(field.evidence.comments), true);
});
