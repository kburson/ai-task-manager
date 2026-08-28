// @story #1381
// cspell:ignore NDEKTSV RRFFQ uncheckpointed
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorizeIncorporatedClose,
  INCORPORATED_CLOSE_STEPS,
  projectExactDeliveryReceipt,
  projectIncorporatedCloseReviewAuthority,
  runIncorporatedClose,
} from '../../../../task-tracker/lib/incorporated-close.mjs';
import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
  renderDeliveryIntentComment,
  renderDeliveryReceiptComment,
} from '../../../../task-tracker/lib/delivery-records.mjs';

const SHA = (digit) => digit.repeat(40);
const repository = 'kburson/ai-task-manager';
const row = Object.freeze({
  issueNumber: 1403,
  intendedOutcome: 'incorporated',
  acceptedSha: 'ec160af0b03df8453fa0a1ad7f91b7138aeda38d',
  prNumber: 1404,
  prHeadSha: 'ec160af0b03df8453fa0a1ad7f91b7138aeda38d',
  mergeSha: '19c6f54b0354699b988c470a99f122edab3aa2ba',
  codeOnTrunk: true,
  codeOnTrunkBasis: 'carrier-pr',
  blocker:
    'historical merge method and missing governed intent/receipt prohibit ordinary Delivered close',
});

function authority(overrides = {}) {
  return {
    repository,
    convergenceIssue: 1381,
    incidentIssue: 939,
    ledgerId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    ledgerDigest: `sha256:${'b'.repeat(64)}`,
    approvalRecordId: '01ARZ3NDEKTSV4RRFFQ69G5FAB',
    ledgerPayload: { rows: [row] },
    projection: { approvedLedgerIncorporated: [] },
    ...overrides,
  };
}

function live(overrides = {}) {
  return {
    issueNumber: 1403,
    issueState: 'OPEN',
    issueStateReason: '',
    closeTransactionPresent: false,
    acceptedEvidenceValid: true,
    reviewAuthorizationValid: true,
    reviewAuthorization: { mode: 'full-auto', source: 'session' },
    acceptedSha: row.acceptedSha,
    pullRequest: {
      number: 1404,
      headRefOid: row.prHeadSha,
      mergeCommitSha: row.mergeSha,
    },
    sourceOnTrunk: true,
    trunkSha: SHA('c'),
    deliveryReceiptStatus: 'absent',
    blockerCarriers: { labelCleared: true, fieldCleared: true, bodyCleared: true },
    ...overrides,
  };
}

function authorize(overrides = {}) {
  return authorizeIncorporatedClose({
    repository,
    issueNumber: 1403,
    convergenceIssue: 1381,
    records: [],
    live: live(),
    deps: { resolveApprovedIncidentLedger: () => authority() },
    ...overrides,
  });
}

test('Incorporated authorization binds #1403 to its approved carrier-only ledger row', () => {
  const result = authorize();
  assert.equal(result.issueNumber, 1403);
  assert.equal(result.convergenceIssue, 1381);
  assert.equal(result.prNumber, 1404);
  assert.equal(result.ledgerId, authority().ledgerId);
  assert.equal(Object.isFrozen(result), true);
});

test('Incorporated refuses any owner other than #1381 and any missing approved row', () => {
  assert.throws(
    () => authorize({ convergenceIssue: 1382 }),
    /incorporated-close:convergence-owner/
  );
  assert.throws(
    () =>
      authorize({
        deps: {
          resolveApprovedIncidentLedger: () =>
            authority({
              ledgerPayload: { rows: [{ ...row, intendedOutcome: 'close-delivered' }] },
            }),
        },
      }),
    /incorporated-close:approved-row/
  );
});

