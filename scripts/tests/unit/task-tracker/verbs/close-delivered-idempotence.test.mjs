// @story #1381
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  decideCloseConvergence,
  readDeliveredCloseTransactions,
  resolveDeliveredCloseTransaction,
  TERMINAL_CLOSE_STEPS,
  upsertDeliveredCloseTransaction,
} from '../../../../task-tracker/lib/close-convergence.mjs';
import { closeBody, runClose } from '../../../helpers/close-convergence-wiring-helpers.mjs';

const HEAD = 'a'.repeat(40);
const TX = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

function transaction(completedSteps = TERMINAL_CLOSE_STEPS) {
  return {
    schema: 'aitm.delivered-close/v1',
    transactionId: TX,
    issueNumber: 1381,
    acceptedSha: HEAD,
    reviewAuthority: 'gate-bypassed',
    completedSteps: [...completedSteps],
  };
}

test('fully converged Delivered close retry is an exact read-only success', () => {
  assert.deepEqual(
    decideCloseConvergence({
      boardState: 'done',
      issueClosed: true,
      stateReason: 'completed',
      nonLifecycleBoxesAllTicked: true,
      terminalDisposition: 'Delivered',
      expectedIssueNumber: 1381,
      expectedAcceptedSha: HEAD,
      closeTransactions: [transaction()],
    }),
    { action: 'already-closed', status: 'completed', mutated: false }
  );
});

test('completed disposition step refuses a conflicting live terminal disposition', () => {
  assert.throws(
    () =>
      decideCloseConvergence({
        boardState: 'done',
        issueClosed: true,
        stateReason: 'completed',
        nonLifecycleBoxesAllTicked: true,
        terminalDisposition: 'Incorporated',
        expectedIssueNumber: 1381,
        expectedAcceptedSha: HEAD,
        closeTransactions: [transaction()],
      }),
    /close-convergence:terminal-state-conflict/
  );
});

test('open Done recovery refuses a disposition that contradicts its completed step', () => {
  assert.throws(
    () =>
      decideCloseConvergence({
        boardState: 'done',
        issueClosed: false,
        stateReason: null,
        terminalDisposition: 'Incorporated',
        expectedIssueNumber: 1381,
        expectedAcceptedSha: HEAD,
        closeTransactions: [transaction(TERMINAL_CLOSE_STEPS.slice(0, 5))],
      }),
    /close-convergence:terminal-state-conflict/
  );
});

test('pending disposition step refuses a contradictory live terminal disposition', () => {
  assert.throws(
    () =>
      decideCloseConvergence({
        boardState: 'done',
        issueClosed: false,
        stateReason: null,
        terminalDisposition: 'Incorporated',
        expectedIssueNumber: 1381,
        expectedAcceptedSha: HEAD,
        closeTransactions: [transaction(TERMINAL_CLOSE_STEPS.slice(0, 4))],
      }),
    /close-convergence:terminal-state-conflict/
  );
});

test('partial Delivered close transaction exposes only its missing suffix', () => {
  for (let completed = 0; completed < TERMINAL_CLOSE_STEPS.length; completed += 1) {
    const prefix = TERMINAL_CLOSE_STEPS.slice(0, completed);
    const resolved = resolveDeliveredCloseTransaction({
      issueNumber: 1381,
      acceptedSha: HEAD,
      transactions: [transaction(prefix)],
    });
    assert.deepEqual(resolved.remainingSteps, TERMINAL_CLOSE_STEPS.slice(completed));
  }
});

test('malformed, duplicate, and contradictory Delivered close records fail closed', () => {
  const malformed = { ...transaction(), completedSteps: ['board', 'timing'] };
  const conflicting = { ...transaction(), acceptedSha: 'b'.repeat(40) };
  for (const [records, category] of [
    [[malformed], 'malformed-terminal-transaction'],
    [[transaction(), transaction()], 'duplicate-terminal-transaction'],
    [[transaction(), conflicting], 'conflicting-terminal-transaction'],
  ]) {
    assert.throws(
      () =>
        resolveDeliveredCloseTransaction({
          issueNumber: 1381,
          acceptedSha: HEAD,
          transactions: records,
        }),
      new RegExp(`close-convergence:${category}`)
    );
  }
});

test('Delivered close transaction marker round-trips exact canonical bytes', () => {
  const expected = transaction(TERMINAL_CLOSE_STEPS.slice(0, 3));
  const body = upsertDeliveredCloseTransaction('issue body\n', expected);
  assert.deepEqual(readDeliveredCloseTransactions(body), [expected]);
  assert.equal(upsertDeliveredCloseTransaction(body, expected), body);
});

