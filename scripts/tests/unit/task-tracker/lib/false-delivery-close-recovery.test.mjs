#!/usr/bin/env node
// @story #1635

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { TERMINAL_CLOSE_STEPS } from '../../../../task-tracker/lib/close-convergence.mjs';
import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
} from '../../../../task-tracker/lib/delivery-records.mjs';
import { buildNoCommitDeliveryRecord } from '../../../../task-tracker/lib/no-commit-delivery-record.mjs';
import {
  FALSE_DELIVERY_CLOSE_RECOVERY_REASON,
  FALSE_DELIVERY_CLOSE_RECOVERY_SCHEMA,
  FalseDeliveryCloseRecoveryError,
  authorizeFalseDeliveryCloseRestart,
  classifyFalseDeliveryRecoveryProgress,
  createFalseDeliveryCloseRecoveryRecord,
  findFalseDeliveryRecoveryBackedReplacement,
  oldFalseDeliveryTransactionFromRecord,
  parseFalseDeliveryCloseRecoveryComment,
  renderFalseDeliveryCloseRecoveryComment,
  replaceFalseDeliveredCloseTransaction,
  resolveFalseDeliveryCloseRecovery,
} from '../../../../task-tracker/lib/false-delivery-close-recovery.mjs';

const REPOSITORY = 'kburson/ai-task-manager';
const ISSUE = 1624;
const AUDIT_ISSUE = 1633;
const RECOVERY_ISSUE = 1635;
const ACCEPTED_SHA = 'a'.repeat(40);
const MERGE_SHA = 'b'.repeat(40);
const OLD_TRANSACTION_ID = 'old-close-transaction';
const REPLACEMENT_TRANSACTION_ID = 'replacement-close-transaction';
const INTENT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const NO_COMMIT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
const DELIVERABLE_URL =
  'https://github.com/kburson/ai-task-manager/issues/1624#issuecomment-5675442778';
const AUDIT_URL = 'https://github.com/kburson/ai-task-manager/issues/1633#issuecomment-5680000000';
const NOW = '2026-09-15T17:00:00.000Z';

function oldTransaction(overrides = {}) {
  return {
    schema: 'aitm.delivered-close/v1',
    transactionId: OLD_TRANSACTION_ID,
    issueNumber: ISSUE,
    acceptedSha: ACCEPTED_SHA,
    reviewAuthority: 'gate-bypassed',
    completedSteps: [...TERMINAL_CLOSE_STEPS],
    ...overrides,
  };
}

function noCommitRecord(overrides = {}) {
  return {
    id: '5675626501',
    createdAt: '2026-09-15T06:13:55.000Z',
    record: buildNoCommitDeliveryRecord({
      recordId: NO_COMMIT_ID,
      repository: REPOSITORY,
      issueNumber: ISSUE,
      issueKind: 'epic',
      deliverableUrl: DELIVERABLE_URL,
      acceptedSha: ACCEPTED_SHA,
      provider: 'codex',
      sessionId: 'session-1624',
      verifiedAt: '2026-09-15T06:13:55.000Z',
      ...overrides,
    }),
  };
}

function currentDelivery(overrides = {}) {
  const intent = buildDeliveryIntent({
    intentId: INTENT_ID,
    supersedesIntentId: null,
    issueNumber: ISSUE,
    repository: REPOSITORY,
    prNumber: 1640,
    baseRef: 'trunk',
    headRef: 'feature/epic/1624',
    expectedHeadSha: ACCEPTED_SHA,
    mergeMethod: 'merge',
    attributionTokens: ['#1624'],
    commitTitle: '[#1624] Deliver preserved workflow exceptions',
    commitMessage: `PR #1640\nRecovery #1635\nSource: ${ACCEPTED_SHA}\n\nAttribution: [#1624]`,
    provider: 'codex',
    sessionId: 'session-1624-recovery',
    clientCreatedAt: '2026-09-15T16:30:00.000Z',
  });
  const receipt = buildDeliveryReceipt({
    intentId: INTENT_ID,
    issueNumber: ISSUE,
    prNumber: 1640,
    expectedHeadSha: ACCEPTED_SHA,
    mergeCommitSha: MERGE_SHA,
    baseRef: 'trunk',
    mergeMethod: 'merge',
    verifiedTrunkRef: 'origin/trunk',
    provider: 'codex',
    sessionId: 'session-1624-recovery',
    verifiedAt: '2026-09-15T16:45:00.000Z',
  });
  return {
    pullRequest: {
      number: 1640,
      state: 'MERGED',
      merged: true,
      headRefName: 'feature/epic/1624',
      baseRefName: 'trunk',
      headRefOid: ACCEPTED_SHA,
      mergeCommitSha: MERGE_SHA,
    },
    intent,
    receipt,
    testReceiptSha: ACCEPTED_SHA,
    reviewApprovedSha: ACCEPTED_SHA,
    verifiedDelivery: {
      intentId: INTENT_ID,
      issueNumber: ISSUE,
      prNumber: 1640,
      expectedHeadSha: ACCEPTED_SHA,
      mergeCommitSha: MERGE_SHA,
    },
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    repository: REPOSITORY,
    issueNumber: ISSUE,
    auditIssueNumber: AUDIT_ISSUE,
    recoveryIssueNumber: RECOVERY_ISSUE,
    actor: 'kburson',
    currentReviewAuthority: 'human-gate',
    oldTransaction: oldTransaction(),
    historicalNoCommit: noCommitRecord(),
    currentDelivery: currentDelivery(),
    audit: {
      issueNumber: AUDIT_ISSUE,
      state: 'CLOSED',
      disposition: 'Delivered',
      deliverableUrl: AUDIT_URL,
      finding: {
        issueNumber: ISSUE,
        acceptedSha: ACCEPTED_SHA,
        classification: 'false-Done',
        recoveryIssueNumber: RECOVERY_ISSUE,
      },
    },
    recovery: {
      issueNumber: RECOVERY_ISSUE,
      state: 'OPEN',
      boardState: 'develop',
      assignees: ['kburson'],
      marker: { auditIssueNumber: AUDIT_ISSUE, issueNumber: ISSUE },
    },
    live: {
      boardState: 'review',
      issueClosed: false,
      stateReason: 'reopened',
      terminalDisposition: 'Delivered',
      dirty: false,
      bindingOwnership: { authorized: true, disposition: 'own-post-close-claim' },
    },
    ...overrides,
  };
}