test('PR #1404 is carrier evidence, never an ordinary delivery receipt', () => {
  assert.throws(
    () => authorize({ live: live({ deliveryReceiptStatus: 'present' }) }),
    /incorporated-close:delivery-receipt-exists/
  );
  assert.throws(
    () => authorize({ live: live({ deliveryReceiptStatus: undefined }) }),
    /incorporated-close:delivery-receipt-conflict/
  );
  assert.throws(
    () => authorize({ live: live({ pullRequest: { ...live().pullRequest, number: 1405 } }) }),
    /incorporated-close:carrier-evidence/
  );
  assert.throws(
    () => authorize({ live: live({ sourceOnTrunk: false }) }),
    /incorporated-close:trunk-evidence/
  );
});

test('malformed delivery claims prove conflict, not receipt absence', () => {
  assert.deepEqual(
    projectExactDeliveryReceipt({
      comments: [],
      repository,
      issueNumber: 1403,
      prNumber: 1404,
      acceptedSha: row.acceptedSha,
    }),
    { status: 'absent' }
  );
  assert.throws(
    () =>
      projectExactDeliveryReceipt({
        comments: [
          {
            id: 'bad',
            createdAt: '2026-08-28T00:00:00.000Z',
            body: '<!-- aitm-delivery-receipt {not-json} -->',
          },
        ],
        repository,
        issueNumber: 1403,
        prNumber: 1404,
        acceptedSha: row.acceptedSha,
      }),
    /incorporated-close:delivery-receipt-conflict/
  );
});

test('an exact-head delivery receipt is positively detected and duplicate receipt history conflicts', () => {
  const intentId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
  const intent = buildDeliveryIntent({
    intentId,
    supersedesIntentId: null,
    issueNumber: 1403,
    repository,
    prNumber: 1404,
    baseRef: 'trunk',
    headRef: 'codex/1403',
    expectedHeadSha: row.acceptedSha,
    mergeMethod: 'squash',
    attributionTokens: ['#1403'],
    commitTitle: '[#1403] Historical carrier',
    commitMessage: `PR #1404 source ${row.acceptedSha}\n\n[#1403]`,
    provider: 'codex',
    sessionId: 'session-1403',
    clientCreatedAt: '2026-08-28T00:00:00.000Z',
  });
  const receipt = buildDeliveryReceipt({
    intentId,
    issueNumber: 1403,
    prNumber: 1404,
    expectedHeadSha: row.acceptedSha,
    mergeCommitSha: row.mergeSha,
    baseRef: 'trunk',
    mergeMethod: 'squash',
    verifiedTrunkRef: 'origin/trunk',
    provider: 'codex',
    sessionId: 'session-1403',
    verifiedAt: '2026-08-28T00:02:00.000Z',
  });
  const comments = [
    {
      id: 'intent',
      body: renderDeliveryIntentComment(intent),
      createdAt: '2026-08-28T00:01:00.000Z',
    },
    {
      id: 'receipt',
      body: renderDeliveryReceiptComment(receipt),
      createdAt: '2026-08-28T00:02:00.000Z',
    },
  ];
  assert.equal(
    projectExactDeliveryReceipt({
      comments,
      repository,
      issueNumber: 1403,
      prNumber: 1404,
      acceptedSha: row.acceptedSha,
    }).status,
    'present'
  );
  assert.throws(
    () =>
      projectExactDeliveryReceipt({
        comments: [...comments, { ...comments[1], id: 'receipt-copy' }],
        repository,
        issueNumber: 1403,
        prNumber: 1404,
        acceptedSha: row.acceptedSha,
      }),
    /incorporated-close:delivery-receipt-conflict/
  );
});