test('duplicate or malformed Delivered close markers refuse during read', () => {
  const marker = upsertDeliveredCloseTransaction('', transaction());
  assert.throws(
    () => readDeliveredCloseTransactions(`${marker}\n${marker}`),
    /close-convergence:duplicate-terminal-transaction/
  );
  assert.throws(
    () => readDeliveredCloseTransactions('<!-- aitm-delivered-close tx="broken" -->'),
    /close-convergence:malformed-terminal-transaction/
  );
});

test('completed Delivered close retry performs no terminal mutation', async () => {
  const body = upsertDeliveredCloseTransaction(closeBody(), {
    ...transaction(),
    issueNumber: 925,
  });
  const run = await runClose({
    boardState: 'done',
    closeSnapshot: { issueClosed: true, stateReason: 'completed' },
    body,
    terminalDisposition: 'Delivered',
  });

  assert.deepEqual(run.result, {
    action: 'already-closed',
    status: 'completed',
    mutated: false,
  });
  assert.deepEqual(
    {
      providerActions: run.calls.providerActions,
      issueRecordCreates: run.calls.issueRecordCreates,
      timingRows: run.calls.timingRows.length,
      estimationOutcomes: run.calls.estimationOutcomes,
      lifecycleMutations: run.calls.mutations,
      boardWrites: run.calls.movesToDone.length,
      dispositionWrites: run.calls.terminalDispositions,
      issueCloses: run.calls.issueCloses,
      labelWrites: run.calls.labelWrites,
      bindingReleases: run.calls.bindingReleases,
    },
    {
      providerActions: 0,
      issueRecordCreates: 0,
      timingRows: 0,
      estimationOutcomes: 0,
      lifecycleMutations: 0,
      boardWrites: 0,
      dispositionWrites: 0,
      issueCloses: 0,
      labelWrites: 0,
      bindingReleases: 0,
    }
  );
});

test('successful Delivered close persists a complete terminal transaction', async () => {
  const run = await runClose({
    boardState: 'review',
    closeSnapshot: { issueClosed: false, stateReason: null },
    body: closeBody(),
    gateReviewToDone: false,
    reviewAuthorization: { mode: 'full-auto', standing: true, source: 'test' },
    force: true,
    trackEstimationOutcomes: true,
  });

  const transactions = readDeliveredCloseTransactions(run.body);
  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].issueNumber, 925);
  assert.equal(transactions[0].acceptedSha, HEAD);
  assert.deepEqual(transactions[0].completedSteps, TERMINAL_CLOSE_STEPS);
});

test('partial Delivered close runs only the missing terminal suffix', async () => {
  for (let completed = 0; completed < TERMINAL_CLOSE_STEPS.length; completed += 1) {
    const completedSet = new Set(TERMINAL_CLOSE_STEPS.slice(0, completed));
    const body = upsertDeliveredCloseTransaction(closeBody(), {
      ...transaction(TERMINAL_CLOSE_STEPS.slice(0, completed)),
      issueNumber: 925,
    });
    const run = await runClose({
      boardState: completedSet.has('board') ? 'done' : 'review',
      closeSnapshot: completedSet.has('issue')
        ? { issueClosed: true, stateReason: 'completed' }
        : { issueClosed: false, stateReason: null },
      body,
      gateReviewToDone: false,
      reviewAuthorization: { mode: 'full-auto', standing: true, source: 'test' },
      force: true,
      trackEstimationOutcomes: true,
    });

    assert.deepEqual(
      {
        timingRows: run.calls.timingRows.length,
        estimationOutcomes: run.calls.estimationOutcomes,
        lifecycleReconciles: run.calls.lifecycleReconciles,
        boardWrites: run.calls.movesToDone.length,
        dispositionWrites: run.calls.terminalDispositions,
        issueCloses: run.calls.issueCloses,
        labelWrites: run.calls.labelWrites,
        bindingReleases: run.calls.bindingReleases,
      },
      {
        timingRows: completedSet.has('timing') ? 0 : 2,
        estimationOutcomes: completedSet.has('estimation') ? 0 : 1,
        lifecycleReconciles: completedSet.has('lifecycle') ? 0 : 1,
        boardWrites: completedSet.has('board') ? 0 : 1,
        dispositionWrites: completedSet.has('disposition') ? 0 : 1,
        issueCloses: completedSet.has('issue') ? 0 : 1,
        labelWrites: completedSet.has('labels') ? 0 : 1,
        bindingReleases: completedSet.has('binding') ? 0 : 1,
      }
    );
  }
});

