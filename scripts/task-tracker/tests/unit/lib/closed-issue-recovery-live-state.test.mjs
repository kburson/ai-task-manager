// @story #925
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runClosedIssueConvergence } from '../../../lib/closed-issue-convergence.mjs';

const RECOVERY = {
  tx: 'tx-live-state',
  phase: 'review',
  stateReason: 'completed',
  unticked: ['Agent Review Passed'],
  actor: 'octocat',
  ts: '2026-07-29T20:00:00.000Z',
};

async function runRecovery({ phase, issueClosed, boardState, timingPresent = false } = {}) {
  const calls = [];
  const result = await runClosedIssueConvergence(
    {
      decision: { action: 'aberration' },
      issueClosed,
      boardState,
      recovery: { ...RECOVERY, phase },
    },
    {
      reopenIssue: async () => {
        calls.push('reopenIssue');
        return { ok: true };
      },
      moveToReview: async () => {
        calls.push('moveToReview');
        return { ok: true };
      },
      timingAuditPresent: async () => {
        calls.push('timingAuditPresent');
        return timingPresent;
      },
      postTimingAudit: async () => {
        calls.push('postTimingAudit');
        return { ok: true };
      },
      writeRecoveryPhase: async (nextPhase, recovery) => {
        calls.push(`writeRecoveryPhase:${nextPhase}`);
        return { ...recovery, phase: nextPhase };
      },
    }
  );
  return { calls, result };
}

test('review marker repairs live closed/Done state once before completing recovery', async () => {
  const { calls, result } = await runRecovery({
    phase: 'review',
    issueClosed: true,
    boardState: 'done',
  });

  assert.equal(result.status, 'recovered');
  assert.equal(result.durablePhase, 'complete');
  assert.deepEqual(calls, [
    'reopenIssue',
    'moveToReview',
    'timingAuditPresent',
    'postTimingAudit',
    'writeRecoveryPhase:timing',
    'writeRecoveryPhase:complete',
  ]);
  assert.equal(calls.filter((call) => call === 'reopenIssue').length, 1);
  assert.equal(calls.filter((call) => call === 'moveToReview').length, 1);
  assert.equal(
    calls.some((call) => call === 'writeRecoveryPhase:reopened'),
    false
  );
  assert.equal(
    calls.some((call) => call === 'writeRecoveryPhase:review'),
    false
  );
  assert.equal(
    result.message,
    'recovery completed after reopening the issue, restoring the board to Review, and posting the timing audit'
  );
});

test('timing marker repairs live closed/Done state without duplicating timing', async () => {
  const { calls, result } = await runRecovery({
    phase: 'timing',
    issueClosed: true,
    boardState: 'done',
  });

  assert.equal(result.status, 'recovered');
  assert.equal(result.durablePhase, 'complete');
  assert.deepEqual(calls, ['reopenIssue', 'moveToReview', 'writeRecoveryPhase:complete']);
  assert.equal(calls.filter((call) => call === 'reopenIssue').length, 1);
  assert.equal(calls.filter((call) => call === 'moveToReview').length, 1);
  assert.equal(calls.includes('timingAuditPresent'), false);
  assert.equal(calls.includes('postTimingAudit'), false);
  assert.equal(
    result.message,
    'recovery completed after reopening the issue and restoring the board to Review'
  );
});

test('matching live state completes without repeating repair or timing effects', async () => {
  const { calls, result } = await runRecovery({
    phase: 'timing',
    issueClosed: false,
    boardState: 'review',
  });

  assert.equal(result.status, 'recovered');
  assert.equal(result.durablePhase, 'complete');
  assert.deepEqual(calls, ['writeRecoveryPhase:complete']);
  assert.equal(
    result.message,
    'recovery completed without repeating live-state repair or timing effects'
  );
});