test('an exact-head receipt on a superseded intent is present and multiple exact receipts conflict', () => {
  const firstIntentId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
  const secondIntentId = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
  const intentInput = {
    supersedesIntentId: null,
    issueNumber: 1403,
    repository,
    prNumber: 1404,
    baseRef: 'trunk',
    headRef: 'codex/1403',
    expectedHeadSha: row.acceptedSha,
    mergeMethod: 'squash',
    attributionTokens: ['#1403'],
    commitTitle: '[#1403] Historical carrier',
    commitMessage: `PR #1404 source ${row.acceptedSha}\n\n[#1403]`,
    provider: 'codex',
    sessionId: 'session-1403',
  };
  const firstIntent = buildDeliveryIntent({
    ...intentInput,
    intentId: firstIntentId,
    clientCreatedAt: '2026-08-28T00:00:00.000Z',
  });
  const firstReceipt = buildDeliveryReceipt({
    intentId: firstIntentId,
    issueNumber: 1403,
    prNumber: 1404,
    expectedHeadSha: row.acceptedSha,
    mergeCommitSha: row.mergeSha,
    baseRef: 'trunk',
    mergeMethod: 'squash',
    verifiedTrunkRef: 'origin/trunk',
    provider: 'codex',
    sessionId: 'session-1403',
    verifiedAt: '2026-08-28T00:02:00.000Z',
  });
  const secondIntent = buildDeliveryIntent({
    ...intentInput,
    intentId: secondIntentId,
    supersedesIntentId: firstIntentId,
    clientCreatedAt: '2026-08-28T00:03:00.000Z',
  });
  const comments = [
    {
      id: 'intent-first',
      body: renderDeliveryIntentComment(firstIntent),
      createdAt: '2026-08-28T00:01:00.000Z',
    },
    {
      id: 'receipt-first',
      body: renderDeliveryReceiptComment(firstReceipt),
      createdAt: '2026-08-28T00:02:00.000Z',
    },
    {
      id: 'intent-second',
      body: renderDeliveryIntentComment(secondIntent),
      createdAt: '2026-08-28T00:03:00.000Z',
    },
  ];
  assert.equal(
    projectExactDeliveryReceipt({
      comments,
      repository,
      issueNumber: 1403,
      prNumber: 1404,
      acceptedSha: row.acceptedSha,
    }).status,
    'present'
  );

  const secondReceipt = buildDeliveryReceipt({
    intentId: secondIntentId,
    issueNumber: 1403,
    prNumber: 1404,
    expectedHeadSha: row.acceptedSha,
    mergeCommitSha: row.mergeSha,
    baseRef: 'trunk',
    mergeMethod: 'squash',
    verifiedTrunkRef: 'origin/trunk',
    provider: 'codex',
    sessionId: 'session-1403',
    verifiedAt: '2026-08-28T00:04:00.000Z',
  });
  assert.throws(
    () =>
      projectExactDeliveryReceipt({
        comments: [
          ...comments,
          {
            id: 'receipt-second',
            body: renderDeliveryReceiptComment(secondReceipt),
            createdAt: '2026-08-28T00:04:00.000Z',
          },
        ],
        repository,
        issueNumber: 1403,
        prNumber: 1404,
        acceptedSha: row.acceptedSha,
      }),
    /incorporated-close:delivery-receipt-conflict/
  );
});

test('a complete issue-local receipt on another PR is present, never filtered as absent', () => {
  const intentId = '01ARZ3NDEKTSV4RRFFQ69G5FAX';
  const historicalPr = 999;
  const historicalHead = SHA('d');
  const historicalMerge = SHA('e');
  const intent = buildDeliveryIntent({
    intentId,
    supersedesIntentId: null,
    issueNumber: 1403,
    repository,
    prNumber: historicalPr,
    baseRef: 'trunk',
    headRef: 'codex/1403-historical',
    expectedHeadSha: historicalHead,
    mergeMethod: 'squash',
    attributionTokens: ['#1403'],
    commitTitle: '[#1403] Historical delivery',
    commitMessage: `PR #${historicalPr} source ${historicalHead}\n\n[#1403]`,
    provider: 'codex',
    sessionId: 'session-1403',
    clientCreatedAt: '2026-08-28T00:00:00.000Z',
  });
  const receipt = buildDeliveryReceipt({
    intentId,
    issueNumber: 1403,
    prNumber: historicalPr,
    expectedHeadSha: historicalHead,
    mergeCommitSha: historicalMerge,
    baseRef: 'trunk',
    mergeMethod: 'squash',
    verifiedTrunkRef: 'origin/trunk',
    provider: 'codex',
    sessionId: 'session-1403',
    verifiedAt: '2026-08-28T00:02:00.000Z',
  });
  assert.equal(
    projectExactDeliveryReceipt({
      comments: [
        {
          id: 'historical-intent',
          body: renderDeliveryIntentComment(intent),
          createdAt: '2026-08-28T00:01:00.000Z',
        },
        {
          id: 'historical-receipt',
          body: renderDeliveryReceiptComment(receipt),
          createdAt: '2026-08-28T00:02:00.000Z',
        },
      ],
      repository,
      issueNumber: 1403,
      prNumber: 1404,
      acceptedSha: row.acceptedSha,
    }).status,
    'present'
  );
});

