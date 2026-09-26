// @story #1787 #1791
// Characterization: Task 8 intentionally changes the labelled compound-error precedence.

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { buildDeliveryAttributionProposal } from '../../../../task-tracker/lib/delivery-attribution-exception-record.mjs';
import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
  parseDeliveryComment,
  renderDeliveryIntentComment,
  renderDeliveryReceiptComment,
} from '../../../../task-tracker/lib/delivery-records.mjs';
import {
  HEAD,
  MERGE_HEAD,
  deliver,
  makeHarness,
  mergePendingIntent,
} from '../verbs/deliver-test-harness.mjs';

const context = { repository: 'kburson/ai-task-manager', issueNumber: 939, prNumber: 1400 };
const intentInput = {
  intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  supersedesIntentId: null,
  issueNumber: 939,
  repository: context.repository,
  prNumber: 1400,
  baseRef: 'trunk',
  headRef: 'codex/939-full-auto-merge',
  expectedHeadSha: HEAD,
  mergeMethod: 'squash',
  attributionTokens: ['#939'],
  commitTitle: '[#939] Deliver governed PR workflow',
  commitMessage: `PR #1400 source ${HEAD}\n\n[#939]`,
  provider: 'codex',
  sessionId: 'session-939',
  clientCreatedAt: '2026-08-22T14:00:00.000Z',
};
const receiptInput = {
  intentId: intentInput.intentId,
  issueNumber: 939,
  prNumber: 1400,
  expectedHeadSha: HEAD,
  mergeCommitSha: MERGE_HEAD,
  baseRef: 'trunk',
  mergeMethod: 'squash',
  verifiedTrunkRef: 'origin/trunk',
  provider: 'codex',
  sessionId: 'session-939',
  verifiedAt: '2026-08-22T14:02:00.000Z',
};

function roundTrip(record, render, id) {
  const parsed = parseDeliveryComment(
    { id, body: render(record), createdAt: '2026-08-22T14:03:00.000Z' },
    context
  );
  assert.deepEqual(parsed.record, record);
  return parsed.record;
}

function assertNoTerminalWrites(harness, previousWrites) {
  assert.equal(harness.calls.createIssueComment, previousWrites);
  assert.equal(harness.calls.terminalTiming, 0);
  assert.equal(harness.calls.terminalBoard, 0);
  assert.equal(harness.calls.terminalDisposition, 0);
  assert.equal(harness.calls.terminalClosure, 0);
  assert.equal(harness.calls.terminalBinding, 0);
}

test('observed merge receipt preserves a proposed squash intent', () => {
  const intent = buildDeliveryIntent(intentInput);
  const observedIntegration = {
    method: 'merge',
    mergeCommitSha: MERGE_HEAD,
    parents: ['1'.repeat(40), HEAD],
    tree: '2'.repeat(40),
    commitTitle: 'Merge pull request #1400 from kburson/codex/939-full-auto-merge',
    commitMessage: '[#939] Governed delivery',
    sourceMapping: [{ source: HEAD, integrated: HEAD }],
    contentProof: {
      kind: 'equivalent-delta',
      sourceBase: '3'.repeat(40),
      sourceHead: HEAD,
      integrationBase: '1'.repeat(40),
      integrationHead: MERGE_HEAD,
    },
  };
  const receipt = buildDeliveryReceipt({
    ...receiptInput,
    mergeMethod: 'merge',
    sourceDigest: `sha256:${'4'.repeat(64)}`,
    observedIntegration,
  });
  assert.equal(intent.mergeMethod, 'squash');
  assert.equal(receipt.schema, 'aitm.delivery-receipt/v5');
  assert.deepEqual(roundTrip(receipt, renderDeliveryReceiptComment, 'receipt-v5'), receipt);
  assert.throws(
    () =>
      buildDeliveryReceipt({
        ...receiptInput,
        mergeMethod: 'merge',
        observedIntegration: { ...observedIntegration, method: 'squash' },
        sourceDigest: `sha256:${'4'.repeat(64)}`,
      }),
    /observed-integration/
  );
});

test('ordinary v1 intent/v1 receipt and warning v2 receipt remain readable', () => {
  const intent = buildDeliveryIntent(intentInput);
  const receipt = buildDeliveryReceipt(receiptInput);
  const warning = buildDeliveryReceipt({
    ...receiptInput,
    metadataWarnings: ['missing-source-attribution'],
  });
  assert.equal(
    roundTrip(intent, renderDeliveryIntentComment, 'intent-v1').schema,
    'aitm.delivery-intent/v1'
  );
  assert.equal(
    roundTrip(receipt, renderDeliveryReceiptComment, 'receipt-v1').schema,
    'aitm.delivery-receipt/v1'
  );
  assert.equal(
    roundTrip(warning, renderDeliveryReceiptComment, 'receipt-v2').schema,
    'aitm.delivery-receipt/v2'
  );
});