function bodyWith(transaction) {
  const completed = JSON.stringify(transaction.completedSteps).replaceAll('"', '&quot;');
  return [
    'issue body',
    '',
    `<!-- aitm-delivered-close schema="${transaction.schema}" tx="${transaction.transactionId}" issue="${transaction.issueNumber}" accepted-sha="${transaction.acceptedSha}" review-authority="${transaction.reviewAuthority}" completed="${completed}" -->`,
    '',
  ].join('\n');
}

test('authorizes only the audited same-SHA false-delivery shape', () => {
  const authorization = authorizeFalseDeliveryCloseRestart(input());
  assert.equal(authorization.reason, FALSE_DELIVERY_CLOSE_RECOVERY_REASON);
  assert.equal(authorization.oldTransaction.acceptedSha, ACCEPTED_SHA);
  assert.equal(authorization.currentDelivery.receipt.intentId, INTENT_ID);
  assert.equal(Object.isFrozen(authorization), true);
});

test('refuses alternate recovery categories and contradictory authority', () => {
  const base = input();
  const cases = [
    [{ oldTransaction: oldTransaction({ completedSteps: ['timing'] }) }, /old-transaction/],
    [
      {
        currentDelivery: currentDelivery({
          testReceiptSha: 'c'.repeat(40),
        }),
      },
      /current-evidence/,
    ],
    [
      {
        currentDelivery: currentDelivery({
          pullRequest: { ...base.currentDelivery.pullRequest, headRefOid: 'c'.repeat(40) },
        }),
      },
      /current-evidence/,
    ],
    [{ historicalNoCommit: null }, /historical-no-commit/],
    [{ currentReviewAuthority: 'gate-bypassed' }, /input/],
    [
      {
        audit: {
          ...base.audit,
          finding: { ...base.audit.finding, classification: 'verified' },
        },
      },
      /audit-authority/,
    ],
    [
      {
        recovery: {
          ...base.recovery,
          marker: { auditIssueNumber: AUDIT_ISSUE, issueNumber: 1625 },
        },
      },
      /recovery-authority/,
    ],
    [{ live: { ...base.live, stateReason: null } }, /live-terminal-state/],
    [{ live: { ...base.live, dirty: true } }, /live-terminal-state/],
    [
      {
        live: {
          ...base.live,
          bindingOwnership: { authorized: false, disposition: 'foreign-claim' },
        },
      },
      /live-terminal-state/,
    ],
  ];
  for (const [override, expected] of cases) {
    assert.throws(() => authorizeFalseDeliveryCloseRestart({ ...base, ...override }), expected);
  }
});

