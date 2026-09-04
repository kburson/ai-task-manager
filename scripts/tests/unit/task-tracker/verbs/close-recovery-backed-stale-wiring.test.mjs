// @story #1490
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  readDeliveredCloseTransactions,
  TERMINAL_CLOSE_STEPS,
  upsertDeliveredCloseTransaction,
} from '../../../../task-tracker/lib/close-convergence.mjs';
import {
  createReopenedCloseRecoveryRecord,
  renderReopenedCloseRecoveryComment,
} from '../../../../task-tracker/lib/reopened-close-recovery.mjs';
import { closeBody, runClose } from '../../../helpers/close-convergence-wiring-helpers.mjs';

const RESTART_HEAD = 'a'.repeat(40);
const STALE_HEAD = 'b'.repeat(40);

function staleRestartTransaction(completedSteps = ['timing']) {
  return {
    schema: 'aitm.delivered-close/v1',
    transactionId: 'stale-close-transaction',
    issueNumber: 925,
    acceptedSha: STALE_HEAD,
    reviewAuthority: 'gate-bypassed',
    completedSteps,
  };
}

function recoveryBackedStaleFixture() {
  const oldTransaction = {
    ...staleRestartTransaction([...TERMINAL_CLOSE_STEPS]),
    transactionId: 'completed-before-reopen',
    acceptedSha: 'd'.repeat(40),
  };
  const record = createReopenedCloseRecoveryRecord(
    {
      repository: 'o/r',
      issueNumber: 925,
      oldTransaction,
      newAcceptedSha: STALE_HEAD,
      newReviewAuthority: 'gate-bypassed',
      actor: 'kburson',
    },
    {
      now: '2026-08-31T20:00:00.000Z',
      randomUUIDFn: () => 'stale-close-transaction',
    }
  );
  const activeTransaction = staleRestartTransaction(['timing']);
  const comment = {
    id: 76,
    body: renderReopenedCloseRecoveryComment(record),
    user: { login: 'kburson' },
    created_at: '2026-08-31T20:00:00Z',
    updated_at: '2026-08-31T20:00:00Z',
    issue_url: 'https://api.github.com/repos/o/r/issues/925',
  };
  return { activeTransaction, comment, originalCommentBody: comment.body };
}

function assertNoTerminalWrites(run) {
  assert.deepEqual(
    {
      board: run.calls.movesToDone.length,
      disposition: run.calls.terminalDispositions,
      issue: run.calls.issueCloses,
      labels: run.calls.labelWrites,
      binding: run.calls.bindingReleases,
    },
    { board: 0, disposition: 0, issue: 0, labels: 0, binding: 0 }
  );
}

test('stale restart composes one immutable reopened recovery with a partial replacement', async () => {
  const fixture = recoveryBackedStaleFixture();
  const run = await runClose({
    boardState: 'review',
    closeSnapshot: { issueClosed: false, stateReason: 'reopened' },
    body: upsertDeliveredCloseTransaction(closeBody(), fixture.activeTransaction),
    restartStaleTransaction: true,
    supersessionComments: [fixture.comment],
    acceptedSha: RESTART_HEAD,
    liveLabels: [],
    terminalDisposition: null,
    bindingReleaseStatus: 'conflict',
    bindingOwnership: { authorized: true, disposition: 'own-post-close-claim' },
    gateReviewToDone: false,
    reviewAuthorization: { mode: 'human', standing: true, source: 'test-evidence' },
  });

  assert.equal(run.exitCode, 0);
  assert.equal(run.calls.supersessionCommentCreates, 1);
  assert.ok(run.calls.mutations >= 1);
  assert.equal(readDeliveredCloseTransactions(run.body)[0].acceptedSha, RESTART_HEAD);
  assert.equal(run.supersessionComments[0].body, fixture.originalCommentBody);
});

test('recovery-backed stale restart reuses the second link after a lost response', async () => {
  const fixture = recoveryBackedStaleFixture();
  const common = {
    boardState: 'review',
    closeSnapshot: { issueClosed: false, stateReason: 'reopened' },
    restartStaleTransaction: true,
    acceptedSha: RESTART_HEAD,
    liveLabels: [],
    terminalDisposition: null,
    bindingReleaseStatus: 'conflict',
    bindingOwnership: { authorized: true, disposition: 'own-post-close-claim' },
    gateReviewToDone: false,
    reviewAuthorization: { mode: 'human', standing: true, source: 'test-evidence' },
  };
  const interrupted = await runClose({
    ...common,
    body: upsertDeliveredCloseTransaction(closeBody(), fixture.activeTransaction),
    supersessionComments: [fixture.comment],
    timingResult: { ok: false, queued: true, err: 'lost response' },
  });
  assert.equal(interrupted.exitCode, 1);
  assert.equal(interrupted.calls.supersessionCommentCreates, 1);
  assert.equal(readDeliveredCloseTransactions(interrupted.body)[0].acceptedSha, RESTART_HEAD);

  const retry = await runClose({
    ...common,
    body: interrupted.body,
    supersessionComments: interrupted.supersessionComments,
  });
  assert.equal(retry.exitCode, 0);
  assert.equal(retry.calls.supersessionCommentCreates, 0);
  assert.equal(
    retry.supersessionComments.filter((comment) =>
      comment.body.includes('aitm-delivered-close-supersession')
    ).length,
    1
  );
});

test('recovery-backed stale restart refuses contradictions before persistence', async () => {
  const fixture = recoveryBackedStaleFixture();
  const body = upsertDeliveredCloseTransaction(closeBody(), fixture.activeTransaction);
  const cases = [
    [
      'duplicate recovery',
      { supersessionComments: [fixture.comment, { ...fixture.comment, id: 79 }] },
    ],
    [
      'foreign recovery',
      {
        supersessionComments: [
          { ...fixture.comment, issue_url: 'https://api.github.com/repos/o/r/issues/999' },
        ],
      },
    ],
    ['plain open issue', { closeSnapshot: { issueClosed: false, stateReason: null } }],
    ['dirty worktree', { dirtyWorkspace: { dirty: true, total: 1, files: ['x'] } }],
    ['foreign binding', { bindingOwnership: { authorized: false, disposition: 'foreign-claim' } }],
    [
      'four completed steps',
      {
        body: upsertDeliveredCloseTransaction(
          closeBody(),
          staleRestartTransaction(TERMINAL_CLOSE_STEPS.slice(0, 4))
        ),
      },
    ],
    ['same current SHA', { acceptedSha: STALE_HEAD }],
  ];

  for (const [name, override] of cases) {
    let calls;
    let run;
    try {
      run = await runClose({
        boardState: 'review',
        closeSnapshot: { issueClosed: false, stateReason: 'reopened' },
        body,
        restartStaleTransaction: true,
        supersessionComments: [fixture.comment],
        acceptedSha: RESTART_HEAD,
        liveLabels: [],
        terminalDisposition: null,
        bindingReleaseStatus: 'conflict',
        gateReviewToDone: false,
        reviewAuthorization: { mode: 'human', standing: true, source: 'test-evidence' },
        captureCalls: (observed) => {
          calls = observed;
        },
        ...override,
      });
    } catch (error) {
      assert.match(error.message, /terminal-state-conflict/, name);
      run = { exitCode: 1, calls };
    }

    assert.equal(run.exitCode, 1, name);
    assert.equal(run.calls.supersessionCommentCreates, 0, name);
    assert.equal(run.calls.mutations, 0, name);
    assertNoTerminalWrites(run);
  }
});
