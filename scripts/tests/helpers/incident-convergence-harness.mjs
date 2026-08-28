// @story #1381 #939
import {
  REVIEWED_INCIDENT_ISSUES,
  buildIncidentLedgerApprovalGrantPayload,
  buildIncidentLedgerApprovalPayload,
  buildIncidentLedgerOwnerPayload,
  buildIncidentLedgerPayload,
  buildIncorporatedPayload,
} from '../../task-tracker/lib/delivery-incident-records.mjs';
import { resolveApprovedIncidentLedger } from '../../task-tracker/lib/delivery-incident-reconciliation.mjs';
import {
  createAitmRecordEnvelope,
  hashRecordPayload,
} from '../../task-tracker/lib/github-records/record-envelope.mjs';

export const INCIDENT_REPOSITORY = 'kburson/ai-task-manager';
export const INCIDENT_LEDGER_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
export const INCIDENT_LEDGER_RECORD_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAA';
export const INCIDENT_APPROVAL_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAB';
export const INCIDENT_OWNER_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAC';
export const INCIDENT_SHARED_SHA = 'e810084f0978de511078403406f008d1683fc10a';
const APPROVAL_GRANT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FA4';
const APPROVED_AT = '2026-08-28T00:01:00.000Z';
const SHA = (digit) => digit.repeat(40);
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

function incidentRows() {
  return REVIEWED_INCIDENT_ISSUES.map((issueNumber) => {
    const incorporated = OUTCOMES.get(issueNumber) === 'incorporated';
    const retained = [1378, 1379, 1381, 1386, 1387].includes(issueNumber);
    const shared = [1382, 1383].includes(issueNumber);
    const issue1403 = issueNumber === 1403;
    const acceptedSha = issue1403
      ? 'ec160af0b03df8453fa0a1ad7f91b7138aeda38d'
      : retained
        ? null
        : shared
          ? INCIDENT_SHARED_SHA
          : SHA('a');
    const prNumber = issue1403 ? 1404 : shared ? 1410 : null;
    const prHeadSha = issue1403 ? acceptedSha : shared ? INCIDENT_SHARED_SHA : null;
    const mergeSha = issue1403
      ? '19c6f54b0354699b988c470a99f122edab3aa2ba'
      : shared
        ? SHA('d')
        : null;
    return {
      issueNumber,
      observedGitHubState: issueNumber === 1378 ? 'CLOSED' : 'OPEN',
      observedBoardState: issueNumber === 1378 ? 'Done' : 'Review',
      acceptedSha,
      prNumber,
      prHeadSha,
      mergeSha,
      intentUrl: null,
      receiptUrl: null,
      approvalMode: null,
      approvalSha: null,
      codeOnTrunk: !retained,
      codeOnTrunkBasis: issue1403 ? 'carrier-pr' : incorporated ? 'shared-carrier' : null,
      blocker: issue1403
        ? 'historical merge method and missing governed intent/receipt prohibit ordinary Delivered close'
        : incorporated
          ? `issue-local delivery provenance absent for #${issueNumber}`
          : null,
      intendedOutcome: OUTCOMES.get(issueNumber),
    };
  });
}

function providerRecord(id, envelope) {
  return {
    id,
    envelope,
    authorLogin: 'kpburson',
    createdAt: APPROVED_AT,
    updatedAt: APPROVED_AT,
  };
}