test('#1755 attribution-waived v2 intent/v3 receipt remain readable', () => {
  const fields = {
    attributionDisposition: 'waived',
    exceptionRecordId: '01M2H000000000000000000003',
    operationId: '01M2H000000000000000000002',
    sourceDigest: `sha256:${'a'.repeat(64)}`,
    proposalDigest: `sha256:${'b'.repeat(64)}`,
    mappings: [{ oid: '1'.repeat(40), messageHeadline: 'legacy commit', issueNumber: 939 }],
  };
  const proposal = buildDeliveryAttributionProposal({
    exceptionId: fields.exceptionRecordId,
    operationId: fields.operationId,
    repository: context.repository,
    issueNumber: 939,
    prNumber: 1400,
    baseRef: 'trunk',
    headRef: intentInput.headRef,
    headSha: HEAD,
    sourceDigest: fields.sourceDigest,
    mappings: fields.mappings,
    attributionTokens: ['#939'],
    expiresAt: '2026-08-23T00:00:00.000Z',
  });
  const grant = {
    schema: 'aitm.delivery-attribution-exception/v1',
    kind: 'grant',
    recordId: fields.exceptionRecordId,
    predecessorId: null,
    proposal: proposal.proposal,
    proposalDigest: proposal.proposalDigest,
    authority: {
      sourceReference: 'codex-session/v1:turn-10',
      statement: 'Authorize exact mapping',
      actor: 'kpburson',
      level: 'host-verified-user-message',
    },
    createdAt: '2026-08-22T00:00:00.000Z',
  };
  const intent = buildDeliveryIntent({ ...intentInput, ...fields });
  const receipt = buildDeliveryReceipt({
    ...receiptInput,
    attributionDisposition: 'waived',
    exceptionRecordId: grant.recordId,
    exceptionRecord: grant,
  });
  assert.equal(
    roundTrip(intent, renderDeliveryIntentComment, 'intent-v2').schema,
    'aitm.delivery-intent/v2'
  );
  assert.equal(
    roundTrip(receipt, renderDeliveryReceiptComment, 'receipt-v3').schema,
    'aitm.delivery-receipt/v3'
  );
});

test('pending squash intent refuses a provider-reported merge without a receipt', async () => {
  const h = makeHarness();
  await mergePendingIntent(h);
  h.data.prMergeMethod = 'merge';
  h.data.historyMergeMethod = 'merge';
  const writes = h.calls.createIssueComment;
  await assert.rejects(
    () => deliver(h),
    (error) => {
      assert.equal(error.category, 'merge-method');
      return true;
    }
  );
  assertNoTerminalWrites(h, writes);
});

test('no grant retains the original merge-method refusal', async () => {
  const h = makeHarness();
  await mergePendingIntent(h);
  h.data.prMergeMethod = 'merge';
  h.data.historyMergeMethod = 'merge';
  await assert.rejects(() => deliver(h), /delivery-verification:merge-method\b/);
  assert.equal(
    h.data.comments.filter(({ body }) => body.startsWith('<!-- aitm-delivery-receipt ')).length,
    0
  );
});

for (const [label, mutate, category] of [
  [
    'wrong accepted SHA',
    (h) => {
      h.data.acceptedReviewSha = 'b'.repeat(40);
    },
    'delivery-preflight:head-mismatch',
  ],
  [
    'wrong PR base target',
    (h) => {
      const fetch = h.deps.fetchPullRequest;
      h.deps.fetchPullRequest = async (input) => ({ ...(await fetch(input)), baseRefName: 'main' });
    },
    'pull-request-base',
  ],
  [
    'unreachable merge',
    (h) => {
      h.deps.isAncestor = async () => false;
    },
    'trunk-reachability',
  ],
]) {
  test(`${label} refuses without terminal writes`, async () => {
    const h = makeHarness();
    await mergePendingIntent(h);
    mutate(h);
    const writes = h.calls.createIssueComment;
    await assert.rejects(() => deliver(h), new RegExp(category));
    assertNoTerminalWrites(h, writes);
  });
}

test('unmerged PR remains pending without a receipt or terminal write', async () => {
  const h = makeHarness();
  await mergePendingIntent(h);
  h.data.prState = 'OPEN';
  const writes = h.calls.createIssueComment;
  const result = await deliver(h);
  assert.equal(result.status, 'action-required');
  assertNoTerminalWrites(h, writes);
});

test('malformed persisted intent refuses without a receipt', async () => {
  const h = makeHarness();
  await mergePendingIntent(h);
  h.data.comments[0].body = h.data.comments[0].body.replace(
    'aitm.delivery-intent/v1',
    'aitm.delivery-intent/invalid'
  );
  const writes = h.calls.createIssueComment;
  await assert.rejects(() => deliver(h), /delivery-records:/);
  assertNoTerminalWrites(h, writes);
});

for (const [label, mutate, category, requirementId] of [
  [
    'invalid merge SHA',
    (h) => {
      h.data.mergeCommitSha = 'not-a-sha';
    },
    'merge-commit-sha',
    'delivery.verification.pr-merged',
  ],
  [
    'invalid mergedAt',
    (h) => {
      h.data.mergedAt = 'not-an-instant';
    },
    'merged-at',
    'delivery.verification.pr-merged',
  ],
  [
    'unknown Git topology',
    (h) => {
      h.data.historyMergeMethod = 'unknown';
    },
    'merge-method-unknown',
    'delivery.verification.merge-method-evidence',
  ],
]) {
  test(`Task 8 precedence: method mismatch plus ${label} reports ${category}`, async () => {
    const h = makeHarness();
    await mergePendingIntent(h);
    h.data.prMergeMethod = 'merge';
    mutate(h);
    const writes = h.calls.createIssueComment;
    await assert.rejects(
      () => deliver(h),
      (error) => {
        assert.equal(error.category, category);
        assert.equal(error.requirementId, requirementId);
        return true;
      }
    );
    assertNoTerminalWrites(h, writes);
  });
}