test('missing accepted Review or Agent Review evidence refuses even when the carrier is merged', () => {
  assert.throws(
    () => authorize({ live: live({ acceptedEvidenceValid: false }) }),
    /incorporated-close:accepted-evidence/
  );
});

test('missing current human or Full-Auto review standing refuses the accepted carrier SHA', () => {
  assert.throws(
    () => authorize({ live: live({ reviewAuthorizationValid: false }) }),
    /incorporated-close:review-authorization/
  );
  assert.throws(
    () =>
      authorize({
        live: live({
          reviewAuthorization: { mode: 'full-auto', source: 'human-evidence' },
        }),
      }),
    /incorporated-close:review-authorization/
  );
});

test('a closed issue needs a durable close transaction and COMPLETED reason', () => {
  assert.throws(
    () => authorize({ live: live({ issueState: 'CLOSED', issueStateReason: 'NOT_PLANNED' }) }),
    /incorporated-close:contradictory-terminal-state/
  );
  assert.doesNotThrow(() =>
    authorize({
      live: live({
        issueState: 'CLOSED',
        issueStateReason: 'COMPLETED',
        closeTransactionPresent: true,
      }),
    })
  );
});

test('all three sanctioned blocker carriers must be cleared before authorization', () => {
  for (const key of ['labelCleared', 'fieldCleared', 'bodyCleared']) {
    assert.throws(
      () =>
        authorize({
          live: live({ blockerCarriers: { ...live().blockerCarriers, [key]: false } }),
        }),
      /incorporated-close:blocker-not-cleared/
    );
  }
});