test('Done-board open-issue retry resumes at issue close without replaying earlier steps', async () => {
  const body = upsertDeliveredCloseTransaction(closeBody(), {
    ...transaction(TERMINAL_CLOSE_STEPS.slice(0, 5)),
    issueNumber: 925,
  });
  const run = await runClose({
    boardState: 'done',
    closeSnapshot: { issueClosed: false, stateReason: null },
    body,
    gateReviewToDone: false,
    reviewAuthorization: { mode: 'full-auto', standing: true, source: 'test' },
    force: true,
    trackEstimationOutcomes: true,
  });

  assert.equal(run.exitCode, 0);
  assert.equal(run.calls.freshDeliveryVerifications, 1);
  assert.deepEqual(
    {
      timingRows: run.calls.timingRows.length,
      estimationOutcomes: run.calls.estimationOutcomes,
      lifecycleReconciles: run.calls.lifecycleReconciles,
      boardWrites: run.calls.movesToDone.length,
      dispositionWrites: run.calls.terminalDispositions,
      issueCloses: run.calls.issueCloses,
      labelWrites: run.calls.labelWrites,
      bindingReleases: run.calls.bindingReleases,
    },
    {
      timingRows: 0,
      estimationOutcomes: 0,
      lifecycleReconciles: 0,
      boardWrites: 0,
      dispositionWrites: 0,
      issueCloses: 1,
      labelWrites: 1,
      bindingReleases: 1,
    }
  );
});

test('closed Done retry resumes only labels and binding from durable issue step', async () => {
  const body = upsertDeliveredCloseTransaction(closeBody(), {
    ...transaction(TERMINAL_CLOSE_STEPS.slice(0, 6)),
    issueNumber: 925,
  });
  const run = await runClose({
    boardState: 'done',
    closeSnapshot: { issueClosed: true, stateReason: 'completed' },
    body,
    gateReviewToDone: false,
    reviewAuthorization: { mode: 'full-auto', standing: true, source: 'test' },
    force: true,
    trackEstimationOutcomes: true,
  });

  assert.equal(run.exitCode, 0);
  assert.equal(run.calls.freshDeliveryVerifications, 1);
  assert.deepEqual(
    {
      timingRows: run.calls.timingRows.length,
      estimationOutcomes: run.calls.estimationOutcomes,
      lifecycleReconciles: run.calls.lifecycleReconciles,
      boardWrites: run.calls.movesToDone.length,
      dispositionWrites: run.calls.terminalDispositions,
      issueCloses: run.calls.issueCloses,
      labelWrites: run.calls.labelWrites,
      bindingReleases: run.calls.bindingReleases,
    },
    {
      timingRows: 0,
      estimationOutcomes: 0,
      lifecycleReconciles: 0,
      boardWrites: 0,
      dispositionWrites: 0,
      issueCloses: 0,
      labelWrites: 1,
      bindingReleases: 1,
    }
  );
});

test('closed not-Done issue resumes its delivered-close transaction', async () => {
  const body = upsertDeliveredCloseTransaction(closeBody(), {
    ...transaction(TERMINAL_CLOSE_STEPS.slice(0, 3)),
    issueNumber: 925,
  });
  const run = await runClose({
    boardState: 'review',
    closeSnapshot: { issueClosed: true, stateReason: 'completed' },
    body,
    gateReviewToDone: false,
    reviewAuthorizationResolver: () => {
      throw new Error('durable retry must not reauthorize Review');
    },
    trackEstimationOutcomes: true,
  });

  assert.equal(run.exitCode, 0);
  assert.equal(run.calls.movesToDone.length, 1);
  assert.equal(run.calls.issueCloses, 0);
  assert.deepEqual(
    readDeliveredCloseTransactions(run.body)[0].completedSteps,
    TERMINAL_CLOSE_STEPS
  );
});

test('pending Delivered disposition is adopted without overwriting it', async () => {
  const body = upsertDeliveredCloseTransaction(closeBody(), {
    ...transaction(TERMINAL_CLOSE_STEPS.slice(0, 4)),
    issueNumber: 925,
  });
  const run = await runClose({
    boardState: 'done',
    closeSnapshot: { issueClosed: false, stateReason: null },
    body,
    terminalDisposition: 'Delivered',
  });

  assert.equal(run.exitCode, 0);
  assert.equal(run.calls.terminalDispositions, 0);
  assert.deepEqual(
    readDeliveredCloseTransactions(run.body)[0].completedSteps,
    TERMINAL_CLOSE_STEPS
  );
});

