// @story #925 #1403
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  readUnauthorizedCloseRecovery,
  upsertUnauthorizedCloseRecovery,
} from '../../../../task-tracker/lib/closed-issue-convergence.mjs';
import {
  baseState,
  closeBody,
  runClose,
} from '../../../helpers/close-convergence-wiring-helpers.mjs';
import { resolveReviewAuthorization } from '../../../../task-tracker/lib/gate-resolve.mjs';

const HEAD = 'a'.repeat(40);

function testReceiptMarker(commitSha = HEAD) {
  const data = Buffer.from(JSON.stringify({ stage: 'test', commitSha })).toString('base64url');
  return `<!-- aitm-verification-receipt stage="test" data="${data}" -->`;
}

function directoryEvidence() {
  const authority = { contractEpoch: 3, coordinatorGrantId: 'grant-3', authorityEpoch: 7 };
  const entry = (recordId, evidenceKind, result, provenance) => ({
    recordId,
    recordType: 'review-result',
    evidenceKind,
    result,
    contractEpoch: 3,
    commitSha: HEAD,
    provenance,
    authority: { grantId: 'grant-3', epoch: 7 },
  });
  return {
    sourceKind: 'github-records/v1',
    expectedSha: HEAD,
    evidence: [
      entry('review-1', 'review', 'passed', 'agent'),
      entry('approval-1', 'approval', 'approved', 'human'),
    ],
    acceptedRecordIds: ['review-1', 'approval-1'],
    authority,
  };
}

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

  const humanWithDisabledPolicy = await runClose({
    gateReviewToDone: false,
    reviewAuthorization: { mode: 'human', standing: true, source: 'human-evidence' },
  });
  assert.equal(humanWithDisabledPolicy.calls.movesToDone[0].options.reviewAuthority, 'human-gate');

  const fullAuto = await runClose({
    gateReviewToDone: false,
    reviewAuthorization: { mode: 'full-auto', standing: true, source: 'session' },
  });
  assert.equal(fullAuto.calls.movesToDone[0].options.reviewAuthority, 'gate-bypassed');
});

test('stale close approval refuses after fresh Test and Agent Review evidence', async () => {
  const stale = await runClose({
    gateReviewToDone: false,
    body: `${closeBody()}\n<!-- aitm-review-approved ts="2026-08-22T00:00:00Z" approved-sha="${'b'.repeat(40)}" full-auto="yes" signals="session=1" -->`,
    reviewAuthorizationResolver: (input) => resolveReviewAuthorization(input),
  });
  assert.equal(stale.exitCode, 1);
  assert.equal(stale.calls.movesToDone.length, 0);

  const refreshed = await runClose({
    gateReviewToDone: false,
    body: `${closeBody()}\n<!-- aitm-review-approved ts="2026-08-22T00:00:00Z" approved-sha="${HEAD}" full-auto="yes" signals="session=1" -->`,
    reviewAuthorizationResolver: (input) => resolveReviewAuthorization(input),
  });
  assert.equal(refreshed.exitCode, 0);
  assert.equal(refreshed.calls.movesToDone.length, 1);
});

test('#1403 close authorizes review against accepted delivery SHA after local HEAD advances', async () => {
  const laterHead = 'b'.repeat(40);
  let authorizationInput = null;
  const run = await runClose({
    deliveryGateInput: {
      issueNumber: 925,
      lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
      branch: 'feature/925',
      acceptedSha: HEAD,
      localHeadSha: laterHead,
      pullRequests: [],
      records: null,
    },
    reviewAuthorizationResolver: (input) => {
      authorizationInput = input;
      return { mode: 'human', standing: true, source: 'test-evidence' };
    },
  });

  assert.equal(run.exitCode, 0);
  assert.equal(authorizationInput.acceptedHeadSha, HEAD);
});

test('close consumes marker-free exact-head directory human authority', async () => {
  const run = await runClose({
    gateReviewToDone: false,
    lifecycleEvidence: directoryEvidence(),
    useInjectedReviewAuthorization: false,
  });
  assert.equal(run.exitCode, 0);
  assert.equal(run.calls.movesToDone[0].options.reviewAuthority, 'human-gate');
  assert.equal(run.calls.mutations, 0, 'directory authority must not create a body marker');
});

test('production close derives accepted head from marker-free directory Review evidence', async () => {
  const run = await runClose({
    gateReviewToDone: false,
    body: `${closeBody()}\n${testReceiptMarker()}`,
    lifecycleEvidence: directoryEvidence(),
    useInjectedReviewAuthorization: false,
    useInjectedDeliveryGateInput: false,
    useInjectedDeliveryReceipt: false,
  });

  assert.equal(run.exitCode, 0);
  assert.equal(run.calls.movesToDone[0].options.reviewAuthority, 'human-gate');
  assert.equal(run.calls.mutations, 0, 'directory authority must remain marker-free');
});

test('production close refuses directory Review without directory Approval despite body approval', async () => {
  const evidence = directoryEvidence();
  evidence.evidence = evidence.evidence.filter(({ evidenceKind }) => evidenceKind === 'review');
  evidence.acceptedRecordIds = ['review-1'];
  const bodyApproval = `<!-- aitm-review-approved ts="2026-08-22T00:00:00Z" approved-sha="${HEAD}" -->`;
  const run = await runClose({
    gateReviewToDone: false,
    body: `${closeBody({ agentReview: ' ' })}\n${testReceiptMarker()}\n${bodyApproval}`,
    lifecycleEvidence: evidence,
    useInjectedReviewAuthorization: false,
    useInjectedDeliveryGateInput: false,
    useInjectedDeliveryReceipt: false,
  });

  assert.equal(run.exitCode, 1);
  assert.equal(run.calls.movesToDone.length, 0);
  assert.equal(run.calls.mutations, 0);
});

test('close fails closed for stale or malformed marker-free directory authority', async () => {
  const current = directoryEvidence();
  const missingReview = {
    ...current,
    evidence: current.evidence.filter(({ evidenceKind }) => evidenceKind === 'approval'),
    acceptedRecordIds: ['approval-1'],
  };
  for (const lifecycleEvidence of [
    { ...current, expectedSha: 'b'.repeat(40) },
    { sourceKind: 'github-records/v1', expectedSha: HEAD },
    missingReview,
  ]) {
    const run = await runClose({
      gateReviewToDone: false,
      body: `${closeBody()}\n${testReceiptMarker()}`,
      lifecycleEvidence,
      useInjectedReviewAuthorization: false,
      useInjectedDeliveryGateInput: false,
      useInjectedDeliveryReceipt: false,
    });
    assert.equal(run.exitCode, 1);
    assert.equal(run.calls.movesToDone.length, 0);
    assert.equal(run.calls.mutations, 0);
  }
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
