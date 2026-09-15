#!/usr/bin/env node
// @story #1635

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  readDeliveredCloseTransactions,
  TERMINAL_CLOSE_STEPS,
} from '../../../../task-tracker/lib/close-convergence.mjs';
import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
  renderDeliveryIntentComment,
  renderDeliveryReceiptComment,
} from '../../../../task-tracker/lib/delivery-records.mjs';
import {
  buildNoCommitDeliveryRecord,
  renderNoCommitDeliveryComment,
} from '../../../../task-tracker/lib/no-commit-delivery-record.mjs';
import {
  parseFalseDeliveryCloseRecoveryArgs,
  permitsReopenedOutcomeCorrection,
  readFalseDeliveryAuditAuthority,
  readFalseDeliveryRecoveryAuthority,
  resolveFalseDeliveryActor,
  runFalseDeliveryCloseRecovery,
} from '../../../../task-tracker/verbs/close.mjs';
import { closeBody, runClose } from '../../../helpers/close-convergence-wiring-helpers.mjs';

const REPOSITORY = 'kburson/ai-task-manager';
const ISSUE = 1624;
const ACCEPTED_SHA = 'a'.repeat(40);
const MERGE_SHA = 'b'.repeat(40);
const INTENT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const OLD_TRANSACTION_ID = 'old-close-transaction';
const NEW_TRANSACTION_ID = 'replacement-close-transaction';

test('production authority readers verify the owned audit report and live recovery issue', async () => {
  const auditComment = {
    id: 5682743221,
    html_url: 'https://github.com/kburson/ai-task-manager/issues/1633#issuecomment-5682743221',
    user: { login: 'kburson' },
    body: [
      'The survey is committed at `0ce7a852` in `docs/audits/survey.md`.',
      '<!-- aitm-owned-comment key="audit.deliverable-v1" -->',
    ].join('\n'),
  };
  const report = [
    '| Issue | Done | Accepted SHA | Source | PR | Target | Method | Merge | Trunk | Classification | Recovery | Notes |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
    `| [#${ISSUE}](https://github.com/kburson/ai-task-manager/issues/${ISSUE}) title | now | \`${ACCEPTED_SHA}\` | branch | none | not-recorded | not-recorded | none | none | **false-Done** | [#1635](https://github.com/kburson/ai-task-manager/issues/1635) | absent |`,
  ].join('\n');
  const pexec = async (command, args) => {
    if (command === 'gh' && args[0] === 'issue') {
      return {
        stdout: JSON.stringify({
          state: 'CLOSED',
          body: '<!-- aitm-deliverable-posted url="https://github.com/kburson/ai-task-manager/issues/1633#issuecomment-5682743221" -->',
        }),
      };
    }
    if (command === 'gh' && args[0] === 'api') {
      return { stdout: JSON.stringify(auditComment) };
    }
    if (command === 'git' && args[0] === 'rev-parse') {
      return { stdout: `${'c'.repeat(40)}\n` };
    }
    if (command === 'git' && args[0] === 'merge-base') return { stdout: '' };
    if (command === 'git' && args[0] === 'show') return { stdout: report };
    throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
  };
  const audit = await readFalseDeliveryAuditAuthority({
    cfg: { repo: REPOSITORY, trunkRef: 'trunk' },
    pexec,
    dispositionReader: async () => 'Delivered',
    auditIssueNumber: 1633,
    recoveryIssueNumber: 1635,
    issueNumber: ISSUE,
    acceptedSha: ACCEPTED_SHA,
    actor: 'kburson',
  });
  assert.equal(audit.finding.classification, 'false-Done');
  assert.equal(audit.finding.recoveryIssueNumber, 1635);

  const recovery = await readFalseDeliveryRecoveryAuthority({
    cfg: { repo: REPOSITORY },
    pexec: async () => ({
      stdout: JSON.stringify({
        state: 'OPEN',
        assignees: [{ login: 'kburson' }],
        body: '<!-- aitm-delivery-audit-recovery audit="1633" issue="1624" -->',
      }),
    }),
    boardStateReader: async () => 'develop',
    recoveryIssueNumber: 1635,
    auditIssueNumber: 1633,
    issueNumber: ISSUE,
  });
  assert.equal(recovery.boardState, 'develop');
  assert.deepEqual(recovery.marker, { auditIssueNumber: 1633, issueNumber: ISSUE });
});

