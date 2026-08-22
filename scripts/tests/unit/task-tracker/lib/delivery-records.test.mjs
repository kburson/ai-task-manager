// @story #939
// cspell:ignore NDEKTSV RRFFQ
import { createHash } from 'node:crypto';
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { canonicalRecordJson } from '../../../../task-tracker/lib/github-records/canonical-json.mjs';
import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
  MAX_DELIVERY_REPOSITORY_BYTES,
  parseDeliveryComment,
  projectDeliveryRecords,
  renderDeliveryIntentComment,
  renderDeliveryReceiptComment,
} from '../../../../task-tracker/lib/delivery-records.mjs';

const repository = 'kburson/ai-task-manager';
const issueNumber = 939;
const prNumber = 1400;
const expectedHeadSha = 'a'.repeat(40);
const mergeCommitSha = 'b'.repeat(40);
const context = { repository, issueNumber, prNumber };

function intentInput(overrides = {}) {
  return {
    intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    supersedesIntentId: null,
    issueNumber,
    repository,
    prNumber,
    baseRef: 'trunk',
    headRef: 'codex/939-full-auto-merge',
    expectedHeadSha,
    mergeMethod: 'squash',
    attributionTokens: ['#939'],
    commitTitle: '[#939] Deliver governed PR workflow',
    commitMessage: `PR #1400 source ${expectedHeadSha}\n\n[#939]`,
    provider: 'codex',
    sessionId: 'session-1',
    clientCreatedAt: '2026-08-22T00:00:00.000Z',
    ...overrides,
  };
}

function receiptInput(overrides = {}) {
  return {
    intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    issueNumber,
    prNumber,
    expectedHeadSha,
    mergeCommitSha,
    baseRef: 'trunk',
    mergeMethod: 'squash',
    verifiedTrunkRef: 'origin/trunk',
    provider: 'codex',
    sessionId: 'session-1',
    verifiedAt: '2026-08-22T00:05:00.000Z',
    ...overrides,
  };
}

function parsedIntent(overrides = {}, comment = {}) {
  const intent = buildDeliveryIntent(intentInput(overrides));
  return parseDeliveryComment(
    {
      id: comment.id ?? `IC_${intent.intentId}`,
      body: renderDeliveryIntentComment(intent),
      createdAt: comment.createdAt ?? '2026-08-22T00:01:00.000Z',
    },
    context
  );
}

function parsedReceipt(overrides = {}, comment = {}) {
  const receipt = buildDeliveryReceipt(receiptInput(overrides));
  return parseDeliveryComment(
    {
      id: comment.id ?? `IC_receipt_${receipt.intentId}`,
      body: renderDeliveryReceiptComment(receipt),
      createdAt: comment.createdAt ?? '2026-08-22T00:06:00.000Z',
    },
    context
  );
}

function assertDeepFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

test('builders produce exact versioned schemas, hashes, and deeply frozen values', () => {
  const intent = buildDeliveryIntent(intentInput());
  const multiIssueIntent = buildDeliveryIntent(
    intentInput({
      attributionTokens: ['#1274', '#1275', '#939'],
      commitMessage:
        `PR #1400 source ${expectedHeadSha}\n\n` + 'Attribution: [#939] [#1274] [#1275]',
    })
  );
  const receipt = buildDeliveryReceipt(receiptInput());

  assert.deepEqual(
    Object.keys(intent).sort(),
    [
      'attributionTokens',
      'baseRef',
      'clientCreatedAt',
      'commitMessage',
      'commitMessageSha256',
      'commitTitle',
      'commitTitleSha256',
      'expectedHeadSha',
      'headRef',
      'intentId',
      'issueNumber',
      'mergeMethod',
      'prNumber',
      'provider',
      'repository',
      'schema',
      'sessionId',
      'state',
      'supersedesIntentId',
    ].sort()
  );
  assert.equal(intent.schema, 'aitm.delivery-intent/v1');
  assert.equal(intent.state, 'pending');
  assert.deepEqual(multiIssueIntent.attributionTokens, ['#1274', '#1275', '#939']);
  assert.equal(
    intent.commitTitleSha256,
    createHash('sha256').update(intent.commitTitle).digest('hex')
  );
  assert.equal(
    intent.commitMessageSha256,
    createHash('sha256').update(intent.commitMessage).digest('hex')
  );
  assert.deepEqual(
    Object.keys(receipt).sort(),
    [
      'baseRef',
      'expectedHeadSha',
      'intentId',
      'issueNumber',
      'mergeCommitSha',
      'mergeMethod',
      'prNumber',
      'provider',
      'result',
      'schema',
      'sessionId',
      'verifiedAt',
      'verifiedTrunkRef',
    ].sort()
  );
  assert.equal(receipt.schema, 'aitm.delivery-receipt/v1');
  assert.equal(receipt.result, 'delivered');
  assertDeepFrozen(intent);
  assertDeepFrozen(receipt);
});

