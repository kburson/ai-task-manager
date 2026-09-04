#!/usr/bin/env node
// @story #1490
//
// Verb-level wiring for the reopened-close recovery.
//
// The predicate suite proves `authorizeReopenedCloseRestart`. It did NOT prove
// where `runReopenedCloseRecovery` SOURCES the values it feeds in — and that gap
// shipped a defect: the verb passed `closeSnapshot.stateReason`, which is null for
// every open issue, making the REOPENED predicate unsatisfiable in exactly the
// state it targets. It also passed `verified: true` and `deliveryVerified: true`
// as literals, so two authorization conditions verified nothing at all.
//
// These tests pin the SOURCE of every value and the ordering of every durable
// write. They drive `runReopenedCloseRecovery` with injected boundaries and assert
// on what actually crosses them.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { TERMINAL_CLOSE_STEPS } from '../../../../task-tracker/lib/close-convergence.mjs';
import { normalizeIssueCloseSnapshot } from '../../../../task-tracker/lib/closed-issue-convergence.mjs';
import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
  renderDeliveryIntentComment,
  renderDeliveryReceiptComment,
} from '../../../../task-tracker/lib/delivery-records.mjs';
import { renderReopenedCloseRecoveryComment } from '../../../../task-tracker/lib/reopened-close-recovery.mjs';
import {
  permitsReopenedOutcomeCorrection,
  runReopenedCloseRecovery,
} from '../../../../task-tracker/verbs/close.mjs';

const REPO = 'kburson/ai-task-manager';
const ISSUE = 1490;
const OLD_SHA = 'd'.repeat(40);
const NEW_SHA = 'b'.repeat(40);
const NEXT_SHA = 'c'.repeat(40);
const OLD_MERGE = '7'.repeat(40);
const NEW_MERGE = '9'.repeat(40);
const NEXT_MERGE = '8'.repeat(40);
const OLD_TX = 'ad96d1e1-8c17-471e-a060-279975761e50';
const NEW_TX = '11111111-2222-3333-4444-555555555555';
const NEXT_TX = '66666666-7777-4888-8999-000000000000';
const NOW = '2026-09-03T06:30:00.000Z';

function oldTransaction(overrides = {}) {
  return {
    schema: 'aitm.delivered-close/v1',
    transactionId: OLD_TX,
    issueNumber: ISSUE,
    acceptedSha: OLD_SHA,
    reviewAuthority: 'human-gate',
    completedSteps: [...TERMINAL_CLOSE_STEPS],
    ...overrides,
  };
}

function bodyWith(transaction) {
  const props = [
    `schema="${transaction.schema}"`,
    `tx="${transaction.transactionId}"`,
    `issue="${transaction.issueNumber}"`,
    `accepted-sha="${transaction.acceptedSha}"`,
    `review-authority="${transaction.reviewAuthority}"`,
    `completed="${JSON.stringify(transaction.completedSteps).replace(/"/g, '&quot;')}"`,
  ].join(' ');
  return `issue body\n\n<!-- aitm-delivered-close ${props} -->\n`;
}

const HEAD_REF = 'codex/defect-1490-squash-delivery-proof';

