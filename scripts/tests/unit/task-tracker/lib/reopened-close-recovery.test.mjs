#!/usr/bin/env node
// @story #1490
//
// Terminal-lifecycle recovery for a COMPLETED delivered-close transaction that
// survived a reopen. Modelled on #1490's own live shape: delivered and closed at
// `d6a3dece`, reopened for a corrective delivery, re-delivered at a new accepted SHA,
// with the eight-step transaction still recording the original close.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { TERMINAL_CLOSE_STEPS } from '../../../../task-tracker/lib/close-convergence.mjs';
import {
  REOPENED_CLOSE_RECOVERY_REASON,
  REOPENED_CLOSE_RECOVERY_SCHEMA,
  ReopenedCloseRecoveryError,
  authorizeReopenedCloseRestart,
  createReopenedCloseRecoveryRecord,
  replaceCompletedDeliveredCloseTransaction,
} from '../../../../task-tracker/lib/reopened-close-recovery.mjs';

const OLD_SHA = 'd'.repeat(40);
const NEW_SHA = 'b'.repeat(40);
const OLD_TX = 'ad96d1e1-8c17-471e-a060-279975761e50';
const NEW_TX = '11111111-2222-3333-4444-555555555555';
const NOW = '2026-09-03T06:30:00.000Z';
const REPO = 'kburson/ai-task-manager';

function oldTransaction(overrides = {}) {
  return {
    schema: 'aitm.delivered-close/v1',
    transactionId: OLD_TX,
    issueNumber: 1490,
    acceptedSha: OLD_SHA,
    reviewAuthority: 'human-gate',
    completedSteps: [...TERMINAL_CLOSE_STEPS],
    ...overrides,
  };
}

function live(overrides = {}) {
  return {
    boardState: 'review',
    issueClosed: false,
    stateReason: 'REOPENED',
    terminalDisposition: 'Delivered',
    dirty: false,
    bindingStatus: 'pending',
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    historicalDelivery: { acceptedSha: OLD_SHA, verified: true },
    currentDelivery: {
      acceptedSha: NEW_SHA,
      testReceiptSha: NEW_SHA,
      reviewApprovedSha: NEW_SHA,
      deliveryVerified: true,
    },
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    repository: REPO,
    issueNumber: 1490,
    oldTransaction: oldTransaction(),
    newAcceptedSha: NEW_SHA,
    newReviewAuthority: 'human-gate',
    actor: 'kburson',
    live: live(),
    evidence: evidence(),
    ...overrides,
  };
}

