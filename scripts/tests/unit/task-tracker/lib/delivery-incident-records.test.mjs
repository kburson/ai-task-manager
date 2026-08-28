// @story #1381
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildIncidentLedgerApprovalPayload,
  buildIncidentLedgerOwnerPayload,
  buildIncidentLedgerPayload,
  buildIncorporatedPayload,
  incidentLedgerOwnerRecordIdentity,
  incorporatedRecordIdentity,
  projectDeliveryIncidentRecords,
  renderIncidentRecord,
  REVIEWED_INCIDENT_ISSUES,
} from '../../../../task-tracker/lib/delivery-incident-records.mjs';
import {
  createAitmRecordEnvelope,
  hashRecordPayload,
} from '../../../../task-tracker/lib/github-records/record-envelope.mjs';

const SHA = (digit) => digit.repeat(40);
const LEDGER_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const RECORD_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAA';
const APPROVAL_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAB';
const OUTCOMES = new Map([
  [1378, 'retain-superseded'],
  [1379, 'retain-superseded'],
  [1380, 'incorporated'],
  [1381, 'convergence-owner'],
  [1382, 'incorporated'],
  [1383, 'incorporated'],
  [1384, 'incorporated'],
  [1386, 'retain-superseded'],
  [1387, 'retain-superseded'],
  [1388, 'incorporated'],
  [1389, 'recover-then-close'],
  [1390, 'incorporated'],
  [1392, 'recover-then-close'],
  [1393, 'close-delivered'],
  [1395, 'close-delivered'],
  [1397, 'close-delivered'],
  [1399, 'retain-delivered'],
  [1401, 'retain-delivered'],
  [1403, 'incorporated'],
]);

function rows() {
  return REVIEWED_INCIDENT_ISSUES.map((issueNumber) => ({
    issueNumber,
    observedGitHubState: issueNumber === 1378 ? 'CLOSED' : 'OPEN',
    observedBoardState: issueNumber === 1378 ? 'Done' : 'Review',
    acceptedSha:
      issueNumber === 1403
        ? 'ec160af0b03df8453fa0a1ad7f91b7138aeda38d'
        : [1378, 1379, 1381, 1386, 1387].includes(issueNumber)
          ? null
          : SHA('a'),
    prNumber: issueNumber === 1403 ? 1404 : null,
    prHeadSha: issueNumber === 1403 ? 'ec160af0b03df8453fa0a1ad7f91b7138aeda38d' : null,
    mergeSha: issueNumber === 1403 ? '19c6f54b0354699b988c470a99f122edab3aa2ba' : null,
    intentUrl: null,
    receiptUrl: null,
    approvalMode: null,
    approvalSha: null,
    codeOnTrunk: ![1378, 1379, 1381, 1386, 1387].includes(issueNumber),
    codeOnTrunkBasis: issueNumber === 1403 ? 'carrier-pr' : null,
    blocker:
      issueNumber === 1403
        ? 'historical merge method and missing governed intent/receipt prohibit ordinary Delivered close'
        : null,
    intendedOutcome: OUTCOMES.get(issueNumber),
  }));
}

function ledger() {
  return buildIncidentLedgerPayload({
    schema: 'aitm.delivery-incident-ledger/v1',
    ledgerId: LEDGER_ID,
    repository: 'kburson/ai-task-manager',
    incidentIssue: 939,
    convergenceIssue: 1381,
    baselineTrunkSha: SHA('b'),
    rows: rows(),
  });
}