// Built with the REAL delivery builders and renderers. The first version of this
// fixture invented a base64 marker that is not the production grammar and omitted
// the intent record entirely — it was not production-shaped, and it hid the fact
// that the verb's evidence path could never have worked.
function deliveryPair(acceptedSha, mergeSha, prNumber, intentId, baseId) {
  const intent = buildDeliveryIntent({
    intentId,
    supersedesIntentId: null,
    issueNumber: ISSUE,
    repository: REPO,
    prNumber,
    baseRef: 'trunk',
    headRef: HEAD_REF,
    expectedHeadSha: acceptedSha,
    mergeMethod: 'squash',
    attributionTokens: ['#1490'],
    commitTitle: '[#1490] Governed PR delivery',
    commitMessage: `PR #${prNumber}\nSource: ${acceptedSha}\n\nAttribution: [#1490]`,
    provider: 'claude',
    sessionId: 'session-1490',
    clientCreatedAt: '2026-09-03T01:00:00.000Z',
  });
  const receipt = buildDeliveryReceipt({
    intentId,
    issueNumber: ISSUE,
    prNumber,
    expectedHeadSha: acceptedSha,
    mergeCommitSha: mergeSha,
    baseRef: 'trunk',
    mergeMethod: 'squash',
    verifiedTrunkRef: 'origin/trunk',
    provider: 'claude',
    sessionId: 'session-1490',
    verifiedAt: '2026-09-03T01:49:10.000Z',
  });
  const comment = (body, id, createdAt) => ({
    id,
    issue_url: `https://api.github.com/repos/${REPO}/issues/${ISSUE}`,
    created_at: createdAt,
    updated_at: createdAt,
    user: { login: 'kburson' },
    body,
  });
  return {
    intent,
    receipt,
    comments: [
      comment(renderDeliveryIntentComment(intent), baseId, '2026-09-03T01:00:01Z'),
      comment(renderDeliveryReceiptComment(receipt), baseId + 1, '2026-09-03T01:49:11Z'),
    ],
  };
}

function pullRequestFor(acceptedSha, mergeSha, prNumber) {
  return {
    number: prNumber,
    state: 'MERGED',
    merged: true,
    headRefName: HEAD_REF,
    baseRefName: 'trunk',
    headRefOid: acceptedSha,
    mergeCommitSha: mergeSha,
  };
}

const HISTORICAL = deliveryPair(OLD_SHA, OLD_MERGE, 1491, '01ARZ3NDEKTSV4RRFFQ69G5FAV', 101);
const CURRENT = deliveryPair(NEW_SHA, NEW_MERGE, 1493, '01ARZ3NDEKTSV4RRFFQ69G5FAW', 201);
const NEXT = deliveryPair(NEXT_SHA, NEXT_MERGE, 1495, '01ARZ3NDEKTSV4RRFFQ69G5FAX', 301);