test('durable effects without checkpoints are observed and adopted before replay', async () => {
  const cases = [
    {
      step: 'board',
      completed: 3,
      options: {
        boardState: 'done',
        closeSnapshot: { issueClosed: false, stateReason: null },
      },
      effectCount: (calls) => calls.movesToDone.length,
    },
    {
      step: 'issue',
      completed: 5,
      options: {
        boardState: 'done',
        closeSnapshot: { issueClosed: true, stateReason: 'completed' },
      },
      effectCount: (calls) => calls.issueCloses,
    },
    {
      step: 'labels',
      completed: 6,
      options: {
        boardState: 'done',
        closeSnapshot: { issueClosed: true, stateReason: 'completed' },
        liveLabels: [],
      },
      effectCount: (calls) => calls.labelWrites,
    },
    {
      step: 'binding',
      completed: 7,
      options: {
        boardState: 'done',
        closeSnapshot: { issueClosed: true, stateReason: 'completed' },
        liveLabels: [],
        bindingReleased: true,
      },
      effectCount: (calls) => calls.bindingReleases,
    },
  ];

  for (const recoveryCase of cases) {
    const body = upsertDeliveredCloseTransaction(closeBody(), {
      ...transaction(TERMINAL_CLOSE_STEPS.slice(0, recoveryCase.completed)),
      issueNumber: 925,
    });
    const run = await runClose({ body, ...recoveryCase.options });
    assert.equal(run.exitCode, 0, recoveryCase.step);
    assert.equal(recoveryCase.effectCount(run.calls), 0, `${recoveryCase.step} effect replayed`);
    assert.deepEqual(
      readDeliveredCloseTransactions(run.body)[0].completedSteps,
      TERMINAL_CLOSE_STEPS,
      recoveryCase.step
    );
  }
});

test('newer binding conflict survives a terminal close retry untouched', async () => {
  const body = upsertDeliveredCloseTransaction(closeBody(), {
    ...transaction(TERMINAL_CLOSE_STEPS.slice(0, 7)),
    issueNumber: 925,
  });
  const run = await runClose({
    boardState: 'done',
    closeSnapshot: { issueClosed: true, stateReason: 'completed' },
    body,
    bindingReleaseStatus: 'conflict',
  });

  assert.equal(run.exitCode, 1);
  assert.equal(run.calls.bindingReleases, 0);
  assert.equal(run.calls.bindingResumes, 0);
  assert.deepEqual(
    readDeliveredCloseTransactions(run.body)[0].completedSteps,
    TERMINAL_CLOSE_STEPS.slice(0, 7)
  );
});

test('stale pre-close binding residue resumes without refreshing close authority', async () => {
  const body = upsertDeliveredCloseTransaction(closeBody(), {
    ...transaction(TERMINAL_CLOSE_STEPS.slice(0, 7)),
    issueNumber: 925,
  });
  const run = await runClose({
    boardState: 'done',
    closeSnapshot: { issueClosed: true, stateReason: 'completed' },
    body,
    bindingReleaseStatus: 'incomplete',
  });

  assert.equal(run.exitCode, 0);
  assert.equal(run.calls.bindingReleases, 0);
  assert.equal(run.calls.bindingResumes, 1);
  assert.deepEqual(
    readDeliveredCloseTransactions(run.body)[0].completedSteps,
    TERMINAL_CLOSE_STEPS
  );
});

test('Done-state durable retry bypasses ordinary Review gates without force or renewed approval', async () => {
  const body = upsertDeliveredCloseTransaction(
    `${closeBody()}\n<!-- aitm-move-complete state=done ts=2026-08-28T00:00:00Z -->`,
    {
      ...transaction(TERMINAL_CLOSE_STEPS.slice(0, 6)),
      issueNumber: 925,
    }
  );
  const run = await runClose({
    boardState: 'done',
    closeSnapshot: { issueClosed: true, stateReason: 'completed' },
    body,
    gateReviewToDone: true,
    reviewAuthorizationResolver: () => {
      throw new Error('ordinary review authorization must not rerun');
    },
  });

  assert.equal(run.exitCode, 0);
  assert.equal(run.calls.labelWrites, 1);
  assert.equal(run.calls.bindingReleases, 1);
});