test('ledger contract requires the exact reviewed set and immutable canonical rows', () => {
  const payload = ledger();
  assert.deepEqual(
    payload.rows.map((row) => row.issueNumber),
    REVIEWED_INCIDENT_ISSUES
  );
  assert.equal(
    payload.rows.find((row) => row.issueNumber === 1403).intendedOutcome,
    'incorporated'
  );
  assert.equal(Object.isFrozen(payload), true);
  assert.equal(Object.isFrozen(payload.rows[0]), true);
  assert.throws(() => buildIncidentLedgerPayload({ ...payload, rows: payload.rows.slice(1) }));
  assert.throws(() =>
    buildIncidentLedgerPayload({ ...payload, rows: [...payload.rows].reverse() })
  );
  assert.throws(() =>
    buildIncidentLedgerPayload({
      ...payload,
      rows: payload.rows.map((row) =>
        row.issueNumber === 1403 ? { ...row, intendedOutcome: 'close-delivered' } : row
      ),
    })
  );
  assert.throws(() => buildIncidentLedgerPayload({ ...payload, unknown: true }));
  assert.throws(() => buildIncidentLedgerPayload({ ...payload, incidentIssue: 1381 }));
  assert.throws(() => buildIncidentLedgerPayload({ ...payload, convergenceIssue: 939 }));
  assert.throws(() =>
    buildIncidentLedgerPayload({
      ...payload,
      rows: payload.rows.map((row) =>
        row.issueNumber === 1382 ? { ...row, acceptedSha: SHA('A') } : row
      ),
    })
  );
  assert.throws(() =>
    buildIncidentLedgerPayload({
      ...payload,
      rows: payload.rows.map((row) =>
        row.issueNumber === 1382 ? { ...row, intentUrl: 'http://example.com/intent' } : row
      ),
    })
  );
  assert.throws(() =>
    buildIncidentLedgerPayload({
      ...payload,
      rows: payload.rows.map((row) =>
        row.issueNumber === 1382 ? { ...row, unexpected: null } : row
      ),
    })
  );
});

test('approval, owner, and Incorporated records bind one exact approved ledger', () => {
  const ledgerPayload = ledger();
  const digest = hashRecordPayload(ledgerPayload);
  const approval = buildIncidentLedgerApprovalPayload({
    schema: 'aitm.delivery-incident-ledger-approval/v1',
    repository: ledgerPayload.repository,
    convergenceIssue: 1381,
    ledgerId: LEDGER_ID,
    ledgerDigest: digest,
    ledgerRecordId: RECORD_ID,
    approvedBy: 'kpburson',
    approvedAt: '2026-08-28T00:01:00.000Z',
  });
  const owner = buildIncidentLedgerOwnerPayload({
    schema: 'aitm.delivery-incident-ledger-owner/v1',
    repository: ledgerPayload.repository,
    incidentIssue: 939,
    convergenceIssue: 1381,
    ledgerId: LEDGER_ID,
    ledgerDigest: digest,
    approvalRecordId: APPROVAL_ID,
  });
  const incorporated = buildIncorporatedPayload({
    schema: 'aitm.delivery-incident-incorporated/v1',
    repository: ledgerPayload.repository,
    issueNumber: 1403,
    convergenceIssue: 1381,
    ledgerId: LEDGER_ID,
    ledgerDigest: digest,
    approvalRecordId: APPROVAL_ID,
    acceptedSha: 'ec160af0b03df8453fa0a1ad7f91b7138aeda38d',
    prNumber: 1404,
    prHeadSha: 'ec160af0b03df8453fa0a1ad7f91b7138aeda38d',
    mergeSha: '19c6f54b0354699b988c470a99f122edab3aa2ba',
    codeOnTrunkBasis: 'carrier-pr',
    blocker: rows().at(-1).blocker,
  });
  assert.equal(Object.isFrozen(approval), true);
  assert.equal(Object.isFrozen(owner), true);
  assert.equal(Object.isFrozen(incorporated), true);
  assert.throws(() =>
    buildIncidentLedgerApprovalPayload({ ...approval, approvedAt: '2026-08-28' })
  );
  assert.throws(() => buildIncidentLedgerOwnerPayload({ ...owner, extra: null }));
  assert.throws(() => buildIncorporatedPayload({ ...incorporated, issueNumber: 1393 }));
  assert.equal(
    incidentLedgerOwnerRecordIdentity({
      repository: ledgerPayload.repository,
      incidentIssue: 939,
      convergenceIssue: 1381,
    }),
    incidentLedgerOwnerRecordIdentity({
      repository: ledgerPayload.repository,
      incidentIssue: 939,
      convergenceIssue: 1381,
    })
  );
});