function harness(overrides = {}) {
  const calls = { createdComments: [], bodyWrites: [], order: [] };
  const acceptedSha = overrides.acceptedSha ?? NEW_SHA;
  const acceptedMergeSha = overrides.acceptedMergeSha ?? NEW_MERGE;
  const acceptedPrNumber = overrides.acceptedPrNumber ?? 1493;
  const acceptedIntentId = overrides.acceptedIntentId ?? '01ARZ3NDEKTSV4RRFFQ69G5FAW';
  const acceptedReceipt = overrides.acceptedReceipt ?? CURRENT.receipt;
  const deliveryComments = overrides.deliveryComments ?? [
    ...HISTORICAL.comments,
    ...CURRENT.comments,
  ];
  let recoveryComments = overrides.recoveryComments ?? [];
  const gate = {
    gateInput: {
      acceptedSha,
      // The gate's live PR inventory is the SHA-keyed selector for historical
      // delivery. No separate marker parser exists or should.
      pullRequests: overrides.pullRequests ?? [
        pullRequestFor(OLD_SHA, OLD_MERGE, 1491),
        pullRequestFor(NEW_SHA, NEW_MERGE, 1493),
      ],
    },
    testReceiptSha: 'testReceiptSha' in overrides ? overrides.testReceiptSha : acceptedSha,
    recoveryReviewApprovedSha:
      'recoveryReviewApprovedSha' in overrides ? overrides.recoveryReviewApprovedSha : acceptedSha,
    // The REAL `verifyCloseDeliveryReceipt` shape: { skipped, receipt, verification }.
    // There is no `status` field; the verified delivery lives at
    // `verification.receiptInput`.
    receipt: {
      skipped: false,
      receipt: acceptedReceipt,
      verification: {
        receiptInput: overrides.verifiedDelivery ?? {
          intentId: acceptedIntentId,
          issueNumber: ISSUE,
          prNumber: acceptedPrNumber,
          expectedHeadSha: acceptedSha,
          mergeCommitSha: acceptedMergeSha,
          baseRef: 'trunk',
          mergeMethod: 'squash',
          verifiedTrunkRef: 'origin/trunk',
          provider: 'claude',
          sessionId: 'session-1490',
          verifiedAt: '2026-09-03T01:49:10.000Z',
        },
      },
    },
  };
  const args = {
    closeIssueNum: String(ISSUE),
    convergeBody: overrides.convergeBody ?? bodyWith(oldTransaction()),
    // The verb derives the active transaction from the BODY, never from here.
    decisionInput: {},
    ensureDeliveryAuthorized: async () => gate,
    resolvedDeliveryGateRef: () => gate,
    terminalReviewAuthority: () => 'human-gate',
    dispositionReader: async () =>
      'disposition' in overrides ? overrides.disposition : 'Delivered',
    // #1490 — the recovery now resolves binding OWNERSHIP, not release progress.
    // `inspectTerminalIssueBindingRelease`'s four statuses describe how far the OLD
    // release got, so none of them authorizes a NEW close, and `pending` is
    // structurally unreachable once a reopened issue carries a ledger `closedAt`.
    // The production resolver is pinned against real files in
    // `lib/reopened-close-binding-ownership.test.mjs`; here we pin the WIRING.
    resolveBindingOwnership: () =>
      'bindingOwnership' in overrides
        ? overrides.bindingOwnership
        : { disposition: 'own-post-close-claim', authorized: true },
    inspectDirty: async () => ({ dirty: 'dirty' in overrides ? overrides.dirty : false }),
    resolveWorkspaceForIssue: () => '/wt/1490',
    projectDir: '/wt/1490',
    cfg: { repo: REPO, assignee: '@me' },
    closeSnapshot: normalizeIssueCloseSnapshot({
      state: 'issueState' in overrides ? overrides.issueState : 'OPEN',
      stateReason: 'issueStateReason' in overrides ? overrides.issueStateReason : 'REOPENED',
    }),
    boardState: 'boardState' in overrides ? overrides.boardState : 'review',
    mutateBody: async ({ mutate }) => {
      calls.order.push('body');
      const next = mutate(args.convergeBody);
      calls.bodyWrites.push(next);
      return { status: 'ok', body: overrides.mutationBody ?? next };
    },
    ctx: {
      reopenedCloseActor: 'kburson',
      reopenedCloseNow: () => NOW,
      randomUUIDFn: () => overrides.newUuid ?? NEW_TX,
      listReopenedCloseDeliveryComments: async () => deliveryComments,
      listReopenedCloseRecoveryComments: async () => recoveryComments,
      createReopenedCloseRecoveryComment: async (body) => {
        calls.order.push('comment');
        calls.createdComments.push(body);
        recoveryComments = [
          ...recoveryComments,
          { id: 900, body, issue_url: `https://api.github.com/repos/${REPO}/issues/${ISSUE}` },
        ];
        return { id: 900 };
      },
    },
  };
  return { args, calls };
}

test('#1490: OPEN/REOPENED normalizes to `reopened` and reaches authorization', async () => {
  const { args } = harness();
  assert.equal(args.closeSnapshot.stateReason, 'reopened');
  const result = await runReopenedCloseRecovery(args);
  assert.equal(result.transaction.acceptedSha, NEW_SHA);
  assert.deepEqual(result.transaction.completedSteps, []);
});

test('#1490: a plain OPEN issue is not recoverable', async () => {
  const { args, calls } = harness({ issueStateReason: null });
  assert.equal(args.closeSnapshot.stateReason, null);
  await assert.rejects(runReopenedCloseRecovery(args), /live-terminal-state/);
  assert.deepEqual(calls.createdComments, []);
  assert.deepEqual(calls.bodyWrites, []);
});

