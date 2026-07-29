// @story #925
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  readUnauthorizedCloseRecovery,
  runClosedIssueConvergence,
  upsertUnauthorizedCloseRecovery,
} from '../../../lib/closed-issue-convergence.mjs';

const RECOVERY = {
  tx: 'tx-1',
  phase: 'intent',
  stateReason: 'completed',
  unticked: ['Agent Review Passed'],
  actor: 'octocat',
  ts: '2026-07-29T20:00:00.000Z',
};

test('reader rejects every pending non-completed state reason', () => {
  for (const phase of ['intent', 'reopened', 'review', 'timing']) {
    for (const stateReason of ['not_planned', 'duplicate', 'unknown']) {
      const marker =
        `<!-- aitm-unauthorized-close tx="tx-invalid" phase="${phase}" ` +
        `state-reason="${stateReason}" unticked="[]" actor="unknown" ` +
        'ts="2026-07-29T20:00:00.000Z" -->';
      assert.equal(
        readUnauthorizedCloseRecovery(marker),
        null,
        `${phase}/${stateReason} must not be resumable`
      );
    }
  }
});

test('writer rejects every pending non-completed state reason', () => {
  for (const phase of ['intent', 'reopened', 'review', 'timing']) {
    for (const stateReason of ['not_planned', 'duplicate', 'unknown']) {
      assert.throws(
        () =>
          upsertUnauthorizedCloseRecovery('## Body\n', {
            ...RECOVERY,
            phase,
            stateReason,
          }),
        /pending recovery requires stateReason=completed/
      );
    }
  }
});

test('legacy complete recovery may retain an unknown state reason', () => {
  const body = upsertUnauthorizedCloseRecovery('## Body\n', {
    ...RECOVERY,
    phase: 'complete',
    stateReason: 'unknown',
  });

  assert.equal(readUnauthorizedCloseRecovery(body)?.stateReason, 'unknown');
});

test('executor rejects pending non-completed recovery before every effect', async () => {
  for (const phase of ['intent', 'reopened', 'review', 'timing']) {
    const calls = [];
    const result = await runClosedIssueConvergence(
      {
        decision: { action: 'aberration', resume: true },
        issueClosed: true,
        boardState: 'develop',
        recovery: {
          ...RECOVERY,
          phase,
          stateReason: 'not_planned',
        },
      },
      {
        reopenIssue: async () => calls.push('reopenIssue'),
        moveToReview: async () => calls.push('moveToReview'),
        timingAuditPresent: async () => (calls.push('timingAuditPresent'), false),
        postTimingAudit: async () => calls.push('postTimingAudit'),
        writeRecoveryPhase: async () => calls.push('writeRecoveryPhase'),
      }
    );

    assert.equal(result.status, 'failed');
    assert.equal(result.failedStep, 'validateRecovery');
    assert.match(result.error, /pending recovery requires stateReason=completed/);
    assert.deepEqual(calls, [], `${phase} recovery must fail before effects`);
  }
});