function mutationHarness({
  preexisting = false,
  terminal = false,
  checkpointCount = terminal ? INCORPORATED_CLOSE_STEPS.length : 0,
  disposition: dispositionOverride,
  status: statusOverride,
  issueState: issueStateOverride,
  issueStateReason: issueStateReasonOverride,
  audited: auditedOverride,
  bound: boundOverride,
} = {}) {
  const order = [];
  const records = [];
  let disposition = dispositionOverride ?? (terminal ? 'Incorporated' : '');
  let status = statusOverride ?? (terminal ? 'Done' : 'Review');
  let issueState = issueStateOverride ?? (terminal ? 'CLOSED' : 'OPEN');
  let issueStateReason = issueStateReasonOverride ?? (terminal ? 'COMPLETED' : '');
  let audited = auditedOverride ?? terminal;
  let bound = boundOverride ?? !terminal;
  const envelope = {
    recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAZ',
    recordType: 'delivery-incident-incorporated',
    payload: null,
  };
  const deps = {
    createEnvelope: ({ payload }) => ({ ...envelope, payload }),
    renderRecord: () => 'record-body',
    listIssueRecords: async () => records,
    appendIssueRecord: async ({ envelope: value }) => {
      order.push('record');
      records.push({ id: 'comment-1', envelope: value });
      return records[0];
    },
    appendCheckpointRecord: async ({ envelope: value }) => {
      records.push({ id: `checkpoint-${records.length}`, envelope: value });
    },
    flushTiming: async () => {
      order.push('timing');
      return { delivered: 1, discarded: 0, pending: 0, retained: 0 };
    },
    readDisposition: async () => disposition,
    writeDisposition: async () => {
      order.push('disposition');
      disposition = 'Incorporated';
    },
    readStatus: async () => status,
    writeStatusDone: async () => {
      order.push('done');
      status = 'Done';
    },
    readIssueCloseState: async () => ({ state: issueState, stateReason: issueStateReason }),
    closeIssueCompleted: async () => {
      order.push('close');
      issueState = 'CLOSED';
      issueStateReason = 'COMPLETED';
    },
    hasAudit: async () => audited,
    postAudit: async () => {
      order.push('audit');
      audited = true;
    },
    isBindingReleased: async () => !bound,
    releaseBinding: async () => {
      order.push('release');
      bound = false;
    },
  };
  if (preexisting) {
    const auth = authorize();
    envelope.payload = auth.incorporatedPayload;
    records.push({ id: 'comment-1', envelope: { ...envelope } });
    if (checkpointCount > 0) {
      let previous = null;
      INCORPORATED_CLOSE_STEPS.slice(0, checkpointCount).forEach((step, index) => {
        const recordId = `01ARZ3NDEKTSV4RRFFQ69G5FB${index}`;
        records.push({
          id: `checkpoint-${index}`,
          envelope: {
            recordId,
            recordType: 'delivery-incident-incorporated-close',
            supersedes: previous,
            payload: {
              schema: 'aitm.delivery-incident-incorporated-close/v1',
              repository,
              issueNumber: 1403,
              convergenceIssue: 1381,
              ledgerId: auth.ledgerId,
              incorporatedRecordId: envelope.recordId,
              acceptedSha: auth.acceptedSha,
              authorizationDecision: auth.reviewAuthorization,
              completedSteps: INCORPORATED_CLOSE_STEPS.slice(0, index + 1),
            },
          },
        });
        previous = recordId;
      });
    }
  }
  return { deps, order, records };
}

test('first Incorporated close mutates in the governed order and creates no delivery receipt', async () => {
  const { deps, order } = mutationHarness();
  const result = await runIncorporatedClose({ authorization: authorize(), deps });
  assert.deepEqual(order, ['record', 'timing', 'disposition', 'done', 'close', 'audit', 'release']);
  assert.equal(result.status, 'incorporated');
  assert.deepEqual(result.mutatedSteps, order);
  assert.equal('receiptUrl' in result, false);
});

test('retry adopts the issue-local record and converges only missing terminal effects', async () => {
  const { deps, order } = mutationHarness({ preexisting: true });
  const result = await runIncorporatedClose({ authorization: authorize(), deps });
  assert.deepEqual(order, ['timing', 'disposition', 'done', 'close', 'audit', 'release']);
  assert.equal(result.status, 'incorporated');
  assert.ok(result.recordId);
});

test('fully converged retry is a no-op', async () => {
  const { deps, order } = mutationHarness({ preexisting: true, terminal: true });
  const result = await runIncorporatedClose({ authorization: authorize(), deps });
  assert.equal(result.status, 'already-incorporated');
  assert.deepEqual(result.mutatedSteps, []);
  assert.deepEqual(order, []);
});

test('durable checkpoints adopt completed live effects while running the uncheckpointed suffix', async () => {
  const { deps, order } = mutationHarness({
    preexisting: true,
    checkpointCount: 1,
    disposition: 'Incorporated',
    status: 'Done',
    issueState: 'CLOSED',
    issueStateReason: 'COMPLETED',
    audited: true,
    bound: false,
  });
  const result = await runIncorporatedClose({ authorization: authorize(), deps });
  assert.deepEqual(order, ['timing']);
  assert.deepEqual(result.mutatedSteps, ['timing']);

  const replay = await runIncorporatedClose({ authorization: authorize(), deps });
  assert.equal(replay.status, 'already-incorporated');
  assert.deepEqual(replay.mutatedSteps, []);
  assert.deepEqual(order, ['timing']);
});

