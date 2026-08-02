// @story #925
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  appendUnauthorizedCloseMarker,
  readUnauthorizedCloseRecovery,
  runClosedIssueConvergence,
} from '../../../lib/closed-issue-convergence.mjs';
import { findLostMarkers } from '../../../lib/body-invariants.mjs';
import { checkBodyChange } from '../../../lib/gh-edit-guard.mjs';
import { isEmittableTimingEvent } from '../../../lib/timing-events/index.mjs';

function actionDeps({ fail = null } = {}) {
  const calls = [];
  const adapter =
    (name, result = { ok: true }) =>
    async () => {
      calls.push(name);
      if (fail === name) throw new Error(`${name} failed`);
      return result;
    };
  return {
    calls,
    deps: {
      moveToDone: adapter('moveToDone'),
      emitClosePair: adapter('emitClosePair'),
      ensureOutcome: adapter('ensureOutcome'),
      reconcileLifecycle: adapter('reconcileLifecycle'),
      cleanup: adapter('cleanup'),
      reopenIssue: adapter('reopenIssue'),
      moveToReview: adapter('moveToReview'),
      postTimingAudit: adapter('postTimingAudit'),
      createTransactionId: async () => 'tx-actions',
      timingAuditPresent: async () => false,
      writeRecoveryPhase: async (phase, recovery) => {
        const name = `writeRecoveryPhase:${phase}`;
        calls.push(name);
        if (fail === name) throw new Error(`${name} failed`);
        return { ...recovery, phase };
      },
    },
  };
}

test('dead is a true no-op and leaves every mutation adapter untouched', async () => {
  const { calls, deps } = actionDeps();
  const result = await runClosedIssueConvergence(
    { decision: { action: 'dead' }, issueNumber: 925, boardState: 'review' },
    deps
  );
  assert.deepEqual(result, { action: 'dead', status: 'untouched', steps: [] });
  assert.deepEqual(calls, []);
});

test('finalize runs the existing housekeeping order before cleanup', async () => {
  const { calls, deps } = actionDeps();
  const result = await runClosedIssueConvergence(
    { decision: { action: 'finalize' }, issueNumber: 925, boardState: 'review' },
    deps
  );
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.steps, [
    'moveToDone',
    'emitClosePair',
    'ensureOutcome',
    'reconcileLifecycle',
    'cleanup',
  ]);
  assert.deepEqual(calls, result.steps);
});

test('noop reconciles close housekeeping without a redundant board move', async () => {
  const { calls, deps } = actionDeps();
  const result = await runClosedIssueConvergence(
    { decision: { action: 'noop' }, issueNumber: 925, boardState: 'done' },
    deps
  );
  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, ['emitClosePair', 'ensureOutcome', 'reconcileLifecycle', 'cleanup']);
});

test('finalize fails visibly and does not clean up after a board-move failure', async () => {
  const { calls, deps } = actionDeps();
  deps.moveToDone = async () => {
    calls.push('moveToDone');
    return { ok: false, benign: false, stderr: 'board unavailable' };
  };
  const result = await runClosedIssueConvergence(
    { decision: { action: 'finalize' }, issueNumber: 925, boardState: 'review' },
    deps
  );
  assert.equal(result.status, 'failed');
  assert.equal(result.failedStep, 'moveToDone');
  assert.deepEqual(calls, ['moveToDone']);
});

test('aberration reopens, restores Review, then writes both audit trails', async () => {
  const { calls, deps } = actionDeps();
  const result = await runClosedIssueConvergence(
    {
      decision: { action: 'aberration' },
      issueNumber: 925,
      issueClosed: true,
      boardState: 'develop',
      stateReason: 'completed',
      unticked: ['All automated tests pass'],
      actor: 'octocat',
      ts: '2026-07-29T20:00:00.000Z',
    },
    deps
  );
  assert.equal(result.status, 'recovered');
  assert.deepEqual(result.steps, [
    'writeRecoveryPhase:intent',
    'reopenIssue',
    'writeRecoveryPhase:reopened',
    'moveToReview',
    'writeRecoveryPhase:review',
    'postTimingAudit',
    'writeRecoveryPhase:timing',
    'writeRecoveryPhase:complete',
  ]);
  assert.deepEqual(calls, result.steps);
});

test('aberration skips a Review self-loop and reports partial failure', async () => {
  const { calls, deps } = actionDeps({ fail: 'postTimingAudit' });
  const result = await runClosedIssueConvergence(
    {
      decision: { action: 'aberration' },
      issueNumber: 925,
      issueClosed: true,
      boardState: 'review',
      stateReason: 'completed',
      unticked: ['Agent Review Passed'],
      actor: 'octocat',
      ts: '2026-07-29T20:00:00.000Z',
    },
    deps
  );
  assert.equal(result.status, 'failed');
  assert.equal(result.failedStep, 'postTimingAudit');
  assert.deepEqual(result.steps, [
    'writeRecoveryPhase:intent',
    'reopenIssue',
    'writeRecoveryPhase:reopened',
    'writeRecoveryPhase:review',
  ]);
  assert.deepEqual(calls, [...result.steps, 'postTimingAudit']);
});

test('legacy unauthorized-close writer remains idempotent with the structured marker', () => {
  const first = appendUnauthorizedCloseMarker('## Body\n', {
    ts: '2026-07-29T17:30:00.000Z',
    stateReason: 'completed',
    unticked: ['Agent Review Passed', 'All automated tests pass'],
  });
  assert.match(first, /<!-- aitm-unauthorized-close /);
  assert.deepEqual(readUnauthorizedCloseRecovery(first), {
    tx: 'legacy',
    phase: 'complete',
    stateReason: 'completed',
    unticked: ['Agent Review Passed', 'All automated tests pass'],
    actor: 'unknown',
    ts: '2026-07-29T17:30:00.000Z',
  });
  assert.equal(
    appendUnauthorizedCloseMarker(first, {
      ts: '2026-07-29T17:31:00.000Z',
      stateReason: 'completed',
      unticked: ['different'],
    }),
    first
  );
});

test('unauthorized-close is an emittable audit event and a protected marker', () => {
  assert.equal(isEmittableTimingEvent('unauthorized-close'), true);
  const marker = appendUnauthorizedCloseMarker('## Body\n', {
    ts: '2026-07-29T17:30:00.000Z',
    stateReason: 'completed',
    unticked: ['Agent Review Passed'],
  });
  assert.deepEqual(findLostMarkers(marker, '## Body\n'), ['aitm-unauthorized-close']);
  const guard = checkBodyChange({
    currentBody: marker,
    newBody: '## Body\n',
    issueNumber: 925,
  });
  assert.equal(guard.block, true);
  assert.match(guard.reason, /aitm-unauthorized-close/);
});