test('intent and receipt records round trip every supported merge method', () => {
  for (const mergeMethod of ['merge', 'squash', 'rebase']) {
    const intent = buildDeliveryIntent(intentInput({ mergeMethod }));
    const receipt = buildDeliveryReceipt(receiptInput({ mergeMethod }));
    const parsedIntentRecord = parseDeliveryComment(
      {
        id: `IC_intent_${mergeMethod}`,
        body: renderDeliveryIntentComment(intent),
        createdAt: '2026-08-22T00:01:00.000Z',
      },
      context
    );
    const parsedReceiptRecord = parseDeliveryComment(
      {
        id: `IC_receipt_${mergeMethod}`,
        body: renderDeliveryReceiptComment(receipt),
        createdAt: '2026-08-22T00:06:00.000Z',
      },
      context
    );

    assert.equal(parsedIntentRecord.record.mergeMethod, mergeMethod);
    assert.equal(parsedReceiptRecord.record.mergeMethod, mergeMethod);
  }
});

test('intent and receipt records reject merge methods outside the supported set', () => {
  for (const mergeMethod of ['', 'fast-forward', null, undefined]) {
    assert.throws(
      () => buildDeliveryIntent(intentInput({ mergeMethod })),
      /delivery-records:merge-method/
    );
    assert.throws(
      () => buildDeliveryReceipt(receiptInput({ mergeMethod })),
      /delivery-records:merge-method/
    );
  }
});

test('comments contain one canonical marker and preserve authoritative server metadata', () => {
  const intent = buildDeliveryIntent(intentInput());
  const receipt = buildDeliveryReceipt(receiptInput());
  const intentBody = renderDeliveryIntentComment(intent);
  const receiptBody = renderDeliveryReceiptComment(receipt);

  assert.equal(
    intentBody,
    `<!-- aitm-delivery-intent ${canonicalRecordJson(intent)} -->\n` +
      `Delivery pending for PR #1400 at \`${expectedHeadSha}\`.`
  );
  assert.equal(
    receiptBody,
    `<!-- aitm-delivery-receipt ${canonicalRecordJson(receipt)} -->\n` +
      `Delivery verified for PR #1400 as \`${mergeCommitSha}\` on \`origin/trunk\`.`
  );

  const parsed = parseDeliveryComment(
    {
      id: 'IC_server_comment',
      body: intentBody,
      createdAt: '2026-08-22T01:02:03.000Z',
    },
    context
  );
  assert.deepEqual(parsed, {
    id: 'IC_server_comment',
    createdAt: '2026-08-22T01:02:03.000Z',
    record: intent,
  });
  assert.notEqual(parsed.createdAt, intent.clientCreatedAt);
  assert.equal(
    parseDeliveryComment(
      { id: 'IC_plain', body: 'ordinary comment', createdAt: '2026-08-22T01:02:03.000Z' },
      context
    ),
    null
  );
  assertDeepFrozen(parsed);
});