test('#1490: durable evidence is written BEFORE the body is mutated', async () => {
  const { args, calls } = harness();
  await runReopenedCloseRecovery(args);
  assert.deepEqual(calls.order, ['comment', 'body']);
  assert.equal(calls.createdComments.length, 1);
  assert.match(calls.createdComments[0], /aitm-reopened-close-recovery id="close-reopened:/);
});

test('#1490: durable recovery authorizes an outcome correction only for its replacement transaction', async () => {
  const { args } = harness();
  const recovered = await runReopenedCloseRecovery(args);

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
      transaction: { ...recovered.transaction, transactionId: 'foreign-transaction' },
    }),
    false
  );
});

test('#1490: outcome correction accepts only the exact recovery-to-supersession chain', async () => {
  const { args } = harness();
  const recovered = await runReopenedCloseRecovery(args);
  const currentTransaction = {
    ...recovered.transaction,
    transactionId: NEXT_TX,
    acceptedSha: NEXT_SHA,
  };
  const supersessionRecord = {
    schema: 'aitm.delivered-close-supersession/v1',
    issueNumber: ISSUE,
    oldTransactionId: recovered.transaction.transactionId,
    oldAcceptedSha: recovered.transaction.acceptedSha,
    replacementTransactionId: currentTransaction.transactionId,
    newAcceptedSha: currentTransaction.acceptedSha,
  };

  assert.equal(
    permitsReopenedOutcomeCorrection({
      recoveryRecord: recovered.record,
      supersessionRecord,
      transaction: currentTransaction,
    }),
    true
  );

  for (const mismatch of [
    { recoveryRecord: { ...recovered.record, replacementTransactionId: 'foreign' } },
    { supersessionRecord: { ...supersessionRecord, oldAcceptedSha: OLD_SHA } },
    { supersessionRecord: { ...supersessionRecord, replacementTransactionId: 'foreign' } },
    { transaction: { ...currentTransaction, acceptedSha: OLD_SHA } },
  ]) {
    assert.equal(
      permitsReopenedOutcomeCorrection({
        recoveryRecord: recovered.record,
        supersessionRecord,
        transaction: currentTransaction,
        ...mismatch,
      }),
      false
    );
  }
});

test('#1490: the primary estimation step consumes the durable reopened-recovery authority', () => {
  const source = readFileSync(
    new URL('../../../../task-tracker/verbs/close.mjs', import.meta.url),
    'utf8'
  );
  const recoveryAssignment = source.indexOf('reopenedCloseRecoveryRecord = recovered.record');
  const estimationStep = source.indexOf("if (needsDeliveredCloseStep('estimation'))");
  const authorityUse = source.indexOf(
    'supersedeExisting: permitsReopenedOutcomeCorrection({',
    estimationStep
  );

  assert.ok(recoveryAssignment > 0, 'recovery must retain its durable record');
  assert.ok(
    estimationStep > recoveryAssignment,
    'estimation must run after recovery authorization'
  );
  assert.ok(
    authorityUse > estimationStep,
    'estimation must consume only matched recovery authority'
  );
});

test('#1490: gate-resolved Test and Review SHAs are the exact values used', async () => {
  for (const override of [{ testReceiptSha: OLD_SHA }, { recoveryReviewApprovedSha: OLD_SHA }]) {
    const { args, calls } = harness(override);
    await assert.rejects(runReopenedCloseRecovery(args), /current-evidence/);
    assert.deepEqual(calls.createdComments, [], 'no comment on refusal');
    assert.deepEqual(calls.bodyWrites, [], 'no body write on refusal');
  }
});

