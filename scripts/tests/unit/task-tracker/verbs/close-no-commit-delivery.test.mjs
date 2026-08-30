// @story #1439
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  buildNoCommitDeliveryRecord,
  parseNoCommitDeliveryComment,
  projectNoCommitDeliveryRecords,
  renderNoCommitDeliveryComment,
} from '../../../../task-tracker/lib/no-commit-delivery-record.mjs';
import {
  requireDeliveryReceipt,
  verifyCloseDeliveryReceipt,
} from '../../../../task-tracker/lib/close-delivery-receipt.mjs';
import { loadCloseDeliveryGateInput } from '../../../../task-tracker/verbs/close.mjs';

const HEAD = 'a'.repeat(40);
const OTHER_HEAD = 'b'.repeat(40);
const URL = 'https://github.com/kburson/ai-task-manager/issues/1407#issuecomment-5469679817';
const OTHER_URL = 'https://github.com/kburson/ai-task-manager/issues/1407#issuecomment-5469797877';
const BODY = `## AITM Progress Markers

<!-- aitm-issue-kind kind="epic" -->
<!-- aitm-deliverable-posted url="${URL}" ts="2026-08-30T15:49:04.000Z" -->`;

function record(overrides = {}) {
  return buildNoCommitDeliveryRecord({
    recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    repository: 'kburson/ai-task-manager',
    issueNumber: 1407,
    issueKind: 'epic',
    deliverableUrl: URL,
    acceptedSha: HEAD,
    provider: 'codex',
    sessionId: 'session-1439',
    verifiedAt: '2026-08-30T16:20:00.000Z',
    ...overrides,
  });
}

function projection(deliveryRecord = record()) {
  return projectNoCommitDeliveryRecords([
    parseNoCommitDeliveryComment({
      id: 'comment-1',
      createdAt: '2026-08-30T16:20:01.000Z',
      body: renderNoCommitDeliveryComment(deliveryRecord),
    }),
  ]);
}

function input(overrides = {}) {
  return {
    issueNumber: 1407,
    repository: 'kburson/ai-task-manager',
    body: BODY,
    lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
    branch: 'claude/pull-branch-trunk-origin-c647e3',
    acceptedSha: HEAD,
    observedLocalHeadSha: HEAD,
    headRelation: 'current',
    pullRequests: [],
    records: null,
    noCommitRecords: projection(),
    ...overrides,
  };
}

test('exact no-commit authorization permits close without PR verification', async () => {
  const gateInput = input();
  const receiptGate = requireDeliveryReceipt(gateInput);
  assert.equal(receiptGate.skipped, false);
  assert.equal(receiptGate.mode, 'no-commit');
  assert.equal(receiptGate.receipt.recordId, '01ARZ3NDEKTSV4RRFFQ69G5FAV');

  const fresh = await verifyCloseDeliveryReceipt({
    gateInput,
    receiptGate,
    testReceiptSha: HEAD,
    acceptedReviewSha: HEAD,
    deps: {},
  });
  assert.equal(fresh.mode, 'no-commit');
  assert.equal(fresh.receipt, receiptGate.receipt);
});

test('no-commit close fails closed for missing or malformed authorization', () => {
  for (const noCommitRecords of [
    { records: [], record: null },
    null,
    { records: [{}], record: {} },
  ]) {
    assert.throws(
      () => requireDeliveryReceipt(input({ noCommitRecords })),
      /close-delivery-receipt:(missing|malformed)/
    );
  }
});

test('no-commit comment projection rejects malformed, duplicate, and conflicting authority', () => {
  assert.throws(
    () =>
      parseNoCommitDeliveryComment({
        id: 'comment-malformed',
        createdAt: '2026-08-30T16:20:01.000Z',
        body: '<!-- aitm-no-commit-delivery {not-json} -->',
      }),
    /no-commit-delivery-record:marker/
  );

  const first = parseNoCommitDeliveryComment({
    id: 'comment-1',
    createdAt: '2026-08-30T16:20:01.000Z',
    body: renderNoCommitDeliveryComment(record()),
  });
  const duplicate = { ...first, id: 'comment-2', createdAt: '2026-08-30T16:20:02.000Z' };
  assert.throws(
    () => projectNoCommitDeliveryRecords([first, duplicate]),
    /no-commit-delivery-record:duplicate/
  );

  const conflicting = parseNoCommitDeliveryComment({
    id: 'comment-3',
    createdAt: '2026-08-30T16:20:03.000Z',
    body: renderNoCommitDeliveryComment(
      record({ recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAW', acceptedSha: OTHER_HEAD })
    ),
  });
  assert.throws(
    () => projectNoCommitDeliveryRecords([first, conflicting]),
    /no-commit-delivery-record:conflicting/
  );
});

test('no-commit close rejects wrong issue, kind, deliverable URL, or accepted SHA', () => {
  const cases = [
    [record({ issueNumber: 1408 }), /issue-mismatch/],
    [record({ issueKind: 'research' }), /kind-mismatch/],
    [record({ deliverableUrl: OTHER_URL }), /deliverable-mismatch/],
    [record({ acceptedSha: OTHER_HEAD }), /head-mismatch/],
  ];
  for (const [deliveryRecord, expected] of cases) {
    assert.throws(
      () => requireDeliveryReceipt(input({ noCommitRecords: projection(deliveryRecord) })),
      expected
    );
  }
});

test('code-kind issue still requires the pull-request receipt path', () => {
  const codeBody = BODY.replace('<!-- aitm-issue-kind kind="epic" -->\n', '');
  assert.throws(
    () => requireDeliveryReceipt(input({ body: codeBody, noCommitRecords: projection() })),
    /close-delivery-receipt:ambiguous-pr/
  );
});

test('close input loads no-commit authorization even when the branch has no pull request', async () => {
  const receiptData = (stage) =>
    Buffer.from(JSON.stringify({ stage, commitSha: HEAD })).toString('base64url');
  const issueBody = `${BODY}
- [x] Agent Review Passed <!-- aitm-verified gate="agent-review" result="pass" -->
<!-- aitm-verification-receipt stage="test" data="${receiptData('test')}" -->
<!-- aitm-verification-receipt stage="review" data="${receiptData('review')}" -->`;
  let commentReads = 0;
  const pexec = async (command, args) => {
    if (command === 'git' && args[0] === 'branch') return { stdout: 'feature/epic/1407\n' };
    if (command === 'git' && args[0] === 'rev-parse') return { stdout: `${OTHER_HEAD}\n` };
    if (command === 'gh' && args[0] === 'pr') return { stdout: '[]' };
    if (command === 'gh' && args[0] === 'api') {
      commentReads += 1;
      return {
        stdout: JSON.stringify([
          [
            {
              id: 1,
              created_at: '2026-08-30T16:20:01Z',
              body: renderNoCommitDeliveryComment(record()),
            },
          ],
        ]),
      };
    }
    throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
  };

  const result = await loadCloseDeliveryGateInput({
    issueNumber: 1407,
    cfg: { repo: 'kburson/ai-task-manager', trunkRef: 'origin/trunk' },
    projectDir: '/injected/project',
    pexec,
    body: issueBody,
    lifecycleEvidence: null,
    ctx: { resolveCloseParentIssue: async () => null },
  });

  assert.equal(commentReads, 1);
  assert.equal(result.acceptedSha, HEAD);
  assert.equal(result.observedLocalHeadSha, OTHER_HEAD);
  assert.equal(result.pullRequest, null);
  assert.equal(result.records, null);
  assert.equal(result.noCommitRecords.record.record.issueNumber, 1407);
});