test('intent comments round trip when bounded payload strings contain delivery marker names', () => {
  const intent = buildDeliveryIntent(
    intentInput({
      provider: 'codex-aitm-delivery-intent',
      sessionId: 'session-aitm-delivery-receipt',
    })
  );
  const parsed = parseDeliveryComment(
    {
      id: 'IC_marker_names_intent',
      body: renderDeliveryIntentComment(intent),
      createdAt: '2026-08-22T01:02:03.000Z',
    },
    context
  );

  assert.deepEqual(parsed.record, intent);
});

test('receipt comments round trip when bounded payload strings contain delivery marker names', () => {
  const receipt = buildDeliveryReceipt(
    receiptInput({
      provider: 'codex-aitm-delivery-intent',
      sessionId: 'session-aitm-delivery-receipt',
    })
  );
  const parsed = parseDeliveryComment(
    {
      id: 'IC_marker_names_receipt',
      body: renderDeliveryReceiptComment(receipt),
      createdAt: '2026-08-22T01:02:03.000Z',
    },
    context
  );

  assert.deepEqual(parsed.record, receipt);
});

test('intent comments reject a second inline hidden delivery marker', () => {
  const intent = buildDeliveryIntent(intentInput());
  const receipt = buildDeliveryReceipt(receiptInput());
  const secondMarker = renderDeliveryReceiptComment(receipt).split('\n')[0];

  assert.throws(
    () =>
      parseDeliveryComment(
        {
          id: 'IC_duplicate_inline_intent',
          body: `${renderDeliveryIntentComment(intent)} ${secondMarker}`,
          createdAt: '2026-08-22T01:02:03.000Z',
        },
        context
      ),
    /delivery-records:malformed-marker/
  );
});

test('receipt comments reject a second inline hidden delivery marker', () => {
  const intent = buildDeliveryIntent(intentInput());
  const receipt = buildDeliveryReceipt(receiptInput());
  const secondMarker = renderDeliveryIntentComment(intent).split('\n')[0];

  assert.throws(
    () =>
      parseDeliveryComment(
        {
          id: 'IC_duplicate_inline_receipt',
          body: `${renderDeliveryReceiptComment(receipt)} ${secondMarker}`,
          createdAt: '2026-08-22T01:02:03.000Z',
        },
        context
      ),
    /delivery-records:malformed-marker/
  );
});

test('builders reject extra keys, malformed identities, unbounded strings, and invalid SHAs', () => {
  for (const input of [
    intentInput({ extra: true }),
    intentInput({ repository: 'not-a-repository' }),
    intentInput({ issueNumber: 0 }),
    intentInput({ prNumber: 0 }),
    intentInput({ expectedHeadSha: 'A'.repeat(40) }),
    intentInput({ expectedHeadSha: 'a'.repeat(39) }),
    intentInput({ headRef: 'bad\nbranch' }),
    intentInput({ commitMessage: 'x'.repeat(64 * 1024) }),
    intentInput({ attributionTokens: ['#939', '#939'] }),
  ]) {
    assert.throws(() => buildDeliveryIntent(input), /delivery-records:/);
  }

  for (const input of [
    receiptInput({ extra: true }),
    receiptInput({ mergeCommitSha: 'b'.repeat(39) }),
    receiptInput({ expectedHeadSha: 'g'.repeat(40) }),
    receiptInput({ verifiedTrunkRef: 'origin/other' }),
    receiptInput({ verifiedAt: 'not-an-instant' }),
  ]) {
    assert.throws(() => buildDeliveryReceipt(input), /delivery-records:/);
  }
});

test('repository names accept the normal form and reject more than 256 UTF-8 bytes', () => {
  assert.equal(buildDeliveryIntent(intentInput()).repository, repository);
  const overBoundRepository = `${'a'.repeat(MAX_DELIVERY_REPOSITORY_BYTES)}/r`;

  assert.throws(
    () => buildDeliveryIntent(intentInput({ repository: overBoundRepository })),
    /delivery-records:repository/
  );
});