test('production actor resolution dereferences @me through GitHub', async () => {
  assert.equal(
    await resolveFalseDeliveryActor({
      cfg: { assignee: '@me' },
      pexec: async () => ({ stdout: 'kburson\n' }),
    }),
    'kburson'
  );
  assert.equal(
    await resolveFalseDeliveryActor({ cfg: { assignee: 'maintainer' }, pexec: async () => null }),
    'maintainer'
  );
});

function transaction() {
  return {
    schema: 'aitm.delivered-close/v1',
    transactionId: OLD_TRANSACTION_ID,
    issueNumber: ISSUE,
    acceptedSha: ACCEPTED_SHA,
    reviewAuthority: 'gate-bypassed',
    completedSteps: [...TERMINAL_CLOSE_STEPS],
  };
}

function bodyWith(value) {
  const completed = JSON.stringify(value.completedSteps).replaceAll('"', '&quot;');
  return `issue body\n\n<!-- aitm-delivered-close schema="${value.schema}" tx="${value.transactionId}" issue="${value.issueNumber}" accepted-sha="${value.acceptedSha}" review-authority="${value.reviewAuthority}" completed="${completed}" -->\n`;
}

function delivery() {
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
    commitMessage: `PR #1640\nSource: ${ACCEPTED_SHA}\n\nAttribution: [#1624]`,
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
    intent,
    receipt,
    pullRequest: {
      number: 1640,
      state: 'MERGED',
      merged: true,
      headRefName: 'feature/epic/1624',
      baseRefName: 'trunk',
      headRefOid: ACCEPTED_SHA,
      mergeCommitSha: MERGE_SHA,
    },
  };
}

function harness(overrides = {}) {
  const pair = delivery();
  const noCommit = buildNoCommitDeliveryRecord({
    recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
    repository: REPOSITORY,
    issueNumber: ISSUE,
    issueKind: 'epic',
    deliverableUrl:
      'https://github.com/kburson/ai-task-manager/issues/1624#issuecomment-5675442778',
    acceptedSha: ACCEPTED_SHA,
    provider: 'codex',
    sessionId: 'session-1624',
    verifiedAt: '2026-09-15T06:13:55.000Z',
  });
  let recoveryComments = [];
  const calls = { order: [], created: [], mutations: [] };
  const gate = {
    gateInput: {
      acceptedSha: ACCEPTED_SHA,
      pullRequests: [pair.pullRequest],
    },
    testReceiptSha: ACCEPTED_SHA,
    recoveryReviewApprovedSha: ACCEPTED_SHA,
    receipt: {
      verification: {
        receiptInput: {
          intentId: INTENT_ID,
          issueNumber: ISSUE,
          prNumber: 1640,
          expectedHeadSha: ACCEPTED_SHA,
          mergeCommitSha: MERGE_SHA,
        },
      },
    },
  };
  const args = {
    closeIssueNum: String(ISSUE),
    auditIssueNumber: 1633,
    recoveryIssueNumber: 1635,
    convergeBody: bodyWith(transaction()),
    ensureDeliveryAuthorized: async () => gate,
    resolvedDeliveryGateRef: () => gate,
    terminalReviewAuthority: () => 'human-gate',
    dispositionReader: async () => 'Delivered',
    inspectDirty: async () => ({ dirty: false }),
    resolveWorkspaceForIssue: () => '/worktrees/1624',
    projectDir: '/worktrees/1624',
    cfg: { repo: REPOSITORY, assignee: '@me' },
    ctx: {
      falseDeliveryActor: 'kburson',
      falseDeliveryNow: () => '2026-09-15T17:00:00.000Z',
      randomUUIDFn: () => NEW_TRANSACTION_ID,
      listFalseDeliveryTargetComments: async () => [
        {
          id: 1,
          created_at: '2026-09-15T06:13:55Z',
          body: renderNoCommitDeliveryComment(noCommit),
        },
        {
          id: 2,
          created_at: '2026-09-15T16:30:01Z',
          body: renderDeliveryIntentComment(pair.intent),
        },
        {
          id: 3,
          created_at: '2026-09-15T16:45:01Z',
          body: renderDeliveryReceiptComment(pair.receipt),
        },
      ],
      readFalseDeliveryAudit: async () => ({
        issueNumber: 1633,
        state: 'CLOSED',
        disposition: 'Delivered',
        deliverableUrl:
          'https://github.com/kburson/ai-task-manager/issues/1633#issuecomment-5682743221',
        finding: {
          issueNumber: ISSUE,
          acceptedSha: ACCEPTED_SHA,
          classification: 'false-Done',
          recoveryIssueNumber: 1635,
        },
      }),
      readFalseDeliveryRecovery: async () => ({
        issueNumber: 1635,
        state: 'OPEN',
        boardState: 'develop',
        assignees: ['kburson'],
        marker: { auditIssueNumber: 1633, issueNumber: ISSUE },
      }),
      listFalseDeliveryRecoveryComments: async () => recoveryComments,
      createFalseDeliveryRecoveryComment: async (commentBody) => {
        calls.order.push('comment');
        calls.created.push(commentBody);
        recoveryComments = [
          {
            id: 900,
            body: commentBody,
            issue_url: `https://api.github.com/repos/${REPOSITORY}/issues/${ISSUE}`,
          },
        ];
      },
      ...overrides.ctx,
    },
    mutateBody: async ({ mutate }) => {
      calls.order.push('body');
      const body = mutate(args.convergeBody);
      calls.mutations.push(body);
      return { status: 'ok', body };
    },
    closeSnapshot: { issueClosed: false, stateReason: 'reopened' },
    boardState: 'review',
    resolveBindingOwnership: () => ({
      authorized: true,
      disposition: 'own-post-close-claim',
    }),
    ...overrides.args,
  };
  return { args, calls };
}