test('partial and completed checkpoints preserve exact review authority for policy-free retries', () => {
  for (const checkpointCount of [2, INCORPORATED_CLOSE_STEPS.length]) {
    const { records } = mutationHarness({
      preexisting: true,
      checkpointCount,
      terminal: checkpointCount === INCORPORATED_CLOSE_STEPS.length,
    });
    assert.deepEqual(
      projectIncorporatedCloseReviewAuthority({
        records,
        repository,
        issueNumber: 1403,
        convergenceIssue: 1381,
        ledgerId: authority().ledgerId,
        acceptedSha: row.acceptedSha,
      }),
      {
        acceptedSha: row.acceptedSha,
        reviewAuthorization: { mode: 'full-auto', source: 'session' },
      }
    );
  }
});

test('a durable transaction never overwrites contradictory terminal disposition', async () => {
  const { deps, order } = mutationHarness({
    preexisting: true,
    checkpointCount: 2,
    disposition: 'Delivered',
  });
  await assert.rejects(
    runIncorporatedClose({ authorization: authorize(), deps }),
    /incorporated-close:transaction-live-conflict/
  );
  assert.deepEqual(order, []);
});

test('a conflicting issue-local Incorporated record refuses before terminal mutation', async () => {
  const { deps, order } = mutationHarness();
  const auth = authorize();
  deps.listIssueRecords = async () => [
    {
      id: 'conflict',
      envelope: {
        recordType: 'delivery-incident-incorporated',
        payload: { ...auth.incorporatedPayload, ledgerId: '01ARZ3NDEKTSV4RRFFQ69G5FAY' },
      },
    },
  ];
  await assert.rejects(
    runIncorporatedClose({ authorization: auth, deps }),
    /incorporated-close:conflicting-record/
  );
  assert.deepEqual(order, []);
});

test('an orphan close checkpoint refuses before appending an Incorporated record', async () => {
  const { deps, order, records } = mutationHarness();
  const auth = authorize();
  records.push({
    id: 'orphan-checkpoint',
    envelope: {
      recordId: '01ARZ3NDEKTSV4RRFFQ69G5FB0',
      recordType: 'delivery-incident-incorporated-close',
      supersedes: null,
      payload: {
        schema: 'aitm.delivery-incident-incorporated-close/v1',
        repository,
        issueNumber: 1403,
        convergenceIssue: 1381,
        ledgerId: auth.ledgerId,
        incorporatedRecordId: '01ARZ3NDEKTSV4RRFFQ69G5FZZ',
        completedSteps: ['record'],
      },
    },
  });
  await assert.rejects(
    runIncorporatedClose({ authorization: auth, deps }),
    /incorporated-close:transaction-conflict/
  );
  assert.deepEqual(order, []);
  assert.equal(
    records.some(({ envelope }) => envelope.recordType === 'delivery-incident-incorporated'),
    false
  );
});

test('invalid, discarded, pending, or retained timing refuses before terminal writes', async () => {
  for (const timing of [
    false,
    undefined,
    { delivered: 0, discarded: 1, pending: 0, retained: 0 },
    { delivered: 0, discarded: 0, pending: 1, retained: 0 },
    { delivered: 0, discarded: 0, pending: 0, retained: 1 },
  ]) {
    const { deps, order } = mutationHarness({ preexisting: true });
    deps.flushTiming = async () => {
      order.push('timing');
      return timing;
    };
    await assert.rejects(
      runIncorporatedClose({ authorization: authorize(), deps }),
      /incorporated-close:timing-pending/
    );
    assert.deepEqual(order, ['timing']);
  }
});