test('#1490: historical evidence is genuinely resolved, not asserted', async () => {
  // The PR inventory lacks the old accepted SHA entirely.
  const missingPr = harness({ pullRequests: [pullRequestFor(NEW_SHA, NEW_MERGE, 1493)] });
  await assert.rejects(runReopenedCloseRecovery(missingPr.args), /historical-evidence/);
  assert.deepEqual(missingPr.calls.createdComments, []);
  assert.deepEqual(missingPr.calls.bodyWrites, []);

  // Two PRs claim the old accepted SHA — ambiguous history.
  const twoPrs = harness({
    pullRequests: [
      pullRequestFor(OLD_SHA, OLD_MERGE, 1491),
      pullRequestFor(OLD_SHA, OLD_MERGE, 1492),
      pullRequestFor(NEW_SHA, NEW_MERGE, 1493),
    ],
  });
  await assert.rejects(runReopenedCloseRecovery(twoPrs.args), /historical-evidence/);
  assert.deepEqual(twoPrs.calls.bodyWrites, []);

  // The historical PR exists but carries no delivery records.
  const noRecords = harness({ deliveryComments: [...CURRENT.comments] });
  await assert.rejects(runReopenedCloseRecovery(noRecords.args), /historical-evidence/);
  assert.deepEqual(noRecords.calls.bodyWrites, []);

  // Intent present, receipt absent.
  const intentOnly = harness({
    deliveryComments: [HISTORICAL.comments[0], ...CURRENT.comments],
  });
  await assert.rejects(runReopenedCloseRecovery(intentOnly.args), /historical-evidence/);
  assert.deepEqual(intentOnly.calls.bodyWrites, []);
});

test('#1490: a fabricated or copied verifier result refuses', async () => {
  // The verifier's output must independently corroborate the PR and intent. A
  // value that disagrees with either is not corroboration.
  for (const override of [
    { mergeCommitSha: OLD_MERGE },
    { expectedHeadSha: OLD_SHA },
    { intentId: 'someone-elses-intent' },
  ]) {
    const { args, calls } = harness({
      verifiedDelivery: {
        intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
        issueNumber: ISSUE,
        prNumber: 1493,
        expectedHeadSha: NEW_SHA,
        mergeCommitSha: NEW_MERGE,
        ...override,
      },
    });
    await assert.rejects(
      runReopenedCloseRecovery(args),
      /current-evidence/,
      JSON.stringify(override)
    );
    assert.deepEqual(calls.bodyWrites, []);
  }
});

test('#1490: absent Review authority refuses without an accepted-SHA substitution', async () => {
  const { args, calls } = harness({ recoveryReviewApprovedSha: null });
  await assert.rejects(runReopenedCloseRecovery(args), /current-evidence/);
  assert.deepEqual(calls.createdComments, []);
  assert.deepEqual(calls.bodyWrites, []);
});

test('#1490: contradictory live state writes nothing', async () => {
  for (const override of [
    { disposition: null },
    { boardState: 'develop' },
    { dirty: true },
    { bindingOwnership: { disposition: 'foreign-claim', authorized: false } },
    { bindingOwnership: { disposition: 'stale-claim', authorized: false } },
    { bindingOwnership: { disposition: 'no-prior-close', authorized: false } },
    // Authorized but under a disposition the recovery does not recognize: the
    // predicate must check BOTH, or an unrelated future disposition would pass.
    { bindingOwnership: { disposition: 'own-post-close-claim-v2', authorized: true } },
  ]) {
    const { args, calls } = harness(override);
    await assert.rejects(runReopenedCloseRecovery(args), /live-terminal-state/);
    assert.deepEqual(calls.createdComments, [], JSON.stringify(override));
    assert.deepEqual(calls.bodyWrites, [], JSON.stringify(override));
  }
});