test('sources audited no-commit and current delivery evidence before body replacement', async () => {
  const { args, calls } = harness();
  const result = await runFalseDeliveryCloseRecovery(args);
  assert.deepEqual(calls.order, ['comment', 'body']);
  assert.equal(calls.created.length, 1);
  assert.match(calls.created[0], /aitm-false-delivery-close-recovery/);
  assert.equal(result.transaction.acceptedSha, ACCEPTED_SHA);
  assert.deepEqual(result.transaction.completedSteps, []);
  assert.equal(readDeliveredCloseTransactions(result.body)[0].transactionId, NEW_TRANSACTION_ID);
});

test('refuses when gate-resolved test authority differs from the accepted transaction', async () => {
  const { args, calls } = harness();
  const originalGate = args.resolvedDeliveryGateRef();
  args.resolvedDeliveryGateRef = () => ({
    ...originalGate,
    testReceiptSha: 'c'.repeat(40),
  });
  await assert.rejects(runFalseDeliveryCloseRecovery(args), /current-evidence/);
  assert.deepEqual(calls.order, []);
});

test('reuses a durable correction record after interruption without a second comment', async () => {
  const first = harness();
  const recovered = await runFalseDeliveryCloseRecovery(first.args);
  const durableComment = {
    id: 900,
    body: first.calls.created[0],
    issue_url: `https://api.github.com/repos/${REPOSITORY}/issues/${ISSUE}`,
  };
  const second = harness({
    args: { convergeBody: recovered.body },
    ctx: { listFalseDeliveryRecoveryComments: async () => [durableComment] },
  });
  const retried = await runFalseDeliveryCloseRecovery(second.args);
  assert.deepEqual(second.calls.created, []);
  assert.deepEqual(second.calls.mutations, []);
  assert.equal(retried.transaction.transactionId, NEW_TRANSACTION_ID);
});

test('resumes the durable replacement after board and issue transitions', async () => {
  const first = harness();
  const recovered = await runFalseDeliveryCloseRecovery(first.args);
  const durableComment = {
    id: 900,
    body: first.calls.created[0],
    issue_url: `https://api.github.com/repos/${REPOSITORY}/issues/${ISSUE}`,
  };
  for (const progress of [
    {
      steps: ['timing', 'estimation', 'lifecycle', 'board'],
      boardState: 'done',
      closeSnapshot: { issueClosed: false, stateReason: 'reopened' },
    },
    {
      steps: ['timing', 'estimation', 'lifecycle', 'board', 'disposition', 'issue'],
      boardState: 'done',
      closeSnapshot: { issueClosed: true, stateReason: 'completed' },
    },
  ]) {
    const replacementBody = bodyWith({
      ...recovered.transaction,
      completedSteps: progress.steps,
    });
    const retry = harness({
      args: {
        convergeBody: replacementBody,
        boardState: progress.boardState,
        closeSnapshot: progress.closeSnapshot,
      },
      ctx: { listFalseDeliveryRecoveryComments: async () => [durableComment] },
    });
    const result = await runFalseDeliveryCloseRecovery(retry.args);
    assert.deepEqual(result.transaction.completedSteps, progress.steps);
    assert.deepEqual(retry.calls.created, []);
    assert.deepEqual(retry.calls.mutations, []);
  }
});