function bodyWith(transaction) {
  const props = [
    'schema="' + transaction.schema + '"',
    'tx="' + transaction.transactionId + '"',
    'issue="' + transaction.issueNumber + '"',
    'accepted-sha="' + transaction.acceptedSha + '"',
    'review-authority="' + transaction.reviewAuthority + '"',
    'completed="' + JSON.stringify(transaction.completedSteps).replace(/"/g, '&quot;') + '"',
  ].join(' ');
  return 'issue body\n\n<!-- aitm-delivered-close ' + props + ' -->\n';
}

test('#1490: the exact completed-and-reopened shape authorizes', () => {
  const authorization = authorizeReopenedCloseRestart(input());
  assert.equal(authorization.reason, REOPENED_CLOSE_RECOVERY_REASON);
  assert.equal(authorization.newAcceptedSha, NEW_SHA);
  assert.equal(authorization.oldTransaction.acceptedSha, OLD_SHA);
});

test('#1490: a partial or reordered terminal sequence refuses', () => {
  for (const steps of [
    TERMINAL_CLOSE_STEPS.slice(0, 3),
    TERMINAL_CLOSE_STEPS.slice(0, 7),
    [...TERMINAL_CLOSE_STEPS].reverse(),
    [],
  ]) {
    assert.throws(
      () =>
        authorizeReopenedCloseRestart(
          input({ oldTransaction: oldTransaction({ completedSteps: steps }) })
        ),
      ReopenedCloseRecoveryError
    );
  }
});

test('#1490: a malformed transaction refuses', () => {
  assert.throws(
    () => authorizeReopenedCloseRestart(input({ oldTransaction: { schema: 'wrong' } })),
    /old-transaction/
  );
  assert.throws(
    () =>
      authorizeReopenedCloseRestart(
        input({ oldTransaction: oldTransaction({ reviewAuthority: 'nobody' }) })
      ),
    /old-transaction/
  );
});

test('#1490: an identical old and new accepted SHA refuses', () => {
  assert.throws(
    () => authorizeReopenedCloseRestart(input({ newAcceptedSha: OLD_SHA })),
    /fresh-authority/
  );
});

test('#1490: every contradictory live state refuses', () => {
  const contradictions = [
    { boardState: 'develop' },
    { issueClosed: true },
    { stateReason: 'COMPLETED' },
    { terminalDisposition: null },
    { terminalDisposition: 'Incorporated' },
    { dirty: true },
    { bindingStatus: 'released' },
  ];
  for (const override of contradictions) {
    assert.throws(
      () => authorizeReopenedCloseRestart(input({ live: live(override) })),
      /live-terminal-state/,
      JSON.stringify(override)
    );
  }
});

test('#1490: stale or missing delivery evidence refuses', () => {
  assert.throws(
    () =>
      authorizeReopenedCloseRestart(
        input({
          evidence: evidence({ historicalDelivery: { acceptedSha: OLD_SHA, verified: false } }),
        })
      ),
    /historical-evidence/
  );
  assert.throws(
    () =>
      authorizeReopenedCloseRestart(
        input({
          evidence: evidence({
            currentDelivery: {
              acceptedSha: NEW_SHA,
              testReceiptSha: OLD_SHA,
              reviewApprovedSha: NEW_SHA,
              deliveryVerified: true,
            },
          }),
        })
      ),
    /current-evidence/
  );
  assert.throws(
    () =>
      authorizeReopenedCloseRestart(
        input({
          evidence: evidence({
            currentDelivery: {
              acceptedSha: NEW_SHA,
              testReceiptSha: NEW_SHA,
              reviewApprovedSha: NEW_SHA,
              deliveryVerified: false,
            },
          }),
        })
      ),
    /current-evidence/
  );
});

test('#1490: the recovery record captures both transactions, SHAs, and authorities', () => {
  const authorization = authorizeReopenedCloseRestart(input());
  const record = createReopenedCloseRecoveryRecord(authorization, {
    now: NOW,
    randomUUIDFn: () => NEW_TX,
  });
  assert.equal(record.schema, REOPENED_CLOSE_RECOVERY_SCHEMA);
  assert.equal(record.reason, REOPENED_CLOSE_RECOVERY_REASON);
  assert.equal(record.oldTransactionId, OLD_TX);
  assert.equal(record.replacementTransactionId, NEW_TX);
  assert.equal(record.oldAcceptedSha, OLD_SHA);
  assert.equal(record.newAcceptedSha, NEW_SHA);
  assert.equal(record.oldReviewAuthority, 'human-gate');
  assert.equal(record.newReviewAuthority, 'human-gate');
  assert.equal(record.actor, 'kburson');
  assert.equal(record.ts, NOW);
  assert.deepEqual(record.completedSteps, [...TERMINAL_CLOSE_STEPS]);
});

test('#1490: the recovery identity is deterministic, so a retry reuses it', () => {
  const authorization = authorizeReopenedCloseRestart(input());
  const first = createReopenedCloseRecoveryRecord(authorization, {
    now: NOW,
    randomUUIDFn: () => NEW_TX,
  });
  const second = createReopenedCloseRecoveryRecord(authorization, {
    now: NOW,
    randomUUIDFn: () => NEW_TX,
  });
  assert.equal(first.recoveryId, second.recoveryId);
  assert.match(first.recoveryId, /^close-reopened:[0-9a-f]{64}$/);
});

test('#1490: the replacement transaction begins with zero completed steps', () => {
  const authorization = authorizeReopenedCloseRestart(input());
  const record = createReopenedCloseRecoveryRecord(authorization, {
    now: NOW,
    randomUUIDFn: () => NEW_TX,
  });
  const result = replaceCompletedDeliveredCloseTransaction(
    bodyWith(oldTransaction()),
    authorization,
    record
  );
  assert.equal(result.status, 'replaced');
  assert.deepEqual(result.transaction.completedSteps, []);
  assert.equal(result.transaction.acceptedSha, NEW_SHA);
  assert.equal(result.transaction.transactionId, NEW_TX);
  assert.ok(result.body.includes(NEW_TX));
});

test('#1490: replacing an already-replaced marker is an idempotent no-op', () => {
  const authorization = authorizeReopenedCloseRestart(input());
  const record = createReopenedCloseRecoveryRecord(authorization, {
    now: NOW,
    randomUUIDFn: () => NEW_TX,
  });
  const once = replaceCompletedDeliveredCloseTransaction(
    bodyWith(oldTransaction()),
    authorization,
    record
  );
  const twice = replaceCompletedDeliveredCloseTransaction(once.body, authorization, record);
  assert.equal(twice.status, 'already-replaced');
  assert.equal(twice.body, once.body);
  assert.equal(twice.transaction.transactionId, NEW_TX);
});

test('#1490: a body whose transaction is not the authorized one refuses', () => {
  const authorization = authorizeReopenedCloseRestart(input());
  const record = createReopenedCloseRecoveryRecord(authorization, {
    now: NOW,
    randomUUIDFn: () => NEW_TX,
  });
  const foreign = bodyWith(oldTransaction({ transactionId: 'someone-elses-transaction' }));
  assert.throws(
    () => replaceCompletedDeliveredCloseTransaction(foreign, authorization, record),
    /stale-body/
  );
});

test('#1490: zero or multiple delivered-close transactions refuse', () => {
  const authorization = authorizeReopenedCloseRestart(input());
  const record = createReopenedCloseRecoveryRecord(authorization, {
    now: NOW,
    randomUUIDFn: () => NEW_TX,
  });
  assert.throws(
    () => replaceCompletedDeliveredCloseTransaction('no markers here', authorization, record),
    /ambiguous-body/
  );
});

test('#1490: a record whose intent disagrees with the authorization refuses', () => {
  const authorization = authorizeReopenedCloseRestart(input());
  const record = createReopenedCloseRecoveryRecord(authorization, {
    now: NOW,
    randomUUIDFn: () => NEW_TX,
  });
  const tampered = { ...record, actor: 'someone-else' };
  assert.throws(
    () =>
      replaceCompletedDeliveredCloseTransaction(
        bodyWith(oldTransaction()),
        authorization,
        tampered
      ),
    /record/
  );
});