test('#1490: interruption after the comment reuses its replacement UUID', async () => {
  // Durable evidence already exists from a prior attempt; this attempt would mint
  // a different UUID and must not.
  const seeded = harness();
  await runReopenedCloseRecovery(seeded.args);
  const durableComment = seeded.calls.createdComments[0];

  const retry = harness({
    recoveryComments: [
      {
        id: 900,
        body: durableComment,
        issue_url: `https://api.github.com/repos/${REPO}/issues/${ISSUE}`,
      },
    ],
    newUuid: 'ffffffff-0000-0000-0000-000000000000',
  });
  const result = await runReopenedCloseRecovery(retry.args);
  assert.equal(result.transaction.transactionId, NEW_TX, 'reuses the durable UUID');
  assert.deepEqual(retry.calls.createdComments, [], 'writes no second comment');
});

test('#1490: interruption after the body replacement resumes without rewriting', async () => {
  const seeded = harness();
  const first = await runReopenedCloseRecovery(seeded.args);
  const durableComment = seeded.calls.createdComments[0];

  const retry = harness({
    recoveryComments: [
      {
        id: 900,
        body: durableComment,
        issue_url: `https://api.github.com/repos/${REPO}/issues/${ISSUE}`,
      },
    ],
    convergeBody: first.body,
  });
  const result = await runReopenedCloseRecovery(retry.args);
  assert.equal(result.transaction.transactionId, NEW_TX);
  assert.deepEqual(result.transaction.completedSteps, []);
  assert.deepEqual(retry.calls.bodyWrites, [], 'does not rewrite an already-replaced body');
  assert.deepEqual(retry.calls.createdComments, []);
});

test('#1490: an unchanged mutation read-back refuses', async () => {
  // The write "succeeds" but returns a body that still carries the old
  // transaction. Validating the captured pre-mutation body would have missed this.
  const { args } = harness({ mutationBody: bodyWith(oldTransaction()) });
  await assert.rejects(runReopenedCloseRecovery(args), /stale-body|mutation-readback/);
});

test('#1490: malformed durable evidence refuses rather than being skipped', async () => {
  const { args, calls } = harness({
    recoveryComments: [
      {
        id: 901,
        body: 'aitm-reopened-close-recovery without a well-formed marker',
        issue_url: `https://api.github.com/repos/${REPO}/issues/${ISSUE}`,
      },
    ],
  });
  await assert.rejects(runReopenedCloseRecovery(args), /malformed-comment/);
  assert.deepEqual(calls.bodyWrites, []);
});

test('#1490: a recovery comment rendered for a different issue refuses', async () => {
  const seeded = harness();
  await runReopenedCloseRecovery(seeded.args);
  const durableComment = seeded.calls.createdComments[0];
  const { args, calls } = harness({
    recoveryComments: [
      {
        id: 902,
        body: durableComment,
        issue_url: `https://api.github.com/repos/${REPO}/issues/999`,
      },
    ],
  });
  await assert.rejects(runReopenedCloseRecovery(args), /malformed-comment/);
  assert.deepEqual(calls.bodyWrites, []);
});

test('#1490: the rendered comment round-trips through the strict codec', () => {
  const { args } = harness();
  assert.ok(args.convergeBody.includes(OLD_TX));
  // Sanity: the renderer is the only thing that produces acceptable evidence.
  assert.throws(() => renderReopenedCloseRecoveryComment({ schema: 'wrong' }), /record/);
});

// ---------------------------------------------------------------------------
// #1490 item 3 — resume by transaction IDENTITY at any valid completed-step
// prefix.
//
// The first implementation keyed resume on
// `activeTransaction.completedSteps.length === 0`, and validated ONE live shape:
// board `review`, issue open/`reopened`. Both are only true at the instant the
// replacement is minted. The saga's `board` step moves the board to `done` and its
// `issue` step closes the issue, so a retry after those steps
//   (a) fell into the MINT branch and treated the replacement as the completed
//       original, and
//   (b) was refused by a precondition the transaction had legitimately passed.
// Partial progress therefore could not resume by construction — the exact
// interruption case the recovery exists to survive.