test('parser rejects malformed marker-like comments and noncanonical record bytes', () => {
  const intent = buildDeliveryIntent(intentInput());
  const noncanonical = JSON.stringify(intent);
  const bodies = [
    '<!-- aitm-delivery-intent -->',
    `prefix <!-- aitm-delivery-intent ${canonicalRecordJson(intent)} -->`,
    `<!-- aitm-delivery-intent ${canonicalRecordJson(intent)} -->\n<!-- aitm-delivery-intent ${canonicalRecordJson(intent)} -->`,
    `<!-- aitm-delivery-intent ${noncanonical} -->`,
    '<!-- aitm-delivery-receipt { -->',
    '<!-- aitm-delivery-intent {}',
  ];
  for (const body of bodies) {
    assert.throws(
      () =>
        parseDeliveryComment(
          { id: 'IC_malformed', body, createdAt: '2026-08-22T01:02:03.000Z' },
          context
        ),
      /delivery-records:/
    );
  }
});

test('parser enforces repository, issue, PR, exact record keys, and server createdAt correlation', () => {
  const intent = buildDeliveryIntent(intentInput());
  const body = renderDeliveryIntentComment(intent);
  const validComment = { id: 'IC_context', body, createdAt: '2026-08-22T01:02:03.000Z' };

  for (const otherContext of [
    { ...context, repository: 'kburson/other' },
    { ...context, issueNumber: 940 },
    { ...context, prNumber: 1401 },
  ]) {
    assert.throws(() => parseDeliveryComment(validComment, otherContext), /delivery-records:/);
  }
  assert.throws(
    () => parseDeliveryComment({ id: 'IC_context', body }, context),
    /delivery-records:comment-created-at/
  );

  const extraKeyRecord = { ...intent, extra: true };
  const extraKeyBody = `<!-- aitm-delivery-intent ${canonicalRecordJson(extraKeyRecord)} -->`;
  assert.throws(
    () => parseDeliveryComment({ ...validComment, body: extraKeyBody }, context),
    /delivery-records:intent-keys/
  );
});

test('projection computes superseded effective state and the live matching receipt', () => {
  const original = parsedIntent();
  const replacementId = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
  const replacement = parsedIntent(
    {
      intentId: replacementId,
      supersedesIntentId: original.record.intentId,
      expectedHeadSha: 'c'.repeat(40),
      commitMessage: `PR #1400 source ${'c'.repeat(40)}\n\n[#939]`,
      clientCreatedAt: '2026-08-22T00:02:00.000Z',
    },
    { id: 'IC_replacement', createdAt: '2026-08-22T00:03:00.000Z' }
  );
  const receipt = parsedReceipt(
    {
      intentId: replacementId,
      expectedHeadSha: 'c'.repeat(40),
    },
    { id: 'IC_receipt', createdAt: '2026-08-22T00:07:00.000Z' }
  );
  const projection = projectDeliveryRecords([original, replacement, receipt]);

  assert.equal(projection.intents.length, 2);
  assert.equal(projection.intents[0].effectiveState, 'superseded');
  assert.equal(projection.intents[1].effectiveState, 'pending');
  assert.equal(projection.liveIntent.id, 'IC_replacement');
  assert.equal(projection.matchingReceipt.id, 'IC_receipt');
  assert.deepEqual(projection.receipts, [receipt]);
  assertDeepFrozen(projection);
});

