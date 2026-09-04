// @story #925
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  readUnauthorizedCloseRecovery,
  upsertUnauthorizedCloseRecovery,
} from '../../../../task-tracker/lib/closed-issue-convergence.mjs';
import { closeBody, runClose } from '../../../helpers/close-convergence-wiring-helpers.mjs';
import {
  ensureCloseEstimationOutcome,
  resolveEstimationOutcomeProjectDir,
} from '../../../../task-tracker/verbs/close.mjs';
import {
  authorizeDeliveredCloseRestart,
  renderDeliveredCloseSupersessionComment,
  resolveDeliveredCloseSupersession,
} from '../../../../task-tracker/lib/delivered-close-supersession.mjs';
import {
  readDeliveredCloseTransactions,
  TERMINAL_CLOSE_STEPS,
  upsertDeliveredCloseTransaction,
} from '../../../../task-tracker/lib/close-convergence.mjs';
import {
  createReopenedCloseRecoveryRecord,
  renderReopenedCloseRecoveryComment,
} from '../../../../task-tracker/lib/reopened-close-recovery.mjs';

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

function supersessionComment(stale = staleRestartTransaction(), id = 77) {
  const authorization = authorizeDeliveredCloseRestart({
    repository: 'o/r',
    issueNumber: 925,
    oldTransaction: stale,
    newAcceptedSha: RESTART_HEAD,
    newReviewAuthority: 'gate-bypassed',
    live: {
      boardState: 'review',
      issueClosed: false,
      terminalDisposition: null,
      labels: ['ToDo'],
      bindingStatus: 'pending',
    },
  });
  const { record } = resolveDeliveredCloseSupersession({
    authorization,
    comments: [],
    randomUUIDFn: () => 'replacement-close-transaction',
  });
  return {
    id,
    body: renderDeliveredCloseSupersessionComment(record),
    user: { login: 'kburson' },
    created_at: '2026-08-31T21:00:00Z',
    updated_at: '2026-08-31T21:00:00Z',
    issue_url: 'https://api.github.com/repos/o/r/issues/925',
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

test('close asks the outcome runtime about forecast-free epics and permits a legacy skip', async () => {
  const calls = [];
  const epic = await ensureCloseEstimationOutcome({
    issueNumber: 1067,
    body: 'epic body without a forecast marker',
    writer: {
      ensure: async (input) => {
        calls.push(input);
        return { status: 'written', recordId: '01J00000000000000000000999' };
      },
    },
  });
  assert.equal(epic.status, 'written');
  assert.equal(calls[0].forecastRecordId, null);

  const legacy = await ensureCloseEstimationOutcome({
    issueNumber: 7,
    body: 'legacy story',
    writer: { ensure: async () => ({ status: 'legacy-no-forecast' }) },
  });
  assert.equal(legacy.status, 'legacy-no-forecast');
});

test('close passes explicit reopened-cycle correction authority to the outcome runtime', async () => {
  let observed = null;
  await ensureCloseEstimationOutcome({
    issueNumber: 1490,
    body: 'reopened issue body',
    supersedeExisting: true,
    writer: {
      ensure: async (input) => {
        observed = input;
        return { status: 'written', recordId: '01J00000000000000000001490' };
      },
    },
  });

  assert.equal(observed.supersedeExisting, true);
});

test('close uses the frozen Plan forecast and refuses a drifted ready marker', async () => {
  const frozen = '01J00000000000000000000941';
  const drifted = '01J00000000000000000000942';
  const body = [
    `<!-- aitm-plan-approved ts="2026-08-02T14:00:00.000Z" forecast-record-id="${frozen}" -->`,
    `<!-- aitm-estimation-forecast-ready record-id="${drifted}" -->`,
  ].join('\n');
  await assert.rejects(
    ensureCloseEstimationOutcome({
      issueNumber: 1091,
      body,
      writer: { ensure: async () => ({ status: 'written' }) },
    }),
    /forecast.*lineage/i
  );
});

test('close refuses an adaptive ready forecast without frozen Plan lineage', async () => {
  const ready = '01J00000000000000000000941';
  await assert.rejects(
    ensureCloseEstimationOutcome({
      issueNumber: 1091,
      body: [
        '<!-- aitm-plan-approved ts="2026-08-02T14:00:00.000Z" -->',
        `<!-- aitm-estimation-forecast-ready record-id="${ready}" -->`,
      ].join('\n'),
      writer: { ensure: async () => ({ status: 'written' }) },
    }),
    /frozen Plan forecast/i
  );
});

test('primary convergence resolves the issue worktree instead of inheriting the caller directory', () => {
  const resolved = resolveEstimationOutcomeProjectDir({
    issueNumber: 1091,
    closeIssueNum: 1091,
    projectDir: '/repo',
    issueWorkspaceResolver: ({ issueRef }) => `/repo/.worktrees/${issueRef.slice(1)}`,
  });
  assert.equal(resolved, '/repo/.worktrees/1091');
});

test('primary convergence fails closed when issue worktree registration is unavailable', () => {
  assert.throws(
    () =>
      resolveEstimationOutcomeProjectDir({
        issueNumber: 1091,
        projectDir: '/repo',
        issueWorkspaceResolver: () => null,
      }),
    /workspace evidence is unavailable/i
  );
});

test('dead issue returns without body or child reads', async () => {
  const run = await runClose({
    closeSnapshot: { issueClosed: true, stateReason: 'not_planned' },
    bodyReadError: new Error('body must not be read'),
    childSnapshot: { status: 'unknown', error: 'children must not be read' },
  });

  assert.equal(run.result?.action, 'dead');
  assert.equal(run.result?.status, 'untouched');
  assert.equal(run.calls.bodyReads, 0);
  assert.equal(run.calls.childSnapshots, 0);
  assert.equal(run.exitCode, 0);
});

test('completed issue already at Done fails closed when transaction inspection is unavailable', async () => {
  const run = await runClose({
    boardState: 'done',
    bodyReadError: new Error('transient body outage'),
  });

  assert.equal(run.result?.action, 'inspect');
  assert.equal(run.result?.failedStep, 'readIssueBody');
  assert.equal(run.calls.bodyReads, 1);
  assert.equal(run.calls.childSnapshots, 0);
  assert.equal(run.exitCode, 1);
});

test('pending recovery on a completed issue already at Done resumes before noop', async () => {
  const recovery = {
    tx: 'tx-closed-done-resume',
    phase: 'review',
    stateReason: 'completed',
    unticked: ['Agent Review Passed'],
    actor: 'unknown',
    ts: new Date().toISOString(),
  };
  const run = await runClose({
    boardState: 'done',
    body: upsertUnauthorizedCloseRecovery(closeBody({ agentReview: ' ' }), recovery),
    childSnapshot: { status: 'unknown', error: 'children must not be read' },
  });

  assert.equal(run.result?.action, 'aberration');
  assert.equal(run.result?.status, 'recovered');
  assert.equal(run.result?.durablePhase, 'complete');
  assert.equal(readUnauthorizedCloseRecovery(run.body)?.tx, 'tx-closed-done-resume');
  assert.equal(run.calls.bodyReads, 1);
  assert.equal(run.calls.childSnapshots, 0);
  assert.equal(run.exitCode, 0);
});

test('completed not-Done issue refuses an unknown strict child snapshot', async () => {
  const run = await runClose({
    childSnapshot: { status: 'unknown', error: 'GraphQL unavailable' },
  });

  assert.equal(run.result?.status, 'failed');
  assert.equal(run.result?.failedStep, 'fetchSubIssueBoardSnapshot');
  assert.equal(run.calls.bodyReads, 1);
  assert.equal(run.calls.childSnapshots, 1);
  assert.deepEqual(run.calls.movesToDone, []);
  assert.equal(run.exitCode, 1);
});

test('pending recovery on an open issue resumes from its serialized phase', async () => {
  const recovery = {
    tx: 'tx-open-resume',
    phase: 'review',
    stateReason: 'completed',
    unticked: ['Agent Review Passed'],
    actor: 'unknown',
    ts: new Date().toISOString(),
  };
  const run = await runClose({
    closeSnapshot: { issueClosed: false, stateReason: null },
    body: upsertUnauthorizedCloseRecovery(closeBody({ agentReview: ' ' }), recovery),
  });

  assert.equal(run.result?.action, 'aberration');
  assert.equal(run.result?.status, 'recovered');
  assert.equal(run.result?.durablePhase, 'complete');
  assert.equal(readUnauthorizedCloseRecovery(run.body)?.phase, 'complete');
  assert.equal(run.calls.bodyReads, 1);
  assert.deepEqual(run.calls.movesToReview, []);
  assert.equal(run.calls.timingRows.length, 1);
  assert.match(run.calls.timingRows[0], /tx=tx-open-resume/);
  assert.equal(run.exitCode, 0);
});

test('pending recovery outranks close-issue for an open issue already at Done', async () => {
  const recovery = {
    tx: 'tx-open-done-resume',
    phase: 'review',
    stateReason: 'completed',
    unticked: ['Agent Review Passed'],
    actor: 'unknown',
    ts: new Date().toISOString(),
  };
  const run = await runClose({
    boardState: 'done',
    closeSnapshot: { issueClosed: false, stateReason: null },
    body: upsertUnauthorizedCloseRecovery(closeBody({ agentReview: ' ' }), recovery),
  });

  assert.equal(run.result?.action, 'aberration');
  assert.equal(run.result?.status, 'recovered');
  assert.equal(readUnauthorizedCloseRecovery(run.body)?.phase, 'complete');
  assert.equal(run.calls.bodyReads, 1);
  assert.equal(run.calls.issueCloses, 0);
  assert.equal(run.exitCode, 0);
});

test('retry after a successful timing post does not duplicate the transaction audit', async () => {
  const recovery = {
    tx: 'tx-timing-already-posted',
    phase: 'review',
    stateReason: 'completed',
    unticked: ['Agent Review Passed'],
    actor: 'unknown',
    ts: new Date().toISOString(),
  };
  const run = await runClose({
    closeSnapshot: { issueClosed: false, stateReason: null },
    body: upsertUnauthorizedCloseRecovery(closeBody({ agentReview: ' ' }), recovery),
    timingBody:
      '| 2026-07-29 20:00:00 -05:00 | unauthorized-close |  |  |  | 0 | tx=tx-timing-already-posted; recovered |',
  });

  assert.equal(run.result?.status, 'recovered');
  assert.equal(readUnauthorizedCloseRecovery(run.body)?.phase, 'complete');
  assert.deepEqual(run.calls.timingRows, []);
  assert.equal(run.exitCode, 0);
});

test('pending recovery on a still-closed issue preserves its durable transaction', async () => {
  const recovery = {
    tx: 'tx-closed-resume',
    phase: 'intent',
    stateReason: 'completed',
    unticked: ['Agent Review Passed'],
    actor: 'unknown',
    ts: new Date().toISOString(),
  };
  const run = await runClose({
    body: upsertUnauthorizedCloseRecovery(closeBody({ agentReview: ' ' }), recovery),
    childSnapshot: { status: 'unknown', error: 'children must not be read' },
  });

  assert.equal(run.result?.action, 'aberration');
  assert.equal(run.result?.status, 'recovered');
  assert.equal(run.result?.durablePhase, 'complete');
  assert.equal(readUnauthorizedCloseRecovery(run.body)?.tx, 'tx-closed-resume');
  assert.equal(run.calls.bodyReads, 1);
  assert.equal(run.calls.childSnapshots, 0);
  assert.equal(run.exitCode, 0);
});

test('complete recovery is not reused when a later close is a new aberration', async () => {
  const priorRecovery = {
    tx: 'tx-prior-complete',
    phase: 'complete',
    stateReason: 'completed',
    unticked: ['Agent Review Passed'],
    actor: 'unknown',
    ts: new Date().toISOString(),
  };
  const run = await runClose({
    body: upsertUnauthorizedCloseRecovery(closeBody({ agentReview: ' ' }), priorRecovery),
  });

  assert.equal(run.result?.action, 'aberration');
  assert.equal(run.result?.status, 'recovered');
  assert.ok(run.calls.mutations > 0);
  assert.notEqual(readUnauthorizedCloseRecovery(run.body)?.tx, 'tx-prior-complete');
  assert.equal(run.exitCode, 0);
});

test('stale restart refuses unsafe live state before audit or terminal mutation', async () => {
  const staleBody = upsertDeliveredCloseTransaction(closeBody(), staleRestartTransaction());
  const cases = [
    ['no transaction', { body: closeBody() }],
    [
      'same SHA',
      {
        body: upsertDeliveredCloseTransaction(closeBody(), {
          ...staleRestartTransaction(),
          acceptedSha: RESTART_HEAD,
        }),
      },
    ],
    ['board not Review', { body: staleBody, boardState: 'backlog' }],
    [
      'issue closed',
      { body: staleBody, closeSnapshot: { issueClosed: true, stateReason: 'completed' } },
    ],
    ['Delivered disposition', { body: staleBody, terminalDisposition: 'Delivered' }],
    ['no close-managed labels', { body: staleBody, liveLabels: [] }],
    ['released binding', { body: staleBody, bindingReleaseStatus: 'released' }],
    ['unknown binding', { body: staleBody, bindingReleaseStatus: 'unknown' }],
    [
      'dirty checkout',
      { body: staleBody, dirtyWorkspace: { dirty: true, total: 1, files: ['x'] } },
    ],
  ];

  for (const [name, options] of cases) {
    const run = await runClose({
      boardState: 'review',
      closeSnapshot: { issueClosed: false, stateReason: null },
      restartStaleTransaction: true,
      acceptedSha: RESTART_HEAD,
      gateReviewToDone: false,
      reviewAuthorization: { mode: 'full-auto', standing: true, source: 'test' },
      ...options,
    });
    assert.equal(run.exitCode, 1, name);
    assert.equal(run.calls.supersessionCommentCreates, 0, name);
    assert.equal(run.calls.mutations, 0, name);
    assertNoTerminalWrites(run);
  }
});

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

test('stale restart refuses terminal prefixes and stale delivery authority', async () => {
  const terminal = await runClose({
    boardState: 'done',
    closeSnapshot: { issueClosed: false, stateReason: null },
    body: upsertDeliveredCloseTransaction(
      closeBody(),
      staleRestartTransaction(TERMINAL_CLOSE_STEPS.slice(0, 4))
    ),
    restartStaleTransaction: true,
    acceptedSha: RESTART_HEAD,
    gateReviewToDone: false,
    reviewAuthorization: { mode: 'full-auto', standing: true, source: 'test' },
  });
  assert.equal(terminal.exitCode, 1);
  assert.equal(terminal.calls.supersessionCommentCreates, 0);
  assert.equal(terminal.calls.mutations, 0);
  assertNoTerminalWrites(terminal);

  const staleAuthority = await runClose({
    boardState: 'review',
    closeSnapshot: { issueClosed: false, stateReason: null },
    body: upsertDeliveredCloseTransaction(closeBody(), staleRestartTransaction()),
    restartStaleTransaction: true,
    acceptedSha: RESTART_HEAD,
    gateReviewToDone: false,
    reviewAuthorization: { mode: 'full-auto', standing: true, source: 'test' },
    deliveryRefusal: new Error('close-delivery-receipt:test-sha-mismatch'),
  });
  assert.equal(staleAuthority.exitCode, 1);
  assert.equal(staleAuthority.calls.supersessionCommentLists, 0);
  assert.equal(staleAuthority.calls.mutations, 0);
  assertNoTerminalWrites(staleAuthority);
});

test('stale restart fails closed across comment and body persistence failures', async () => {
  const body = upsertDeliveredCloseTransaction(closeBody(), staleRestartTransaction());
  const cases = [
    ['list', { supersessionCommentListError: new Error('list unavailable') }, ['comment:list']],
    [
      'create',
      { supersessionCommentCreateError: new Error('create unavailable') },
      ['comment:list', 'comment:create'],
    ],
    [
      'read',
      { supersessionCommentReadError: new Error('read unavailable') },
      ['comment:list', 'comment:create', 'comment:read'],
    ],
    [
      'readback',
      {
        supersessionCommentReadTransform: (comment) => ({
          ...comment,
          body: `${comment.body}\nmodified`,
        }),
      },
      ['comment:list', 'comment:create', 'comment:read'],
    ],
    [
      'body refusal',
      { mutationResult: { status: 'refused' } },
      ['comment:list', 'comment:create', 'comment:read', 'body:mutate'],
    ],
    [
      'body readback',
      { mutationResult: ({ currentBody }) => ({ status: 'ok', body: currentBody }) },
      ['comment:list', 'comment:create', 'comment:read', 'body:mutate'],
    ],
  ];

  for (const [name, options, expectedOrder] of cases) {
    const run = await runClose({
      boardState: 'review',
      closeSnapshot: { issueClosed: false, stateReason: null },
      body,
      restartStaleTransaction: true,
      acceptedSha: RESTART_HEAD,
      gateReviewToDone: false,
      reviewAuthorization: { mode: 'full-auto', standing: true, source: 'test' },
      ...options,
    });
    assert.equal(run.exitCode, 1, name);
    assert.deepEqual(run.calls.order, expectedOrder, name);
    assertNoTerminalWrites(run);
  }
});

test('stale restart reuses matching evidence and rejects duplicates before body mutation', async () => {
  const stale = staleRestartTransaction();
  const comment = supersessionComment(stale);
  const retry = await runClose({
    boardState: 'review',
    closeSnapshot: { issueClosed: false, stateReason: null },
    body: upsertDeliveredCloseTransaction(closeBody(), stale),
    restartStaleTransaction: true,
    supersessionComments: [comment],
    acceptedSha: RESTART_HEAD,
    gateReviewToDone: false,
    reviewAuthorization: { mode: 'full-auto', standing: true, source: 'test' },
  });
  assert.equal(retry.exitCode, 0);
  assert.deepEqual(retry.calls.order.slice(0, 2), ['comment:list', 'body:mutate']);
  assert.equal(retry.calls.supersessionCommentCreates, 0);
  assert.equal(
    readDeliveredCloseTransactions(retry.body)[0].transactionId,
    'replacement-close-transaction'
  );

  const duplicate = await runClose({
    boardState: 'review',
    closeSnapshot: { issueClosed: false, stateReason: null },
    body: upsertDeliveredCloseTransaction(closeBody(), stale),
    restartStaleTransaction: true,
    supersessionComments: [comment, { ...comment, id: 78 }],
    acceptedSha: RESTART_HEAD,
    gateReviewToDone: false,
    reviewAuthorization: { mode: 'full-auto', standing: true, source: 'test' },
  });
  assert.equal(duplicate.exitCode, 1);
  assert.equal(duplicate.calls.supersessionCommentCreates, 0);
  assert.equal(duplicate.calls.mutations, 0);
  assertNoTerminalWrites(duplicate);
});

test('stale restart is incompatible with force, repair, answer, and disposition lanes', async () => {
  for (const extraRest of [['--force'], ['--repair'], ['--answer', 'yes'], ['--as', 'duplicate']]) {
    await assert.rejects(
      runClose({ restartStaleTransaction: true, extraRest }),
      /delivered-close-supersession:incompatible-flags/
    );
  }
});

test('ordinary close retains same-SHA resume and stale-SHA refusal without restart writes', async () => {
  const sameSha = await runClose({
    boardState: 'review',
    closeSnapshot: { issueClosed: false, stateReason: null },
    body: upsertDeliveredCloseTransaction(closeBody(), {
      ...staleRestartTransaction(),
      acceptedSha: RESTART_HEAD,
    }),
    acceptedSha: RESTART_HEAD,
    gateReviewToDone: false,
    reviewAuthorization: { mode: 'full-auto', standing: true, source: 'test' },
  });
  assert.equal(sameSha.exitCode, 0);
  assert.equal(sameSha.calls.supersessionCommentLists, 0);
  assert.equal(sameSha.calls.supersessionCommentCreates, 0);

  const staleSha = await runClose({
    boardState: 'review',
    closeSnapshot: { issueClosed: false, stateReason: null },
    body: upsertDeliveredCloseTransaction(closeBody(), staleRestartTransaction()),
    acceptedSha: RESTART_HEAD,
    gateReviewToDone: false,
    reviewAuthorization: { mode: 'full-auto', standing: true, source: 'test' },
  });
  assert.equal(staleSha.exitCode, 1);
  assert.deepEqual(staleSha.calls.order, []);
  assertNoTerminalWrites(staleSha);
});

for (const [name, mutationResult, expected] of [
  [
    'mismatched transaction',
    ({ nextBody }) => {
      const recovery = readUnauthorizedCloseRecovery(nextBody);
      return {
        status: 'ok',
        body: upsertUnauthorizedCloseRecovery(nextBody, {
          ...recovery,
          tx: 'tx-stale',
        }),
      };
    },
    /recovery marker readback mismatch.*transaction/,
  ],
  [
    'mismatched phase',
    ({ nextBody }) => {
      const recovery = readUnauthorizedCloseRecovery(nextBody);
      return {
        status: 'ok',
        body: upsertUnauthorizedCloseRecovery(nextBody, {
          ...recovery,
          phase: 'reopened',
        }),
      };
    },
    /recovery marker readback mismatch.*phase/,
  ],
  [
    'failed status',
    ({ nextBody }) => ({ status: 'failed', body: nextBody }),
    /recovery marker mutation failed/,
  ],
  [
    'failed result',
    ({ nextBody }) => ({ ok: false, status: 'ok', body: nextBody }),
    /recovery marker mutation failed/,
  ],
]) {
  test(`${name} recovery mutation refuses before later effects`, async () => {
    const run = await runClose({
      body: closeBody({ agentReview: ' ' }),
      mutationResult,
    });

    assert.equal(run.result?.status, 'failed');
    assert.equal(run.result?.failedStep, 'writeRecoveryPhase:intent');
    assert.match(run.result?.error, expected);
    assert.equal(run.calls.reopens, 0);
    assert.deepEqual(run.calls.movesToReview, []);
    assert.deepEqual(run.calls.timingRows, []);
    assert.equal(run.exitCode, 1);
  });
}

test('recovery persistence requires the grouped issue-body mutator capability', async () => {
  const run = await runClose({
    body: closeBody({ agentReview: ' ' }),
    omitIssueBodyMutator: true,
  });

  assert.equal(run.result?.status, 'failed');
  assert.equal(run.result?.failedStep, 'writeRecoveryPhase:intent');
  assert.match(run.result?.error, /issueBodyMutator\.mutate capability is required/);
  assert.equal(run.calls.reopens, 0);
});

test('explicit close has no direct issue-body mutator import or fallback', () => {
  const source = readFileSync(
    new URL('../../../../task-tracker/verbs/close.mjs', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(source, /import\s+\{\s*mutateIssueBody\s*\}/);
  assert.doesNotMatch(source, /ctx\.issueBodyMutator\s*\?\?/);
});

test('v1 estimation outcome is required before the terminal Done move', () => {
  const source = readFileSync(
    new URL('../../../../task-tracker/verbs/close.mjs', import.meta.url),
    'utf8'
  );
  const outcome = source.indexOf('ensureCloseEstimationOutcome({');
  const terminalMove = source.indexOf('if (!force && !SKIP_NETWORK && closeIssueNum) {', outcome);
  assert.ok(outcome > 0, 'close must invoke the estimation outcome writer');
  assert.ok(terminalMove > outcome, 'outcome must be durable before the non-force Done move');
});

test('receipt authorization precedes outcome; Done precedes Delivered disposition', () => {
  const source = readFileSync(
    new URL('../../../../task-tracker/verbs/close.mjs', import.meta.url),
    'utf8'
  );
  const receipt = source.indexOf('if (await refuseDeliveryGate()) return;');
  const outcome = source.indexOf('ensureCloseEstimationOutcome({', receipt);
  const terminalMove = source.indexOf('if (!force && !SKIP_NETWORK && closeIssueNum) {', outcome);
  const delivered = source.indexOf('writeDeliveredOrRefuse({', terminalMove);
  assert.ok(receipt > 0 && outcome > receipt, 'receipt authorization must finish before outcome');
  assert.ok(terminalMove > outcome, 'outcome must be durable before Done');
  assert.ok(delivered > terminalMove, 'Delivered must be written only after Done');
});

test('convergence close synchronizes terminal timing before freezing its outcome', () => {
  const source = readFileSync(
    new URL('../../../../task-tracker/verbs/close.mjs', import.meta.url),
    'utf8'
  );
  const closeIssue = source.indexOf("if (needsDeliveredCloseStep('timing')) {");
  const closeIssueEnd = source.indexOf("if (needsDeliveredCloseStep('estimation'))", closeIssue);
  const closeIssueBranch = source.slice(closeIssue, closeIssueEnd);
  assert.ok(
    closeIssueBranch.indexOf('emitReviewToDoneClosePair') >= 0,
    'board-Done convergence must emit the close pair before its outcome'
  );

  const convergence = source.indexOf('runClosedIssueConvergence(');
  const convergenceCall = source.slice(
    convergence,
    source.indexOf('if (convergence.status', convergence)
  );
  assert.match(convergenceCall, /ensureOutcome:\s*async/);
});

test('convergence refuses completion when a terminal timing row is only queued', async () => {
  const run = await runClose({ timingResult: { ok: false, queued: true, err: 'network down' } });

  assert.equal(run.result?.status, 'failed');
  assert.equal(run.result?.failedStep, 'emitClosePair');
  assert.equal(run.calls.mutations, 0);
  assert.equal(run.exitCode, 1);
});

test('board-Done open-issue convergence refuses GitHub close when terminal timing is queued', async () => {
  const run = await runClose({
    boardState: 'done',
    closeSnapshot: { issueClosed: false, stateReason: null },
    timingResult: { ok: false, queued: true, err: 'network down' },
  });

  assert.equal(run.calls.issueCloses, 0);
  assert.equal(run.exitCode, 1);
});

for (const category of [
  'input',
  'lineage',
  'missing',
  'malformed',
  'duplicate',
  'conflicting',
  'ambiguous-pr',
  'not-merged',
  'branch-mismatch',
  'base-mismatch',
  'head-mismatch',
  'issue-mismatch',
  'pr-mismatch',
  'merge-commit-missing',
  'merge-commit-mismatch',
]) {
  test(`delivery receipt ${category} refusal precedes every specified side effect`, async () => {
    const run = await runClose({
      closeSnapshot: { issueClosed: false, stateReason: null },
      gateReviewToDone: false,
      force: true,
      deliveryRefusal: new Error(`close-delivery-receipt:${category}`),
    });

    assert.equal(run.exitCode, 1);
    assert.equal(run.calls.drains, 0);
    assert.equal(run.calls.timingRows.length, 0);
    assert.equal(run.calls.flushes, 0);
    assert.equal(run.calls.logIssueTime, 0);
    assert.equal(run.calls.movesToDone.length, 0);
    assert.equal(run.calls.issueCloses, 0);
    assert.equal(run.calls.terminalDispositions, 0);
    assert.equal(run.calls.bindingReleases, 0);
  });
}