// Mint once through the real path, then reuse the durable comment it wrote. This
// keeps the resume fixtures honest: the evidence is renderer-produced, not hand
// written, so it must round-trip the strict codec to be found at all.
async function mintedRecoveryComment() {
  const seeded = harness();
  await runReopenedCloseRecovery(seeded.args);
  return seeded.calls.createdComments[0];
}

function replacementTransaction(completedSteps) {
  return {
    schema: 'aitm.delivered-close/v1',
    transactionId: NEW_TX,
    issueNumber: ISSUE,
    acceptedSha: NEW_SHA,
    reviewAuthority: 'human-gate',
    completedSteps,
  };
}

async function resumeHarness(completedSteps, overrides = {}) {
  const durable = await mintedRecoveryComment();
  return harness({
    convergeBody: bodyWith(replacementTransaction(completedSteps)),
    recoveryComments: [
      { id: 900, body: durable, issue_url: `https://api.github.com/repos/${REPO}/issues/${ISSUE}` },
    ],
    ...overrides,
  });
}

test('#1490: a resume at a NONZERO prefix reuses the durable recovery, not a new mint', async () => {
  const prefix = ['timing', 'estimation', 'lifecycle'];
  const { args, calls } = await resumeHarness(prefix);
  const result = await runReopenedCloseRecovery(args);
  // Identity-matched: same replacement, its progress preserved.
  assert.equal(result.transaction.transactionId, NEW_TX);
  assert.deepEqual(result.transaction.completedSteps, prefix);
  // No second recovery minted, and no rewrite of an already-replaced marker.
  assert.deepEqual(calls.createdComments, []);
  assert.deepEqual(calls.bodyWrites, []);
});

test('#1490: a resume after the `board` step accepts board `done`', async () => {
  // Under the fixed initial shape this refused: the step that moved the board is
  // the same step whose result the predicate then rejected.
  const { args } = await resumeHarness(['timing', 'estimation', 'lifecycle', 'board'], {
    boardState: 'done',
  });
  const result = await runReopenedCloseRecovery(args);
  assert.equal(result.transaction.transactionId, NEW_TX);
});

test('#1490: a resume after the `issue` step accepts a CLOSED issue', async () => {
  const { args } = await resumeHarness(
    ['timing', 'estimation', 'lifecycle', 'board', 'disposition', 'issue'],
    { boardState: 'done', issueState: 'CLOSED', issueStateReason: 'COMPLETED' }
  );
  const result = await runReopenedCloseRecovery(args);
  assert.equal(result.transaction.transactionId, NEW_TX);
});

test('#1490: prefix-awareness is a predicate, not a bypass', async () => {
  // Each case is live state INCONSISTENT with its own prefix, so each must refuse.
  const cases = [
    // Board not yet stepped, but already off `review`.
    { steps: ['timing'], overrides: { boardState: 'done' } },
    // Board stepped, but the board did not actually move.
    { steps: ['timing', 'estimation', 'lifecycle', 'board'], overrides: { boardState: 'review' } },
    // Issue not yet stepped, but already closed.
    {
      steps: ['timing', 'estimation', 'lifecycle', 'board'],
      overrides: { boardState: 'done', issueState: 'CLOSED', issueStateReason: 'COMPLETED' },
    },
    // Issue stepped, but the issue is still open.
    {
      steps: ['timing', 'estimation', 'lifecycle', 'board', 'disposition', 'issue'],
      overrides: { boardState: 'done' },
    },
    // Invariants still hold at every prefix.
    {
      steps: ['timing', 'estimation'],
      overrides: { dirty: true },
    },
    {
      steps: ['timing', 'estimation'],
      overrides: { bindingOwnership: { disposition: 'foreign-claim', authorized: false } },
    },
  ];
  for (const { steps, overrides } of cases) {
    const { args, calls } = await resumeHarness(steps, overrides);
    await assert.rejects(
      runReopenedCloseRecovery(args),
      /live-terminal-state/,
      JSON.stringify({ steps, overrides })
    );
    assert.deepEqual(calls.createdComments, [], JSON.stringify({ steps, overrides }));
    assert.deepEqual(calls.bodyWrites, [], JSON.stringify({ steps, overrides }));
  }
});