export function createApprovedIncidentFixture({ incorporatedIssues = [] } = {}) {
  const ledgerPayload = buildIncidentLedgerPayload({
    schema: 'aitm.delivery-incident-ledger/v1',
    ledgerId: INCIDENT_LEDGER_ID,
    repository: INCIDENT_REPOSITORY,
    incidentIssue: 939,
    convergenceIssue: 1381,
    baselineTrunkSha: SHA('b'),
    rows: incidentRows(),
  });
  const ledgerDigest = hashRecordPayload(ledgerPayload);
  const ledgerEnvelope = createAitmRecordEnvelope({
    recordType: 'delivery-incident-ledger',
    repository: INCIDENT_REPOSITORY,
    issue: 1381,
    payload: ledgerPayload,
    actor: 'kpburson',
    recordId: INCIDENT_LEDGER_RECORD_ID,
    grantId: '01ARZ3NDEKTSV4RRFFQ69G5FAD',
    createdAt: '2026-08-28T00:00:00.000Z',
  });
  const grantPayload = buildIncidentLedgerApprovalGrantPayload({
    schema: 'aitm.delivery-incident-ledger-approval-grant/v1',
    repository: INCIDENT_REPOSITORY,
    convergenceIssue: 1381,
    ledgerId: INCIDENT_LEDGER_ID,
    ledgerDigest,
    ledgerRecordId: INCIDENT_LEDGER_RECORD_ID,
  });
  const grantEnvelope = createAitmRecordEnvelope({
    recordType: 'delivery-incident-ledger-approval-grant',
    repository: INCIDENT_REPOSITORY,
    issue: 1381,
    payload: grantPayload,
    actor: 'kpburson',
    recordId: APPROVAL_GRANT_ID,
    grantId: '01ARZ3NDEKTSV4RRFFQ69G5FAE',
    createdAt: APPROVED_AT,
  });
  const approvalPayload = buildIncidentLedgerApprovalPayload({
    schema: 'aitm.delivery-incident-ledger-approval/v1',
    repository: INCIDENT_REPOSITORY,
    convergenceIssue: 1381,
    ledgerId: INCIDENT_LEDGER_ID,
    ledgerDigest,
    ledgerRecordId: INCIDENT_LEDGER_RECORD_ID,
    grantRecordId: APPROVAL_GRANT_ID,
    approvedBy: 'kpburson',
    approvedAt: APPROVED_AT,
  });
  const approvalEnvelope = createAitmRecordEnvelope({
    recordType: 'delivery-incident-ledger-approval',
    repository: INCIDENT_REPOSITORY,
    issue: 1381,
    payload: approvalPayload,
    actor: 'kpburson',
    recordId: INCIDENT_APPROVAL_ID,
    grantId: '01ARZ3NDEKTSV4RRFFQ69G5FAF',
    createdAt: APPROVED_AT,
  });
  const ownerPayload = buildIncidentLedgerOwnerPayload({
    schema: 'aitm.delivery-incident-ledger-owner/v1',
    repository: INCIDENT_REPOSITORY,
    incidentIssue: 939,
    convergenceIssue: 1381,
    ledgerId: INCIDENT_LEDGER_ID,
    ledgerDigest,
    approvalRecordId: INCIDENT_APPROVAL_ID,
  });
  const ownerEnvelope = createAitmRecordEnvelope({
    recordType: 'delivery-incident-ledger-owner',
    repository: INCIDENT_REPOSITORY,
    issue: 939,
    payload: ownerPayload,
    actor: 'kpburson',
    recordId: INCIDENT_OWNER_ID,
    grantId: '01ARZ3NDEKTSV4RRFFQ69G5FAG',
    createdAt: '2026-08-28T00:01:01.000Z',
  });
  const records = [
    { id: 'ledger-comment', envelope: ledgerEnvelope },
    providerRecord('grant-comment', grantEnvelope),
    providerRecord('approval-comment', approvalEnvelope),
    { id: 'owner-comment', envelope: ownerEnvelope },
  ];
  for (const issueNumber of incorporatedIssues) {
    const row = ledgerPayload.rows.find((candidate) => candidate.issueNumber === issueNumber);
    const payload = buildIncorporatedPayload({
      schema: 'aitm.delivery-incident-incorporated/v1',
      repository: INCIDENT_REPOSITORY,
      issueNumber,
      convergenceIssue: 1381,
      ledgerId: INCIDENT_LEDGER_ID,
      ledgerDigest,
      approvalRecordId: INCIDENT_APPROVAL_ID,
      acceptedSha: row.acceptedSha,
      prNumber: row.prNumber,
      prHeadSha: row.prHeadSha,
      mergeSha: row.mergeSha,
      codeOnTrunkBasis: row.codeOnTrunkBasis,
      blocker: row.blocker,
    });
    records.push({
      id: `incorporated-${issueNumber}`,
      envelope: createAitmRecordEnvelope({
        recordType: 'delivery-incident-incorporated',
        repository: INCIDENT_REPOSITORY,
        issue: issueNumber,
        payload,
        actor: 'aitm/incorporated-close',
      }),
    });
  }
  const authority = resolveApprovedIncidentLedger({
    records,
    repository: INCIDENT_REPOSITORY,
    convergenceIssue: 1381,
    incidentIssue: 939,
  });
  return {
    authority,
    records,
    ownerRecords: records.filter(
      ({ envelope }) => envelope.recordType === 'delivery-incident-ledger-owner'
    ),
    nativeParentIssueNumber: null,
    convergenceIssueState: 'Done',
  };
}

export function createIncorporatedMutationHarness() {
  const records = [];
  const counters = {
    records: 0,
    checkpoints: 0,
    timing: 0,
    dispositions: 0,
    statuses: 0,
    closes: 0,
    audits: 0,
    releases: 0,
  };
  let disposition = '';
  let status = 'Review';
  let closeState = { state: 'OPEN', stateReason: '' };
  let audit = false;
  let released = false;
  const append = ({ envelope }) => {
    records.push({ id: `issue-record-${records.length + 1}`, envelope });
  };
  return {
    records,
    counters,
    deps: {
      async listIssueRecords() {
        return structuredClone(records);
      },
      async appendIssueRecord(value) {
        counters.records += 1;
        append(value);
      },
      async appendCheckpointRecord(value) {
        counters.checkpoints += 1;
        append(value);
      },
      async flushTiming() {
        counters.timing += 1;
        return { ok: true, delivered: 0, discarded: 0, retained: 0, pending: 0 };
      },
      async readDisposition() {
        return disposition;
      },
      async writeDisposition() {
        counters.dispositions += 1;
        disposition = 'Incorporated';
      },
      async readStatus() {
        return status;
      },
      async writeStatusDone() {
        counters.statuses += 1;
        status = 'Done';
      },
      async readIssueCloseState() {
        return closeState;
      },
      async closeIssueCompleted() {
        counters.closes += 1;
        closeState = { state: 'CLOSED', stateReason: 'COMPLETED' };
      },
      async hasAudit() {
        return audit;
      },
      async postAudit() {
        counters.audits += 1;
        audit = true;
      },
      async isBindingReleased() {
        return released;
      },
      async releaseBinding() {
        counters.releases += 1;
        released = true;
      },
    },
  };
}
