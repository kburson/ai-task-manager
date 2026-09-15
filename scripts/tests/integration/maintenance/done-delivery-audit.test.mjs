// @story #1633
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  auditDoneDelivery,
  parseReportMetadata,
  renderDoneDeliveryReport,
  selectDoneIssues,
  verifyDoneDeliveryReport,
} from '../../../maintenance/audit-done-delivery.mjs';

const SINCE = '2026-09-01T05:00:00.000Z';
const SNAPSHOT = '2026-09-15T14:00:00.000Z';
const TRUNK_SHA = 'f'.repeat(40);

function body({
  number,
  doneAt = '2026-09-10T12:00:00.000Z',
  kind = 'code',
  branch = `codex/issue-${number}`,
  acceptedSha = 'a'.repeat(40),
} = {}) {
  return `## AITM Progress Markers

<!-- aitm-issue-kind kind="${kind}" -->
<!-- aitm-worktree-location worktree="/tmp/${number}" branch="${branch}" sid="session" ts="2026-09-10T10:00:00.000Z" -->
${acceptedSha ? `<!-- aitm-delivered-close schema="aitm.delivered-close/v1" tx="tx" issue="${number}" accepted-sha="${acceptedSha}" review-authority="gate-bypassed" completed="[]" -->` : ''}
<!-- aitm-entered-done ts="${doneAt}" move="move:test" -->`;
}

function issue(number, overrides = {}) {
  return {
    number,
    title: overrides.title ?? `Issue ${number}`,
    state: 'closed',
    htmlUrl: `https://github.com/o/r/issues/${number}`,
    body: body({ number, ...overrides }),
    comments: overrides.comments ?? [],
  };
}

function receiptComment({
  issueNumber,
  acceptedSha = 'a'.repeat(40),
  mergeSha = 'b'.repeat(40),
  prNumber = 42,
  method = 'squash',
} = {}) {
  const intentId = '01000000000000000000000000';
  return {
    id: '1',
    createdAt: '2026-09-10T11:00:00.000Z',
    body: `<!-- aitm-delivery-receipt ${JSON.stringify({
      baseRef: 'trunk',
      expectedHeadSha: acceptedSha,
      intentId,
      issueNumber,
      mergeCommitSha: mergeSha,
      mergeMethod: method,
      prNumber,
      provider: 'codex',
      result: 'delivered',
      schema: 'aitm.delivery-receipt/v1',
      sessionId: 'session',
      verifiedAt: '2026-09-10T11:00:00.000Z',
      verifiedTrunkRef: 'origin/trunk',
    })} -->`,
  };
}