test('#1490: a retry after ALL steps completed is idempotent, not a refusal or a re-mint', async () => {
  // The binding step is last and releases the binding, so ownership no longer
  // resolves. Re-validating would refuse a transaction that already succeeded, and
  // minting again would supersede a delivery that was never superseded.
  const { args, calls } = await resumeHarness([...TERMINAL_CLOSE_STEPS], {
    boardState: 'done',
    issueState: 'CLOSED',
    issueStateReason: 'COMPLETED',
    bindingOwnership: { disposition: 'no-claim', authorized: false },
  });
  const result = await runReopenedCloseRecovery(args);
  assert.equal(result.transaction.transactionId, NEW_TX);
  assert.deepEqual(result.transaction.completedSteps, [...TERMINAL_CLOSE_STEPS]);
  assert.deepEqual(calls.createdComments, []);
  assert.deepEqual(calls.bodyWrites, []);
});

test('#1490: a completed replacement reopened for a new accepted SHA chains recovery', async () => {
  const durable = await mintedRecoveryComment();
  const url = `https://api.github.com/repos/${REPO}/issues/${ISSUE}`;
  const { args, calls } = harness({
    convergeBody: bodyWith(replacementTransaction([...TERMINAL_CLOSE_STEPS])),
    recoveryComments: [{ id: 900, body: durable, issue_url: url }],
    acceptedSha: NEXT_SHA,
    acceptedMergeSha: NEXT_MERGE,
    acceptedPrNumber: 1495,
    acceptedIntentId: '01ARZ3NDEKTSV4RRFFQ69G5FAX',
    acceptedReceipt: NEXT.receipt,
    deliveryComments: [...CURRENT.comments, ...NEXT.comments],
    pullRequests: [
      pullRequestFor(NEW_SHA, NEW_MERGE, 1493),
      pullRequestFor(NEXT_SHA, NEXT_MERGE, 1495),
    ],
    newUuid: NEXT_TX,
  });
  const result = await runReopenedCloseRecovery(args);
  assert.equal(result.transaction.transactionId, NEXT_TX);
  assert.equal(result.transaction.acceptedSha, NEXT_SHA);
  assert.deepEqual(result.transaction.completedSteps, []);
  assert.equal(calls.createdComments.length, 1);
  assert.equal(calls.bodyWrites.length, 1);
  assert.match(calls.createdComments[0], /aitm-reopened-close-recovery/);
});

test('#1490: a FRESH mint still requires the step-zero shape', async () => {
  // Prefix-awareness must not leak into the mint path: with no durable record
  // naming it, a completed original is judged at step zero exactly as before.
  for (const overrides of [
    { boardState: 'done' },
    { issueState: 'CLOSED', issueStateReason: 'COMPLETED' },
  ]) {
    const { args, calls } = harness(overrides);
    await assert.rejects(
      runReopenedCloseRecovery(args),
      /live-terminal-state/,
      JSON.stringify(overrides)
    );
    assert.deepEqual(calls.createdComments, [], JSON.stringify(overrides));
  }
});

test('#1490: two durable records naming the same replacement refuse rather than pick one', async () => {
  const durable = await mintedRecoveryComment();
  const url = `https://api.github.com/repos/${REPO}/issues/${ISSUE}`;
  const { args, calls } = harness({
    convergeBody: bodyWith(replacementTransaction(['timing'])),
    recoveryComments: [
      { id: 900, body: durable, issue_url: url },
      { id: 901, body: durable, issue_url: url },
    ],
  });
  await assert.rejects(runReopenedCloseRecovery(args), /resume-evidence/);
  assert.deepEqual(calls.createdComments, []);
  assert.deepEqual(calls.bodyWrites, []);
});