test('Incorporated identity stays issue-keyed when accepted SHAs are shared', () => {
  const common = {
    repository: 'kburson/ai-task-manager',
    convergenceIssue: 1381,
    ledgerId: LEDGER_ID,
  };
  assert.notEqual(
    incorporatedRecordIdentity({ ...common, issueNumber: 1382 }),
    incorporatedRecordIdentity({ ...common, issueNumber: 1383 })
  );
});

test('canonical render and projection select one exact approved ledger tip', () => {
  const ledgerPayload = ledger();
  const ledgerEnvelope = createAitmRecordEnvelope({
    recordType: 'delivery-incident-ledger',
    repository: ledgerPayload.repository,
    issue: 1381,
    payload: ledgerPayload,
    actor: 'kpburson',
    recordId: RECORD_ID,
    grantId: '01ARZ3NDEKTSV4RRFFQ69G5FAC',
    createdAt: '2026-08-28T00:00:00.000Z',
  });
  const approvalPayload = buildIncidentLedgerApprovalPayload({
    schema: 'aitm.delivery-incident-ledger-approval/v1',
    repository: ledgerPayload.repository,
    convergenceIssue: 1381,
    ledgerId: LEDGER_ID,
    ledgerDigest: hashRecordPayload(ledgerPayload),
    ledgerRecordId: RECORD_ID,
    approvedBy: 'kpburson',
    approvedAt: '2026-08-28T00:01:00.000Z',
  });
  const approvalEnvelope = createAitmRecordEnvelope({
    recordType: 'delivery-incident-ledger-approval',
    repository: ledgerPayload.repository,
    issue: 1381,
    payload: approvalPayload,
    actor: 'kpburson',
    recordId: APPROVAL_ID,
    grantId: '01ARZ3NDEKTSV4RRFFQ69G5FAD',
    createdAt: '2026-08-28T00:01:00.000Z',
  });
  const ownerPayload = buildIncidentLedgerOwnerPayload({
    schema: 'aitm.delivery-incident-ledger-owner/v1',
    repository: ledgerPayload.repository,
    incidentIssue: 939,
    convergenceIssue: 1381,
    ledgerId: LEDGER_ID,
    ledgerDigest: hashRecordPayload(ledgerPayload),
    approvalRecordId: APPROVAL_ID,
  });
  const ownerEnvelope = createAitmRecordEnvelope({
    recordType: 'delivery-incident-ledger-owner',
    repository: ledgerPayload.repository,
    issue: 939,
    payload: ownerPayload,
    actor: 'kpburson',
    recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAK',
    grantId: '01ARZ3NDEKTSV4RRFFQ69G5FAM',
    createdAt: '2026-08-28T00:01:01.000Z',
  });
  assert.match(renderIncidentRecord({ envelope: ledgerEnvelope }), /^<!-- aitm-record/);
  assert.throws(
    () =>
      projectDeliveryIncidentRecords([
        { id: 'ledger-comment', envelope: ledgerEnvelope },
        { id: 'approval-comment', envelope: approvalEnvelope },
      ]),
    /missing-owner/
  );
  const projection = projectDeliveryIncidentRecords([
    { id: 'ledger-comment', envelope: ledgerEnvelope },
    { id: 'approval-comment', envelope: approvalEnvelope },
    { id: 'owner-comment', envelope: ownerEnvelope },
  ]);
  assert.equal(projection.approvedLedger.envelope.recordId, RECORD_ID);
  assert.equal(projection.approvedLedgerOwner.envelope.recordId, ownerEnvelope.recordId);
  assert.throws(() => projectDeliveryIncidentRecords([{ id: 'ledger', envelope: ledgerEnvelope }]));

  const conflictingOwnerPayload = buildIncidentLedgerOwnerPayload({
    ...ownerPayload,
    ledgerDigest: `sha256:${'f'.repeat(64)}`,
  });
  const conflictingOwnerEnvelope = createAitmRecordEnvelope({
    recordType: 'delivery-incident-ledger-owner',
    repository: ledgerPayload.repository,
    issue: 939,
    payload: conflictingOwnerPayload,
    actor: 'kpburson',
    recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAN',
    grantId: '01ARZ3NDEKTSV4RRFFQ69G5FAP',
    createdAt: '2026-08-28T00:01:02.000Z',
  });
  assert.throws(
    () =>
      projectDeliveryIncidentRecords([
        { id: 'ledger-comment', envelope: ledgerEnvelope },
        { id: 'approval-comment', envelope: approvalEnvelope },
        { id: 'owner-comment', envelope: conflictingOwnerEnvelope },
      ]),
    /conflicting-owner/
  );

  const conflictingIncorporatedPayload = buildIncorporatedPayload({
    schema: 'aitm.delivery-incident-incorporated/v1',
    repository: ledgerPayload.repository,
    issueNumber: 1403,
    convergenceIssue: 1381,
    ledgerId: LEDGER_ID,
    ledgerDigest: hashRecordPayload(ledgerPayload),
    approvalRecordId: APPROVAL_ID,
    acceptedSha: SHA('c'),
    prNumber: 1404,
    prHeadSha: 'ec160af0b03df8453fa0a1ad7f91b7138aeda38d',
    mergeSha: '19c6f54b0354699b988c470a99f122edab3aa2ba',
    codeOnTrunkBasis: 'carrier-pr',
    blocker: rows().at(-1).blocker,
  });
  const conflictingIncorporatedEnvelope = createAitmRecordEnvelope({
    recordType: 'delivery-incident-incorporated',
    repository: ledgerPayload.repository,
    issue: 1403,
    payload: conflictingIncorporatedPayload,
    actor: 'kpburson',
    recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAQ',
    grantId: '01ARZ3NDEKTSV4RRFFQ69G5FAR',
    createdAt: '2026-08-28T00:01:03.000Z',
  });
  assert.throws(
    () =>
      projectDeliveryIncidentRecords([
        { id: 'ledger-comment', envelope: ledgerEnvelope },
        { id: 'approval-comment', envelope: approvalEnvelope },
        { id: 'owner-comment', envelope: ownerEnvelope },
        { id: 'incorporated-comment', envelope: conflictingIncorporatedEnvelope },
      ]),
    /conflicting-incorporated/
  );

  const forkApprovalPayload = buildIncidentLedgerApprovalPayload({
    ...approvalPayload,
    approvedAt: '2026-08-28T00:02:00.000Z',
  });
  const forkApprovalEnvelope = createAitmRecordEnvelope({
    recordType: 'delivery-incident-ledger-approval',
    repository: ledgerPayload.repository,
    issue: 1381,
    payload: forkApprovalPayload,
    actor: 'kpburson',
    recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAE',
    grantId: '01ARZ3NDEKTSV4RRFFQ69G5FAF',
    createdAt: forkApprovalPayload.approvedAt,
  });
  assert.throws(
    () =>
      projectDeliveryIncidentRecords([
        { id: 'ledger-comment', envelope: ledgerEnvelope },
        { id: 'approval-comment', envelope: approvalEnvelope },
        { id: 'owner-comment', envelope: ownerEnvelope },
        { id: 'fork-comment', envelope: forkApprovalEnvelope },
      ]),
    /ambiguous-authority/
  );

  const staleApprovalPayload = buildIncidentLedgerApprovalPayload({
    ...approvalPayload,
    ledgerRecordId: '01ARZ3NDEKTSV4RRFFQ69G5FAG',
    approvedAt: '2026-08-28T00:03:00.000Z',
  });
  const staleApprovalEnvelope = createAitmRecordEnvelope({
    recordType: 'delivery-incident-ledger-approval',
    repository: ledgerPayload.repository,
    issue: 1381,
    payload: staleApprovalPayload,
    actor: 'kpburson',
    recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAH',
    grantId: '01ARZ3NDEKTSV4RRFFQ69G5FAJ',
    createdAt: staleApprovalPayload.approvedAt,
  });
  assert.throws(
    () =>
      projectDeliveryIncidentRecords([
        { id: 'ledger-comment', envelope: ledgerEnvelope },
        { id: 'stale-comment', envelope: staleApprovalEnvelope },
        { id: 'owner-comment', envelope: ownerEnvelope },
      ]),
    /stale-approval/
  );
});