function noCommitComment({ issueNumber, kind = 'audit', acceptedSha = 'c'.repeat(40) } = {}) {
  return {
    id: '2',
    createdAt: '2026-09-10T11:00:00.000Z',
    body: `<!-- aitm-no-commit-delivery ${JSON.stringify({
      acceptedSha,
      deliverableUrl: `https://github.com/o/r/issues/${issueNumber}#issuecomment-2`,
      issueKind: kind,
      issueNumber,
      provider: 'codex',
      recordId: '01000000000000000000000000',
      repository: 'o/r',
      result: 'delivered',
      schema: 'aitm.no-commit-delivery/v1',
      sessionId: 'session',
      verifiedAt: '2026-09-10T11:00:00.000Z',
    })} -->`,
  };
}

function ports(overrides = {}) {
  return {
    async commitExists() {
      return true;
    },
    async isAncestor(sha) {
      return sha === TRUNK_SHA;
    },
    async findAttributedTrunkCommits() {
      return [];
    },
    async listAssociatedPullRequests() {
      return [];
    },
    ...overrides,
  };
}

test('selectDoneIssues uses exact Done markers, frozen inclusive bounds, and one row per issue', () => {
  const legacy = issue(6, { doneAt: SINCE });
  legacy.body = legacy.body.replace(
    `<!-- aitm-entered-done ts="${SINCE}" move="move:test" -->`,
    `<!-- aitm-entered-done: ${SINCE} -->`
  );
  const reentered = issue(7, { doneAt: '2026-08-31T12:00:00.000Z' });
  reentered.body += `\n<!-- aitm-entered-done-2 ts="${SNAPSHOT}" move="move:again" -->`;
  const selected = selectDoneIssues(
    [
      issue(1, { doneAt: SINCE }),
      issue(2, { doneAt: SNAPSHOT }),
      issue(3, { doneAt: '2026-09-01T04:59:59.999Z' }),
      issue(4, { doneAt: '2026-09-15T14:00:00.001Z' }),
      { ...issue(5), body: 'mentions aitm-entered-done but has no marker' },
      issue(2, { title: 'duplicate API page', doneAt: SNAPSHOT }),
      legacy,
      reentered,
    ],
    { since: SINCE, snapshot: SNAPSHOT }
  );
  assert.deepEqual(
    selected.map(({ number }) => number),
    [1, 6, 2, 7]
  );
  assert.equal(selected.at(-1).doneMarkerCount, 2);
});

test('receipt-backed squash verifies only with correlated live PR and landed trunk commit', async () => {
  const acceptedSha = 'a'.repeat(40);
  const mergeSha = 'b'.repeat(40);
  const input = issue(10, {
    acceptedSha,
    comments: [receiptComment({ issueNumber: 10, acceptedSha, mergeSha })],
  });
  const result = await auditDoneDelivery({
    issues: [input],
    since: SINCE,
    snapshot: SNAPSHOT,
    repository: 'o/r',
    trunkRef: 'trunk',
    trunkSha: TRUNK_SHA,
    recoveries: new Map(),
    ports: ports({
      async isAncestor(sha) {
        return sha === mergeSha;
      },
      async listAssociatedPullRequests(sha) {
        assert.equal(sha, mergeSha);
        return [
          {
            number: 42,
            state: 'closed',
            mergedAt: '2026-09-10T11:00:00Z',
            baseRef: 'trunk',
            headRef: 'codex/issue-10',
            headSha: acceptedSha,
            mergeCommitSha: mergeSha,
            mergeMethod: 'squash',
            url: 'https://github.com/o/r/pull/42',
          },
        ];
      },
    }),
  });
  assert.equal(result.rows[0].classification, 'verified');
  assert.equal(result.rows[0].prNumber, 42);
  assert.equal(result.rows[0].trunkEvidence, `landed:${mergeSha}`);
});

test('historical squash reconstruction verifies an attributed landed commit with matching PR head', async () => {
  const acceptedSha = 'd'.repeat(40);
  const landedSha = 'e'.repeat(40);
  const result = await auditDoneDelivery({
    issues: [issue(1178, { kind: 'epic', branch: 'feature/epic/1178', acceptedSha })],
    since: SINCE,
    snapshot: SNAPSHOT,
    repository: 'o/r',
    trunkRef: 'trunk',
    trunkSha: TRUNK_SHA,
    recoveries: new Map(),
    ports: ports({
      async isAncestor(sha) {
        return sha === landedSha;
      },
      async findAttributedTrunkCommits(number) {
        assert.equal(number, 1178);
        return [{ sha: landedSha, subject: '[#1178] delivered' }];
      },
      async listAssociatedPullRequests() {
        return [
          {
            number: 1478,
            state: 'closed',
            mergedAt: '2026-09-01T07:34:23Z',
            baseRef: 'trunk',
            headRef: 'feature/epic/1178',
            headSha: acceptedSha,
            mergeCommitSha: landedSha,
            mergeMethod: 'squash',
            url: 'https://github.com/o/r/pull/1478',
          },
        ];
      },
    }),
  });
  assert.equal(result.rows[0].classification, 'verified');
  assert.equal(result.rows[0].evidenceBasis, 'reconstructed-trunk-pr');
});

test('root epic no-commit record is false-Done while a genuine audit artifact is local-only', async () => {
  const epicSha = '1'.repeat(40);
  const auditSha = '2'.repeat(40);
  const result = await auditDoneDelivery({
    issues: [
      issue(1624, {
        kind: 'epic',
        branch: 'feature/epic/1624',
        acceptedSha: epicSha,
        comments: [noCommitComment({ issueNumber: 1624, kind: 'epic', acceptedSha: epicSha })],
      }),
      issue(20, {
        kind: 'audit',
        branch: 'audit/20',
        acceptedSha: auditSha,
        comments: [noCommitComment({ issueNumber: 20, kind: 'audit', acceptedSha: auditSha })],
      }),
    ],
    since: SINCE,
    snapshot: SNAPSHOT,
    repository: 'o/r',
    trunkRef: 'trunk',
    trunkSha: TRUNK_SHA,
    recoveries: new Map([[1624, 99]]),
    ports: ports(),
  });
  assert.equal(result.rows.find(({ number }) => number === 1624).classification, 'false-Done');
  assert.equal(
    result.rows.find(({ number }) => number === 20).classification,
    'explicitly-local-only'
  );
});

test('missing accepted authority fails closed and report verification requires recovery coverage', async () => {
  const result = await auditDoneDelivery({
    issues: [issue(30, { acceptedSha: '' })],
    since: SINCE,
    snapshot: SNAPSHOT,
    repository: 'o/r',
    trunkRef: 'trunk',
    trunkSha: TRUNK_SHA,
    recoveries: new Map(),
    ports: ports(),
  });
  assert.equal(result.rows[0].classification, 'indeterminate');
  assert.throws(() => renderDoneDeliveryReport(result, { requireRecoveries: true }), /recovery/);

  result.rows[0].recoveryIssue = 100;
  const markdown = renderDoneDeliveryReport(result, { requireRecoveries: true });
  const metadata = parseReportMetadata(markdown);
  assert.equal(metadata.snapshot, SNAPSHOT);
  assert.equal(metadata.inventoryCount, 1);
  assert.doesNotThrow(() => verifyDoneDeliveryReport(markdown, markdown));
  assert.throws(
    () => verifyDoneDeliveryReport(markdown, markdown.replace('Issue 30', 'changed')),
    /does not match/
  );
});

test('superseded Done records are terminal dispositions, not false delivery claims', async () => {
  const superseded = issue(40, { acceptedSha: '' });
  superseded.body += '\n<!-- aitm-superseded-by refs="#41" ts="2026-09-10T11:00:00.000Z" -->';
  const result = await auditDoneDelivery({
    issues: [superseded],
    since: SINCE,
    snapshot: SNAPSHOT,
    repository: 'o/r',
    trunkRef: 'trunk',
    trunkSha: TRUNK_SHA,
    recoveries: new Map(),
    ports: ports(),
  });
  assert.equal(result.rows[0].classification, 'terminal-disposition-exception');
  assert.equal(result.rows[0].recoveryIssue, 41);
});

test('superseded marker cannot mask an accepted but undelivered SHA', async () => {
  const superseded = issue(42, { acceptedSha: '4'.repeat(40) });
  superseded.body += '\n<!-- aitm-superseded-by refs="#43" ts="2026-09-10T11:00:00.000Z" -->';
  const result = await auditDoneDelivery({
    issues: [superseded],
    since: SINCE,
    snapshot: SNAPSHOT,
    repository: 'o/r',
    trunkRef: 'trunk',
    trunkSha: TRUNK_SHA,
    recoveries: new Map([[42, 100]]),
    ports: ports(),
  });
  assert.equal(result.rows[0].classification, 'false-Done');
  assert.equal(result.rows[0].recoveryIssue, 100);
});

test('legacy main-thread attribution is an explicit exception without an accepted SHA', async () => {
  const landedSha = '9'.repeat(40);
  const result = await auditDoneDelivery({
    issues: [issue(50, { acceptedSha: '', branch: 'trunk' })],
    since: SINCE,
    snapshot: SNAPSHOT,
    repository: 'o/r',
    trunkRef: 'trunk',
    trunkSha: TRUNK_SHA,
    recoveries: new Map(),
    ports: ports({
      async isAncestor(sha) {
        return sha === landedSha;
      },
      async findAttributedTrunkCommits() {
        return [{ sha: landedSha, subject: '[#50] legacy direct delivery' }];
      },
    }),
  });
  assert.equal(result.rows[0].classification, 'main-thread-exception');
  assert.equal(result.rows[0].trunkEvidence, `landed:${landedSha}`);
});