test('disposition read outage after transaction discovery fails closed', async () => {
  const body = upsertDeliveredCloseTransaction(closeBody(), {
    ...transaction(TERMINAL_CLOSE_STEPS.slice(0, 6)),
    issueNumber: 925,
  });
  const run = await runClose({
    boardState: 'done',
    closeSnapshot: { issueClosed: true, stateReason: 'completed' },
    body,
    terminalDispositionError: new Error('project field unavailable'),
  });

  assert.equal(run.result?.action, 'inspect');
  assert.equal(run.result?.failedStep, 'readTerminalDisposition');
  assert.equal(run.calls.freshDeliveryVerifications, 0);
  assert.equal(run.calls.mutations, 0);
});

test('label cleanup failure leaves labels and binding transaction steps pending', async () => {
  const body = upsertDeliveredCloseTransaction(closeBody(), {
    ...transaction(TERMINAL_CLOSE_STEPS.slice(0, 6)),
    issueNumber: 925,
  });
  const run = await runClose({
    boardState: 'done',
    closeSnapshot: { issueClosed: true, stateReason: 'completed' },
    body,
    labelWriteError: new Error('label API unavailable'),
  });

  assert.equal(run.exitCode, 1);
  assert.equal(run.calls.bindingReleases, 0);
  assert.deepEqual(
    readDeliveredCloseTransactions(run.body)[0].completedSteps,
    TERMINAL_CLOSE_STEPS.slice(0, 6)
  );
});

test('markerless open Done close is adopted into a complete durable transaction', async () => {
  const run = await runClose({
    boardState: 'done',
    closeSnapshot: { issueClosed: false, stateReason: null },
    body: closeBody(),
    gateReviewToDone: false,
    reviewAuthorization: { mode: 'full-auto', standing: true, source: 'test' },
    trackEstimationOutcomes: true,
  });

  assert.equal(run.exitCode, 0);
  assert.deepEqual(
    readDeliveredCloseTransactions(run.body)[0].completedSteps,
    TERMINAL_CLOSE_STEPS
  );
});

test('receipt-gate injection does not implicitly bypass fresh verification', async () => {
  const run = await runClose({
    boardState: 'review',
    closeSnapshot: { issueClosed: false, stateReason: null },
    body: closeBody(),
    gateReviewToDone: false,
    reviewAuthorization: { mode: 'full-auto', standing: true, source: 'test' },
    force: true,
    useInjectedFreshDeliveryVerification: false,
  });

  assert.equal(run.exitCode, 1);
  assert.equal(run.calls.movesToDone.length, 0);
  assert.equal(run.calls.issueCloses, 0);
  assert.equal(run.calls.terminalDispositions, 0);
});

test('lost transaction-checkpoint response is adopted without repeating durable effects', async () => {
  const countEffects = (calls) => [
    calls.timingRows.length,
    calls.estimationOutcomes,
    calls.lifecycleReconciles,
    calls.movesToDone.length,
    calls.terminalDispositions,
    calls.issueCloses,
    calls.labelWrites,
    calls.bindingReleases,
  ];

  for (let stepIndex = 0; stepIndex < TERMINAL_CLOSE_STEPS.length; stepIndex += 1) {
    let mutationCalls = 0;
    let persistedBody = null;
    await assert.rejects(
      runClose({
        boardState: 'review',
        closeSnapshot: { issueClosed: false, stateReason: null },
        body: closeBody(),
        gateReviewToDone: true,
        reviewAuthorization: { mode: 'human', standing: true, source: 'test' },
        force: true,
        trackEstimationOutcomes: true,
        mutationResult: ({ nextBody }) => {
          mutationCalls += 1;
          if (mutationCalls === stepIndex + 2) {
            persistedBody = nextBody;
            return { status: 'error', body: nextBody };
          }
          return { status: 'ok', body: nextBody };
        },
      }),
      /delivered close transaction write did not return authoritative body/
    );
    assert.ok(persistedBody, `checkpoint body must persist for ${TERMINAL_CLOSE_STEPS[stepIndex]}`);

    const retry = await runClose({
      boardState: stepIndex >= 3 ? 'done' : 'review',
      closeSnapshot:
        stepIndex >= 5
          ? { issueClosed: true, stateReason: 'completed' }
          : { issueClosed: false, stateReason: null },
      body: persistedBody,
      gateReviewToDone: true,
      reviewAuthorizationResolver: () => {
        throw new Error('durable retry must not reauthorize Review');
      },
      trackEstimationOutcomes: true,
    });
    const retryEffects = countEffects(retry.calls);
    for (let completed = 0; completed <= stepIndex; completed += 1) {
      assert.equal(
        retryEffects[completed],
        0,
        `${TERMINAL_CLOSE_STEPS[completed]} repeated after its persisted checkpoint`
      );
    }
  }
});