test('writes a canonical durable record and rejects quoted or cross-issue evidence', () => {
  const authorization = authorizeFalseDeliveryCloseRestart(input());
  const record = createFalseDeliveryCloseRecoveryRecord(authorization, {
    now: NOW,
    randomUUIDFn: () => REPLACEMENT_TRANSACTION_ID,
  });
  assert.equal(record.schema, FALSE_DELIVERY_CLOSE_RECOVERY_SCHEMA);
  assert.equal(record.acceptedSha, ACCEPTED_SHA);
  const rendered = renderFalseDeliveryCloseRecoveryComment(record);
  const comment = {
    id: '900',
    body: rendered,
    issue_url: `https://api.github.com/repos/${REPOSITORY}/issues/${ISSUE}`,
  };
  const parsed = parseFalseDeliveryCloseRecoveryComment(comment, {
    repository: REPOSITORY,
    issueNumber: ISSUE,
  });
  assert.equal(parsed.record.recoveryId, record.recoveryId);
  assert.throws(
    () =>
      parseFalseDeliveryCloseRecoveryComment(
        { ...comment, issue_url: `https://api.github.com/repos/${REPOSITORY}/issues/1625` },
        { repository: REPOSITORY, issueNumber: ISSUE }
      ),
    /malformed-comment/
  );
  assert.throws(
    () =>
      parseFalseDeliveryCloseRecoveryComment(
        { ...comment, body: `quoted: ${rendered}` },
        { repository: REPOSITORY, issueNumber: ISSUE }
      ),
    /malformed-comment/
  );
});

test('reuses durable identity before replacing the completed transaction', () => {
  const authorization = authorizeFalseDeliveryCloseRestart(input());
  const record = createFalseDeliveryCloseRecoveryRecord(authorization, {
    now: NOW,
    randomUUIDFn: () => REPLACEMENT_TRANSACTION_ID,
  });
  const comment = {
    id: '900',
    body: renderFalseDeliveryCloseRecoveryComment(record),
    issue_url: `https://api.github.com/repos/${REPOSITORY}/issues/${ISSUE}`,
  };
  const resolved = resolveFalseDeliveryCloseRecovery({
    authorization,
    comments: [comment],
    record,
  });
  assert.equal(resolved.status, 'present');
  assert.equal(resolved.record.replacementTransactionId, REPLACEMENT_TRANSACTION_ID);

  const originalBody = bodyWith(oldTransaction());
  const replacement = replaceFalseDeliveredCloseTransaction(
    originalBody,
    authorization,
    resolved.record
  );
  assert.equal(replacement.status, 'replaced');
  assert.equal(replacement.transaction.acceptedSha, ACCEPTED_SHA);
  assert.deepEqual(replacement.transaction.completedSteps, []);
  assert.equal(
    classifyFalseDeliveryRecoveryProgress(replacement.body, authorization, record).phase,
    'body-replaced'
  );
  assert.deepEqual(
    oldFalseDeliveryTransactionFromRecord(record).completedSteps,
    TERMINAL_CLOSE_STEPS
  );
});

test('refuses duplicate durable evidence and stale body replacement', () => {
  const authorization = authorizeFalseDeliveryCloseRestart(input());
  const record = createFalseDeliveryCloseRecoveryRecord(authorization, {
    now: NOW,
    randomUUIDFn: () => REPLACEMENT_TRANSACTION_ID,
  });
  const comment = {
    id: '900',
    body: renderFalseDeliveryCloseRecoveryComment(record),
    issue_url: `https://api.github.com/repos/${REPOSITORY}/issues/${ISSUE}`,
  };
  assert.throws(
    () =>
      resolveFalseDeliveryCloseRecovery({
        authorization,
        comments: [comment, { ...comment, id: '901' }],
        record,
      }),
    /ambiguous-evidence/
  );
  assert.throws(
    () =>
      replaceFalseDeliveredCloseTransaction(
        bodyWith(oldTransaction({ transactionId: 'foreign' })),
        authorization,
        record
      ),
    FalseDeliveryCloseRecoveryError
  );
});

test('finds a durable recovery-backed replacement at any valid saga prefix', () => {
  const authorization = authorizeFalseDeliveryCloseRestart(input());
  const record = createFalseDeliveryCloseRecoveryRecord(authorization, {
    now: NOW,
    randomUUIDFn: () => REPLACEMENT_TRANSACTION_ID,
  });
  const comment = {
    id: '900',
    body: renderFalseDeliveryCloseRecoveryComment(record),
    issue_url: `https://api.github.com/repos/${REPOSITORY}/issues/${ISSUE}`,
  };
  const replacement = replaceFalseDeliveredCloseTransaction(
    bodyWith(oldTransaction()),
    authorization,
    record
  ).transaction;
  const body = bodyWith({ ...replacement, completedSteps: ['timing', 'estimation'] });

  const found = findFalseDeliveryRecoveryBackedReplacement({
    body,
    comments: [comment],
    repository: REPOSITORY,
    issueNumber: ISSUE,
  });
  assert.equal(found.status, 'found');
  assert.equal(found.record.recoveryId, record.recoveryId);
  assert.deepEqual(found.transaction.completedSteps, ['timing', 'estimation']);

  assert.equal(
    findFalseDeliveryRecoveryBackedReplacement({
      body,
      comments: [],
      repository: REPOSITORY,
      issueNumber: ISSUE,
    }).status,
    'none'
  );
  assert.equal(
    findFalseDeliveryRecoveryBackedReplacement({
      body,
      comments: [comment, { ...comment, id: '901' }],
      repository: REPOSITORY,
      issueNumber: ISSUE,
    }).status,
    'ambiguous'
  );
});