test('a completed correction retry is idempotent after binding ownership is gone', async () => {
  const first = harness();
  const recovered = await runFalseDeliveryCloseRecovery(first.args);
  const durableComment = {
    id: 900,
    body: first.calls.created[0],
    issue_url: `https://api.github.com/repos/${REPOSITORY}/issues/${ISSUE}`,
  };
  const retry = harness({
    args: {
      convergeBody: bodyWith({
        ...recovered.transaction,
        completedSteps: [...TERMINAL_CLOSE_STEPS],
      }),
      boardState: 'done',
      closeSnapshot: { issueClosed: true, stateReason: 'completed' },
      resolveBindingOwnership: () => ({ authorized: false, disposition: 'no-claim' }),
      inspectDirty: async () => ({ dirty: true }),
    },
    ctx: { listFalseDeliveryRecoveryComments: async () => [durableComment] },
  });
  const result = await runFalseDeliveryCloseRecovery(retry.args);
  assert.deepEqual(result.transaction.completedSteps, TERMINAL_CLOSE_STEPS);
  assert.deepEqual(retry.calls.created, []);
  assert.deepEqual(retry.calls.mutations, []);
});

test('requires the complete false-delivery flag group and rejects incompatible close modes', () => {
  assert.deepEqual(
    parseFalseDeliveryCloseRecoveryArgs([
      '#1624',
      '--restart-false-delivery-transaction',
      '--audit-issue',
      '1633',
      '--recovery-issue',
      '1635',
    ]),
    { enabled: true, auditIssueNumber: 1633, recoveryIssueNumber: 1635 }
  );
  assert.deepEqual(parseFalseDeliveryCloseRecoveryArgs(['#1624']), {
    enabled: false,
    auditIssueNumber: null,
    recoveryIssueNumber: null,
  });
  for (const rest of [
    ['#1624', '--restart-false-delivery-transaction'],
    ['#1624', '--restart-false-delivery-transaction', '--audit-issue', '1633'],
    [
      '#1624',
      '--restart-false-delivery-transaction',
      '--audit-issue',
      '1633',
      '--recovery-issue',
      '1635',
      '--force',
    ],
    [
      '#1624',
      '--restart-false-delivery-transaction',
      '--audit-issue',
      '1633',
      '--recovery-issue',
      '1635',
      '--restart-reopened-transaction',
    ],
  ]) {
    assert.throws(
      () => parseFalseDeliveryCloseRecoveryArgs(rest),
      /false-delivery-close-recovery:incompatible-flags/
    );
  }
});

