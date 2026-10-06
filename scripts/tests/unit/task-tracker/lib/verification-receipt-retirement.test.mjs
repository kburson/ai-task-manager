// @story #1481 #1887
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createVerificationReceipt,
  parseVerificationReceipt,
  upsertVerificationReceipt,
} from '../../../../task-tracker/lib/verification-receipt.mjs';
import {
  planStaleTestReceiptRetirement,
  retireVerificationReceipt,
  retireVerificationReceiptMarker,
} from '../../../../task-tracker/lib/verification-receipt-retirement.mjs';

const ISSUE = 1481;
const SHA = 'a'.repeat(40);
const INSTANT = '2026-09-01T18:00:00.000Z';

function receipt(stage, issueNumber = ISSUE) {
  return createVerificationReceipt({
    issueNumber,
    stage,
    fingerprint: {
      commitSha: SHA,
      verificationCommands: [['npm', 'test']],
      environment: {
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        lockfileHash: `sha256:${'b'.repeat(64)}`,
        configHashes: {},
        sandbox: { kind: 'worktree', identity: '/sandbox', clean: true },
      },
    },
    commands: [
      {
        classification: 'test-unit',
        command: 'npm',
        args: ['run', 'test:unit'],
        exitCode: 0,
        durationMs: 1,
      },
    ],
    now: () => INSTANT,
  });
}

function fixture() {
  let body = [
    '<!-- aitm-last-known-state: test -->',
    '## Verification Commands',
    '- [ ] `npm test`',
  ].join('\n');
  const develop = receipt('develop-final');
  body = upsertVerificationReceipt(body, develop);
  const testReceipt = receipt('test');
  body = upsertVerificationReceipt(body, testReceipt);
  return { body, develop, testReceipt };
}

test('retires only the exact stage and receipt identity', () => {
  const { body, develop, testReceipt } = fixture();
  const result = retireVerificationReceiptMarker(body, {
    expectedIssue: ISSUE,
    stage: 'test',
    receiptId: testReceipt.receiptId,
  });

  assert.equal(result.status, 'retired');
  assert.equal(result.receipt.receiptId, testReceipt.receiptId);
  assert.equal(parseVerificationReceipt(result.body, 'test'), null);
  assert.equal(parseVerificationReceipt(result.body, 'develop-final').receiptId, develop.receiptId);
  assert.ok(result.removedRange.start < result.removedRange.end);
  assert.equal(
    result.body,
    body.slice(0, result.removedRange.start) + body.slice(result.removedRange.end)
  );
});

test('is idempotent when the exact identity is already absent', () => {
  const { body, testReceipt } = fixture();
  const first = retireVerificationReceiptMarker(body, {
    expectedIssue: ISSUE,
    stage: 'test',
    receiptId: testReceipt.receiptId,
  });
  assert.deepEqual(
    retireVerificationReceiptMarker(first.body, {
      expectedIssue: ISSUE,
      stage: 'test',
      receiptId: testReceipt.receiptId,
    }),
    { status: 'already-absent', body: first.body }
  );
});

test('fails closed on wrong issue, duplicate target, malformed claim, and missing identity', () => {
  const { body, testReceipt } = fixture();
  const marker = body.match(/<!--\s*aitm-verification-receipt\s+stage="test"[^>]*-->/)[0];

  assert.throws(
    () =>
      retireVerificationReceiptMarker(body, {
        expectedIssue: ISSUE + 1,
        stage: 'test',
        receiptId: testReceipt.receiptId,
      }),
    /invalid claimed evidence/i
  );
  assert.throws(
    () =>
      retireVerificationReceiptMarker(`${body}\n${marker}`, {
        expectedIssue: ISSUE,
        stage: 'test',
        receiptId: testReceipt.receiptId,
      }),
    /ambiguous target/i
  );
  assert.throws(
    () =>
      retireVerificationReceiptMarker(
        `${body}\n<!-- aitm-verification-receipt stage="review" data="not-json" -->`,
        { expectedIssue: ISSUE, stage: 'test', receiptId: testReceipt.receiptId }
      ),
    /malformed claimed payload/i
  );
  assert.throws(
    () => retireVerificationReceiptMarker(body, { expectedIssue: ISSUE, stage: 'test' }),
    /receiptId is required/i
  );
});