test('projection rejects duplicate IDs, missing links, cycles, forks, and multiple live tips', () => {
  const firstId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
  const secondId = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
  const thirdId = '01ARZ3NDEKTSV4RRFFQ69G5FAX';
  const first = parsedIntent({ intentId: firstId });
  const duplicate = parsedIntent({ intentId: firstId }, { id: 'IC_duplicate' });
  const duplicateComment = parsedIntent(
    {
      intentId: secondId,
      expectedHeadSha: 'e'.repeat(40),
      commitMessage: `PR #1400 source ${'e'.repeat(40)}\n\n[#939]`,
    },
    { id: first.id }
  );
  const missing = parsedIntent({ intentId: secondId, supersedesIntentId: thirdId });
  const cycleFirst = parsedIntent({ intentId: firstId, supersedesIntentId: secondId });
  const cycleSecond = parsedIntent({ intentId: secondId, supersedesIntentId: firstId });
  const forkFirst = parsedIntent({ intentId: secondId, supersedesIntentId: firstId });
  const forkSecond = parsedIntent({ intentId: thirdId, supersedesIntentId: firstId });
  const unrelated = parsedIntent({
    intentId: secondId,
    expectedHeadSha: 'd'.repeat(40),
    commitMessage: `PR #1400 source ${'d'.repeat(40)}\n\n[#939]`,
  });

  for (const [records, error] of [
    [[first, duplicate], /duplicate-intent-id/],
    [[first, duplicateComment], /duplicate-comment-id/],
    [[missing], /missing-superseded-intent/],
    [[cycleFirst, cycleSecond], /supersession-cycle/],
    [[first, forkFirst, forkSecond], /supersession-fork/],
    [[first, unrelated], /multiple-live-intents/],
  ]) {
    assert.throws(() => projectDeliveryRecords(records), error);
  }
});

test('projection rejects a replacement that names an intent appearing later in comment order', () => {
  const firstId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
  const secondId = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
  const thirdId = '01ARZ3NDEKTSV4RRFFQ69G5FAX';
  const first = parsedIntent({ intentId: firstId });
  const third = parsedIntent({ intentId: thirdId, supersedesIntentId: secondId });
  const second = parsedIntent({ intentId: secondId, supersedesIntentId: firstId });

  assert.throws(
    () => projectDeliveryRecords([first, third, second]),
    /delivery-records:supersession-order/
  );
});

test('projection rejects same-key divergent authorized bytes', () => {
  const original = parsedIntent();
  const divergent = parsedIntent(
    {
      intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
      supersedesIntentId: original.record.intentId,
      commitTitle: '[#939] Different authorized title',
    },
    { id: 'IC_divergent' }
  );
  assert.throws(
    () => projectDeliveryRecords([original, divergent]),
    /delivery-records:same-key-divergence/
  );
});

test('projection rejects orphaned, mismatched, duplicate, and conflicting receipts', () => {
  const intent = parsedIntent();
  const valid = parsedReceipt();
  const duplicate = parsedReceipt({}, { id: 'IC_receipt_duplicate' });
  const conflict = parsedReceipt({ mergeCommitSha: 'c'.repeat(40) }, { id: 'IC_receipt_conflict' });
  const orphan = parsedReceipt({ intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAW' });
  const mismatch = parsedReceipt({ expectedHeadSha: 'c'.repeat(40) });

  for (const [records, error] of [
    [[orphan], /missing-receipt-intent/],
    [[intent, mismatch], /receipt-correlation/],
    [[intent, valid, duplicate], /duplicate-receipt/],
    [[intent, valid, conflict], /receipt-conflict/],
  ]) {
    assert.throws(() => projectDeliveryRecords(records), error);
  }
});

test('receipt authority follows comment order while retaining superseded-intent receipts', () => {
  const intent = parsedIntent();
  const receipt = parsedReceipt();

  assert.throws(() => projectDeliveryRecords([receipt, intent]), /delivery-records:receipt-order/);
  assert.equal(projectDeliveryRecords([intent, receipt]).matchingReceipt.id, receipt.id);

  const replacement = parsedIntent(
    {
      intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
      supersedesIntentId: intent.record.intentId,
      expectedHeadSha: 'c'.repeat(40),
      commitMessage: `PR #1400 source ${'c'.repeat(40)}\n\n[#939]`,
      clientCreatedAt: '2026-08-22T00:07:00.000Z',
    },
    { id: 'IC_recovery', createdAt: '2026-08-22T00:08:00.000Z' }
  );
  const recoveryProjection = projectDeliveryRecords([intent, receipt, replacement]);

  assert.equal(recoveryProjection.liveIntent.id, replacement.id);
  assert.equal(recoveryProjection.matchingReceipt, null);
  assert.deepEqual(recoveryProjection.receipts, [receipt]);
});