test('the close verb replaces the audited transaction and resumes the unchanged saga', async () => {
  const pair = delivery();
  const noCommit = buildNoCommitDeliveryRecord({
    recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
    repository: REPOSITORY,
    issueNumber: ISSUE,
    issueKind: 'epic',
    deliverableUrl:
      'https://github.com/kburson/ai-task-manager/issues/1624#issuecomment-5675442778',
    acceptedSha: ACCEPTED_SHA,
    provider: 'codex',
    sessionId: 'session-1624',
    verifiedAt: '2026-09-15T06:13:55.000Z',
  });
  const receiptData = Buffer.from(
    JSON.stringify({ stage: 'test', commitSha: ACCEPTED_SHA })
  ).toString('base64url');
  const body = `${closeBody()}
${bodyWith(transaction())}
<!-- aitm-verification-receipt stage="test" data="${receiptData}" -->
<!-- aitm-review-approved ts="2026-09-15T16:40:00Z" approved-sha="${ACCEPTED_SHA}" -->`;
  const targetComments = [
    {
      id: 1,
      created_at: '2026-09-15T06:13:55Z',
      body: renderNoCommitDeliveryComment(noCommit),
    },
    {
      id: 2,
      created_at: '2026-09-15T16:30:01Z',
      body: renderDeliveryIntentComment(pair.intent),
    },
    {
      id: 3,
      created_at: '2026-09-15T16:45:01Z',
      body: renderDeliveryReceiptComment(pair.receipt),
    },
  ];
  let recoveryComments = [];
  const recoveryWrites = [];

  const closeArgs = {
    issueNumber: ISSUE,
    repository: REPOSITORY,
    boardState: 'review',
    closeSnapshot: { issueClosed: false, stateReason: 'reopened' },
    body,
    acceptedSha: ACCEPTED_SHA,
    terminalDisposition: 'Delivered',
    bindingReleaseStatus: 'conflict',
    gateReviewToDone: false,
    extraRest: [
      '--restart-false-delivery-transaction',
      '--audit-issue',
      '1633',
      '--recovery-issue',
      '1635',
    ],
    deliveryGateInput: {
      issueNumber: ISSUE,
      lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
      branch: 'feature/epic/1624',
      acceptedSha: ACCEPTED_SHA,
      localHeadSha: ACCEPTED_SHA,
      pullRequests: [pair.pullRequest],
      records: null,
    },
    contextOverrides: {
      falseDeliveryActor: 'kburson',
      falseDeliveryNow: () => '2026-09-15T17:00:00.000Z',
      listFalseDeliveryTargetComments: async () => targetComments,
      listFalseDeliveryRecoveryComments: async () => recoveryComments,
      createFalseDeliveryRecoveryComment: async (commentBody) => {
        recoveryWrites.push(commentBody);
        recoveryComments = [
          {
            id: 900,
            body: commentBody,
            issue_url: `https://api.github.com/repos/${REPOSITORY}/issues/${ISSUE}`,
          },
        ];
      },
      readFalseDeliveryAudit: async () => ({
        issueNumber: 1633,
        state: 'CLOSED',
        disposition: 'Delivered',
        deliverableUrl:
          'https://github.com/kburson/ai-task-manager/issues/1633#issuecomment-5682743221',
        finding: {
          issueNumber: ISSUE,
          acceptedSha: ACCEPTED_SHA,
          classification: 'false-Done',
          recoveryIssueNumber: 1635,
        },
      }),
      readFalseDeliveryRecovery: async () => ({
        issueNumber: 1635,
        state: 'OPEN',
        boardState: 'develop',
        assignees: ['kburson'],
        marker: { auditIssueNumber: 1633, issueNumber: ISSUE },
      }),
      verifyCloseDeliveryReceipt: async ({ gateInput, receiptGate }) => ({
        skipped: false,
        receipt: receiptGate.receipt,
        gateInput,
        verification: {
          receiptInput: {
            intentId: INTENT_ID,
            issueNumber: ISSUE,
            prNumber: 1640,
            expectedHeadSha: ACCEPTED_SHA,
            mergeCommitSha: MERGE_SHA,
          },
        },
      }),
    },
  };
  const run = await runClose(closeArgs);

  assert.equal(run.exitCode, 0);
  assert.equal(recoveryWrites.length, 1);
  assert.match(recoveryWrites[0], /aitm-false-delivery-close-recovery/);
  const completed = readDeliveredCloseTransactions(run.body)[0];
  assert.equal(completed.transactionId, NEW_TRANSACTION_ID);
  assert.deepEqual(completed.completedSteps, TERMINAL_CLOSE_STEPS);
  assert.equal(run.calls.bindingReleases, 1);

  const retried = await runClose({
    ...closeArgs,
    boardState: 'done',
    closeSnapshot: { issueClosed: true, stateReason: 'completed' },
    body: run.body,
    bindingReleaseStatus: 'released',
  });
  assert.equal(retried.exitCode, 0);
  assert.equal(recoveryWrites.length, 1, 'completed retry writes no second recovery record');
  assert.deepEqual(readDeliveredCloseTransactions(retried.body)[0], completed);
});

test('false-delivery evidence permits outcome correction only for its replacement', async () => {
  const { args } = harness();
  const recovered = await runFalseDeliveryCloseRecovery(args);
  assert.equal(
    permitsReopenedOutcomeCorrection({
      recoveryRecord: recovered.record,
      transaction: recovered.transaction,
    }),
    true
  );
  assert.equal(
    permitsReopenedOutcomeCorrection({
      recoveryRecord: recovered.record,
      transaction: { ...recovered.transaction, transactionId: 'other' },
    }),
    false
  );
});