test('governed retirement mutates a fresh base and verifies write plus fresh read-back', async () => {
  const { body: initial, testReceipt } = fixture();
  let liveBody = initial;
  let allowMarkerLoss = false;
  const result = await retireVerificationReceipt({
    cfg: { repo: 'o/r' },
    issueNumber: ISSUE,
    stage: 'test',
    receiptId: testReceipt.receiptId,
    deps: {
      mutateIssueBody: async ({ mutate, allowMarkerLoss: allow }) => {
        allowMarkerLoss = allow;
        liveBody = mutate(liveBody);
        return { status: 'ok', body: liveBody };
      },
      fetchBody: async () => liveBody,
    },
  });

  assert.equal(result.status, 'retired');
  assert.equal(allowMarkerLoss, true);
  assert.equal(result.body, liveBody);
  assert.equal(parseVerificationReceipt(liveBody, 'test'), null);
});

test('governed retirement refuses failed writes and either read-back retaining the target', async () => {
  const { body, testReceipt } = fixture();
  const input = {
    cfg: { repo: 'o/r' },
    issueNumber: ISSUE,
    stage: 'test',
    receiptId: testReceipt.receiptId,
  };

  await assert.rejects(
    retireVerificationReceipt({
      ...input,
      deps: {
        mutateIssueBody: async () => {
          throw new Error('write refused');
        },
      },
    }),
    /write refused/i
  );
  await assert.rejects(
    retireVerificationReceipt({
      ...input,
      deps: {
        mutateIssueBody: async () => ({ status: 'ok', body }),
        fetchBody: async () => body,
      },
    }),
    /verified write body still contains target/i
  );
  await assert.rejects(
    retireVerificationReceipt({
      ...input,
      deps: {
        mutateIssueBody: async ({ mutate }) => ({ status: 'ok', body: mutate(body) }),
        fetchBody: async () => body,
      },
    }),
    /fresh read-back still contains target/i
  );
});

test('stale projection removes only one exact Test claim and keeps other evidence', () => {
  const { body, develop, testReceipt } = fixture();
  const projected = planStaleTestReceiptRetirement(body, {
    expectedIssue: ISSUE,
    head: 'd'.repeat(40),
  });
  assert.equal(projected.receipt.receiptId, testReceipt.receiptId);
  assert.equal(parseVerificationReceipt(projected.body, 'test'), null);
  assert.equal(
    parseVerificationReceipt(projected.body, 'develop-final').receiptId,
    develop.receiptId
  );
  assert.equal(parseVerificationReceipt(body, 'test').receiptId, testReceipt.receiptId);
});

test('current and absent Test receipts are retained without eligibility', () => {
  const { body } = fixture();
  assert.deepEqual(planStaleTestReceiptRetirement(body, { expectedIssue: ISSUE, head: SHA }), {
    body,
    receipt: null,
  });
  assert.deepEqual(
    planStaleTestReceiptRetirement('ordinary body', { expectedIssue: ISSUE, head: SHA }),
    { body: 'ordinary body', receipt: null }
  );
});

test('stale projection refuses malformed foreign ambiguous and missing authority', () => {
  const { body, testReceipt } = fixture();
  const marker = upsertVerificationReceipt('', testReceipt);
  const different = upsertVerificationReceipt('', receipt('test'));
  for (const source of [
    body + marker,
    body + different,
    upsertVerificationReceipt(body, receipt('test', ISSUE + 1)),
    body + '<!-- aitm-verification-receipt stage="test" data="not-json" -->',
  ]) {
    assert.throws(() =>
      planStaleTestReceiptRetirement(source, { expectedIssue: ISSUE, head: 'd'.repeat(40) })
    );
  }
  assert.throws(() =>
    planStaleTestReceiptRetirement(body, { expectedIssue: ISSUE, head: 'short' })
  );
  assert.throws(() => planStaleTestReceiptRetirement(body, { head: SHA }));
});

test('stale retirement refuses fresh-base eligibility drift before writing', async () => {
  const { body, testReceipt } = fixture();
  const head = 'd'.repeat(40);
  const currentClaim = upsertVerificationReceipt(body, { ...testReceipt, commitSha: head });
  const competingClaim = body + upsertVerificationReceipt('', receipt('test'));
  for (const freshBody of [currentClaim, competingClaim]) {
    let writes = 0;
    await assert.rejects(
      retireVerificationReceipt({
        cfg: { repo: 'o/r' },
        issueNumber: ISSUE,
        stage: 'test',
        receiptId: testReceipt.receiptId,
        staleHead: head,
        deps: {
          mutateIssueBody: async ({ mutate }) => {
            const next = mutate(freshBody);
            writes += 1;
            return { status: 'ok', body: next };
          },
          fetchBody: async () => '',
        },
      })
    );
    assert.equal(writes, 0);
  }
});