test('linear ledger replacement preserves valid historical owner and Incorporated records', () => {
  const firstLedgerPayload = ledger();
  const firstLedgerEnvelope = createAitmRecordEnvelope({
    recordType: 'delivery-incident-ledger',
    repository: firstLedgerPayload.repository,
    issue: 1381,
    payload: firstLedgerPayload,
    actor: 'kpburson',
    recordId: RECORD_ID,
    grantId: '01ARZ3NDEKTSV4RRFFQ69G5FAC',
    createdAt: '2026-08-28T00:00:00.000Z',
  });
  const firstApprovalPayload = buildIncidentLedgerApprovalPayload({
    schema: 'aitm.delivery-incident-ledger-approval/v1',
    repository: firstLedgerPayload.repository,
    convergenceIssue: 1381,
    ledgerId: firstLedgerPayload.ledgerId,
    ledgerDigest: hashRecordPayload(firstLedgerPayload),
    ledgerRecordId: firstLedgerEnvelope.recordId,
    approvedBy: 'kpburson',
    approvedAt: '2026-08-28T00:01:00.000Z',
  });
  const firstApprovalEnvelope = createAitmRecordEnvelope({
    recordType: 'delivery-incident-ledger-approval',
    repository: firstLedgerPayload.repository,
    issue: 1381,
    payload: firstApprovalPayload,
    actor: 'kpburson',
    recordId: APPROVAL_ID,
    grantId: '01ARZ3NDEKTSV4RRFFQ69G5FAD',
    createdAt: firstApprovalPayload.approvedAt,
  });
  const firstOwnerPayload = buildIncidentLedgerOwnerPayload({
    schema: 'aitm.delivery-incident-ledger-owner/v1',
    repository: firstLedgerPayload.repository,
    incidentIssue: 939,
    convergenceIssue: 1381,
    ledgerId: firstLedgerPayload.ledgerId,
    ledgerDigest: firstApprovalPayload.ledgerDigest,
    approvalRecordId: firstApprovalEnvelope.recordId,
  });
  const firstOwnerEnvelope = createAitmRecordEnvelope({
    recordType: 'delivery-incident-ledger-owner',
    repository: firstLedgerPayload.repository,
    issue: 939,
    payload: firstOwnerPayload,
    actor: 'kpburson',
    recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAK',
    grantId: '01ARZ3NDEKTSV4RRFFQ69G5FAM',
    createdAt: '2026-08-28T00:01:01.000Z',
  });

  const makeIncorporatedPayload = ({ ledgerPayload, approvalRecordId }) => {
    const row = ledgerPayload.rows.find(({ issueNumber }) => issueNumber === 1403);
    return buildIncorporatedPayload({
      schema: 'aitm.delivery-incident-incorporated/v1',
      repository: ledgerPayload.repository,
      issueNumber: row.issueNumber,
      convergenceIssue: ledgerPayload.convergenceIssue,
      ledgerId: ledgerPayload.ledgerId,
      ledgerDigest: hashRecordPayload(ledgerPayload),
      approvalRecordId,
      acceptedSha: row.acceptedSha,
      prNumber: row.prNumber,
      prHeadSha: row.prHeadSha,
      mergeSha: row.mergeSha,
      codeOnTrunkBasis: row.codeOnTrunkBasis,
      blocker: row.blocker,
    });
  };
  const firstIncorporatedPayload = makeIncorporatedPayload({
    ledgerPayload: firstLedgerPayload,
    approvalRecordId: firstApprovalEnvelope.recordId,
  });
  const firstIncorporatedEnvelope = createAitmRecordEnvelope({
    recordType: 'delivery-incident-incorporated',
    repository: firstLedgerPayload.repository,
    issue: 1403,
    payload: firstIncorporatedPayload,
    actor: 'kpburson',
    recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAS',
    grantId: '01ARZ3NDEKTSV4RRFFQ69G5FAY',
    createdAt: '2026-08-28T00:01:02.000Z',
  });

  const secondLedgerPayload = buildIncidentLedgerPayload({
    ...firstLedgerPayload,
    ledgerId: '01ARZ3NDEKTSV4RRFFQ69G5FA0',
    baselineTrunkSha: SHA('c'),
  });
  const secondLedgerEnvelope = createAitmRecordEnvelope({
    recordType: 'delivery-incident-ledger',
    repository: secondLedgerPayload.repository,
    issue: 1381,
    payload: secondLedgerPayload,
    actor: 'kpburson',
    recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAT',
    grantId: '01ARZ3NDEKTSV4RRFFQ69G5FAZ',
    supersedes: firstLedgerEnvelope.recordId,
    createdAt: '2026-08-28T00:02:00.000Z',
  });
  const secondApprovalPayload = buildIncidentLedgerApprovalPayload({
    ...firstApprovalPayload,
    ledgerId: secondLedgerPayload.ledgerId,
    ledgerDigest: hashRecordPayload(secondLedgerPayload),
    ledgerRecordId: secondLedgerEnvelope.recordId,
    approvedAt: '2026-08-28T00:03:00.000Z',
  });
  const secondApprovalEnvelope = createAitmRecordEnvelope({
    recordType: 'delivery-incident-ledger-approval',
    repository: secondLedgerPayload.repository,
    issue: 1381,
    payload: secondApprovalPayload,
    actor: 'kpburson',
    recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    grantId: '01ARZ3NDEKTSV4RRFFQ69G5FA1',
    supersedes: firstApprovalEnvelope.recordId,
    createdAt: secondApprovalPayload.approvedAt,
  });
  const secondOwnerPayload = buildIncidentLedgerOwnerPayload({
    ...firstOwnerPayload,
    ledgerId: secondLedgerPayload.ledgerId,
    ledgerDigest: secondApprovalPayload.ledgerDigest,
    approvalRecordId: secondApprovalEnvelope.recordId,
  });
  const secondOwnerEnvelope = createAitmRecordEnvelope({
    recordType: 'delivery-incident-ledger-owner',
    repository: secondLedgerPayload.repository,
    issue: 939,
    payload: secondOwnerPayload,
    actor: 'kpburson',
    recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
    grantId: '01ARZ3NDEKTSV4RRFFQ69G5FA2',
    supersedes: firstOwnerEnvelope.recordId,
    createdAt: '2026-08-28T00:03:01.000Z',
  });
  const secondIncorporatedPayload = makeIncorporatedPayload({
    ledgerPayload: secondLedgerPayload,
    approvalRecordId: secondApprovalEnvelope.recordId,
  });
  const secondIncorporatedEnvelope = createAitmRecordEnvelope({
    recordType: 'delivery-incident-incorporated',
    repository: secondLedgerPayload.repository,
    issue: 1403,
    payload: secondIncorporatedPayload,
    actor: 'kpburson',
    recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAX',
    grantId: '01ARZ3NDEKTSV4RRFFQ69G5FA3',
    createdAt: '2026-08-28T00:03:02.000Z',
  });

  const projection = projectDeliveryIncidentRecords([
    { id: 'ledger-1', envelope: firstLedgerEnvelope },
    { id: 'approval-1', envelope: firstApprovalEnvelope },
    { id: 'owner-1', envelope: firstOwnerEnvelope },
    { id: 'incorporated-1', envelope: firstIncorporatedEnvelope },
    { id: 'ledger-2', envelope: secondLedgerEnvelope },
    { id: 'approval-2', envelope: secondApprovalEnvelope },
    { id: 'owner-2', envelope: secondOwnerEnvelope },
    { id: 'incorporated-2', envelope: secondIncorporatedEnvelope },
  ]);
  assert.equal(projection.approvedLedger.envelope.recordId, secondLedgerEnvelope.recordId);
  assert.equal(projection.approvedLedgerOwner.envelope.recordId, secondOwnerEnvelope.recordId);
  assert.deepEqual(
    projection.approvedLedgerIncorporated.map(({ envelope }) => envelope.recordId),
    [secondIncorporatedEnvelope.recordId]
  );
  assert.equal(projection.incorporated.length, 2);
});
