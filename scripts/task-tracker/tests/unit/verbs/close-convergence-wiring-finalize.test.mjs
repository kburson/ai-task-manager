// @story #925
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  readUnauthorizedCloseRecovery,
  upsertUnauthorizedCloseRecovery,
} from '../../../lib/closed-issue-convergence.mjs';
import { baseState, closeBody, runClose } from './close-convergence-wiring-helpers.mjs';

test('finalize passes the configured tail profile and explicit review authority', async () => {
  const run = await runClose({ convergenceTailProfile: 'background-convergence' });

  assert.equal(run.result?.action, 'finalize');
  assert.equal(run.result?.status, 'completed');
  assert.equal(run.calls.movesToDone.length, 1);
  assert.equal(run.calls.movesToDone[0].options.tailProfile, 'background-convergence');
  assert.equal(run.calls.movesToDone[0].options.reviewAuthority, 'human-gate');
  assert.equal(run.exitCode, 0);

  const defaultProfile = await runClose();
  assert.equal(defaultProfile.calls.movesToDone[0].options.tailProfile, 'task-owner');

  const bypassed = await runClose({ gateReviewToDone: false });
  assert.equal(bypassed.calls.movesToDone[0].options.reviewAuthority, 'gate-bypassed');
});

for (const [name, convergenceTailProfile] of [
  ['empty string', ''],
  ['null', null],
  ['false', false],
  ['zero', 0],
  ['negative zero', -0],
  ['zero bigint', 0n],
  ['NaN', Number.NaN],
  ['object', {}],
  ['unknown string', 'unknown-profile'],
]) {
  test(`verb entry rejects a ${name} tail profile before every observable effect`, async () => {
    let calls;
    let finalState;
    const initialState = {
      ...baseState(),
      active: null,
      lastActive: null,
    };
    const serializedInitialState = JSON.stringify(initialState);
    await assert.rejects(
      runClose({
        convergenceTailProfile,
        initialState,
        captureCalls: (value) => {
          calls = value;
        },
        captureFinalState: (value) => {
          finalState = value;
        },
      }),
      /invalid move-tail profile|unknown move-tail profile/
    );

    assert.deepEqual(
      {
        boardReads: calls.boardReads,
        bodyReads: calls.bodyReads,
        childSnapshots: calls.childSnapshots,
        closeSnapshotReads: calls.closeSnapshotReads,
        drains: calls.drains,
        flushes: calls.flushes,
        issueCloses: calls.issueCloses,
        logIssueTime: calls.logIssueTime,
        mutations: calls.mutations,
        networkCalls: calls.networkCalls,
        reopens: calls.reopens,
        timingReads: calls.timingReads,
        timingRows: calls.timingRows.length,
      },
      {
        boardReads: 0,
        bodyReads: 0,
        childSnapshots: 0,
        closeSnapshotReads: 0,
        drains: 0,
        flushes: 0,
        issueCloses: 0,
        logIssueTime: 0,
        mutations: 0,
        networkCalls: 0,
        reopens: 0,
        timingReads: 0,
        timingRows: 0,
      }
    );
    assert.deepEqual(calls.movesToDone, []);
    assert.deepEqual(calls.movesToReview, []);
    assert.equal(
      finalState,
      serializedInitialState,
      'invalid input must not bind or persist state'
    );
  });
}

test('lifecycle reconcile delegates through the grouped issue-body mutator', async () => {
  const run = await runClose({ delegateLifecycleHelper: true });

  assert.equal(run.result?.status, 'completed');
  assert.equal(run.calls.lifecycleFallbacks, 0);
  assert.equal(run.calls.mutations, 1);
  assert.match(run.body, /- \[x\] Story closed and moved to Done/);
  assert.match(run.body, /- \[x\] Timing data flushed to issue/);
  assert.equal(run.exitCode, 0);
});

for (const [name, timingBody] of [
  [
    'transaction prefix',
    '| 2026-07-29 20:00:00 -05:00 | unauthorized-close |  |  |  | 0 | tx=abc2; recovered |',
  ],
  [
    'incidental prose',
    '| 2026-07-29 20:00:00 -05:00 | unauthorized-close |  |  |  | 0 | context-tx=abc; recovered |',
  ],
]) {
  test(`${name} does not satisfy exact timing transaction lookup`, async () => {
    const recovery = {
      tx: 'abc',
      phase: 'review',
      stateReason: 'completed',
      unticked: ['Agent Review Passed'],
      actor: 'unknown',
      ts: new Date().toISOString(),
    };
    const run = await runClose({
      closeSnapshot: { issueClosed: false, stateReason: null },
      body: upsertUnauthorizedCloseRecovery(closeBody({ agentReview: ' ' }), recovery),
      timingBody,
    });

    assert.equal(run.result?.status, 'recovered');
    assert.equal(run.calls.timingRows.length, 1);
    assert.match(run.calls.timingRows[0], /tx=abc;/);
  });
}

for (const [name, timingResult] of [
  ['false', false],
  ['failed', { ok: false }],
  ['queued', { ok: false, queued: true }],
]) {
  test(`${name} timing audit fails and leaves durable recovery pending at Review`, async () => {
    const run = await runClose({
      body: closeBody({ agentReview: ' ' }),
      timingResult,
    });

    assert.equal(run.result?.action, 'aberration');
    assert.equal(run.result?.status, 'failed');
    assert.equal(run.result?.failedStep, 'postTimingAudit');
    assert.equal(run.result?.durablePhase, 'review');
    assert.equal(readUnauthorizedCloseRecovery(run.body)?.phase, 'review');
    assert.equal(run.calls.timingRows.length, 1);
    assert.equal(run.exitCode, 1);
  });
}
