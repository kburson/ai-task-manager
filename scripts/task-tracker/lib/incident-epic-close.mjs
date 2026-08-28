import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import {
  buildIncidentLedgerOwnerPayload,
  incorporatedRecordMatchesRow,
} from './delivery-incident-records.mjs';
import { resolveApprovedIncidentLedger } from './delivery-incident-reconciliation.mjs';

export const INCIDENT_EPIC_TERMINAL_ISSUES = Object.freeze([1380, 1382, 1383, 1384]);

function fail(category, issues = []) {
  const suffix = issues.length > 0 ? `:${issues.join(',')}` : '';
  throw new Error(`incident-epic-close:${category}${suffix}`);
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function parseCloseOfAssertion(args = []) {
  const positions = [];
  args.forEach((arg, index) => {
    if (arg === '--of') positions.push(index);
  });
  if (positions.length === 0) return null;
  if (positions.length !== 1) fail('invalid-of');
  const index = positions[0];
  const value = String(args[index + 1] || '').match(/^#?(\d+)$/);
  if (!value || args[index + 2] === '--of') fail('invalid-of');
  return Number(value[1]);
}

function projectOwner(ownerRecords, { repository, incidentIssue }) {
  if (!Array.isArray(ownerRecords) || ownerRecords.length === 0) fail('missing-owner');
  const owners = ownerRecords.filter(
    ({ envelope }) => envelope?.recordType === 'delivery-incident-ledger-owner'
  );
  if (owners.length === 0) fail('missing-owner');
  const ids = new Set(owners.map(({ envelope }) => envelope.recordId));
  if (ids.size !== owners.length) fail('ambiguous-owner');
  const superseded = new Set();
  for (const owner of owners) {
    let payload;
    try {
      payload = buildIncidentLedgerOwnerPayload(owner.envelope.payload);
    } catch {
      fail('malformed-owner');
    }
    if (
      payload.repository !== repository ||
      payload.incidentIssue !== incidentIssue ||
      owner.envelope.issue !== incidentIssue ||
      (owner.envelope.repository !== undefined && owner.envelope.repository !== repository)
    ) {
      fail('owner-authority-mismatch');
    }
    if (owner.envelope.supersedes !== null) {
      if (!ids.has(owner.envelope.supersedes)) fail('stale-owner');
      superseded.add(owner.envelope.supersedes);
    }
  }
  const tips = owners.filter(({ envelope }) => !superseded.has(envelope.recordId));
  if (tips.length !== 1) fail('ambiguous-owner');
  return tips[0];
}

export function authorizeIncidentEpicClose({
  repository,
  incidentIssue,
  explicitConvergenceIssue = null,
  ownerRecords,
  records,
  liveOutcomes,
  deps = {},
} = {}) {
  const owner = projectOwner(ownerRecords, { repository, incidentIssue });
  const ownerPayload = owner.envelope.payload;
  if (
    explicitConvergenceIssue !== null &&
    explicitConvergenceIssue !== ownerPayload.convergenceIssue
  ) {
    fail('owner-mismatch');
  }
  const resolve = deps.resolveApprovedIncidentLedger || resolveApprovedIncidentLedger;
  const authority = resolve({
    records,
    repository,
    convergenceIssue: ownerPayload.convergenceIssue,
    incidentIssue,
  });
  const exactOwner = {
    repository: authority.repository,
    incidentIssue: authority.incidentIssue,
    convergenceIssue: authority.convergenceIssue,
    ledgerId: authority.ledgerId,
    ledgerDigest: authority.ledgerDigest,
    approvalRecordId: authority.approvalRecordId,
  };
  const observedOwner = {
    repository: ownerPayload.repository,
    incidentIssue: ownerPayload.incidentIssue,
    convergenceIssue: ownerPayload.convergenceIssue,
    ledgerId: ownerPayload.ledgerId,
    ledgerDigest: ownerPayload.ledgerDigest,
    approvalRecordId: ownerPayload.approvalRecordId,
  };
  const projectedOwner = authority.projection?.approvedLedgerOwner;
  if (
    authority.ownerRecordId !== owner.envelope.recordId ||
    canonicalRecordJson(exactOwner) !== canonicalRecordJson(observedOwner) ||
    (projectedOwner !== undefined &&
      (projectedOwner?.envelope?.recordId !== owner.envelope.recordId ||
        canonicalRecordJson(projectedOwner?.envelope?.payload) !==
          canonicalRecordJson(ownerPayload)))
  ) {
    fail('owner-authority-mismatch');
  }

  const rows = new Map((authority.ledgerPayload?.rows || []).map((row) => [row.issueNumber, row]));
  const recorded = new Set(
    (authority.projection?.incorporated || [])
      .filter((record) => {
        const row = rows.get(record?.envelope?.payload?.issueNumber);
        return row?.intendedOutcome === 'incorporated' && incorporatedRecordMatchesRow(record, row);
      })
      .map(({ envelope }) => envelope.payload.issueNumber)
  );
  const missingRows = INCIDENT_EPIC_TERMINAL_ISSUES.filter(
    (issue) => rows.get(issue)?.intendedOutcome !== 'incorporated'
  );
  if (missingRows.length > 0) fail('approved-row', missingRows);
  const missingRecords = INCIDENT_EPIC_TERMINAL_ISSUES.filter((issue) => !recorded.has(issue));
  if (missingRecords.length > 0) fail('missing-incorporated', missingRecords);

  const pending = [];
  const contradictory = [];
  for (const issue of INCIDENT_EPIC_TERMINAL_ISSUES) {
    const live = liveOutcomes?.[issue];
    if (
      live?.issueState === 'CLOSED' &&
      live?.issueStateReason === 'COMPLETED' &&
      live?.boardState === 'Done' &&
      live?.disposition === 'Incorporated'
    ) {
      continue;
    }
    if (live?.issueState === 'CLOSED' || live?.boardState === 'Done' || live?.disposition) {
      contradictory.push(issue);
    } else {
      pending.push(issue);
    }
  }
  if (contradictory.length > 0) fail('contradictory', contradictory);
  if (pending.length > 0) fail('pending', pending);

  return deepFreeze({
    repository,
    incidentIssue,
    convergenceIssue: authority.convergenceIssue,
    ledgerId: authority.ledgerId,
    ledgerDigest: authority.ledgerDigest,
    ownerRecordId: authority.ownerRecordId,
    requiredIssues: [...INCIDENT_EPIC_TERMINAL_ISSUES],
  });
}
