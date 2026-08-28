import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import { hashRecordPayload, renderAitmRecord } from './github-records/record-envelope.mjs';

const LEDGER_SCHEMA = 'aitm.delivery-incident-ledger/v1';
const APPROVAL_GRANT_SCHEMA = 'aitm.delivery-incident-ledger-approval-grant/v1';
const APPROVAL_SCHEMA = 'aitm.delivery-incident-ledger-approval/v1';
const OWNER_SCHEMA = 'aitm.delivery-incident-ledger-owner/v1';
const INCORPORATED_SCHEMA = 'aitm.delivery-incident-incorporated/v1';

const LEDGER_TYPE = 'delivery-incident-ledger';
const APPROVAL_GRANT_TYPE = 'delivery-incident-ledger-approval-grant';
const APPROVAL_TYPE = 'delivery-incident-ledger-approval';
const OWNER_TYPE = 'delivery-incident-ledger-owner';
const INCORPORATED_TYPE = 'delivery-incident-incorporated';

const LEDGER_KEYS = [
  'schema',
  'ledgerId',
  'repository',
  'incidentIssue',
  'convergenceIssue',
  'baselineTrunkSha',
  'rows',
];
const ROW_KEYS = [
  'issueNumber',
  'observedGitHubState',
  'observedBoardState',
  'acceptedSha',
  'prNumber',
  'prHeadSha',
  'mergeSha',
  'intentUrl',
  'receiptUrl',
  'approvalMode',
  'approvalSha',
  'codeOnTrunk',
  'codeOnTrunkBasis',
  'blocker',
  'intendedOutcome',
];
const APPROVAL_GRANT_KEYS = [
  'schema',
  'repository',
  'convergenceIssue',
  'ledgerId',
  'ledgerDigest',
  'ledgerRecordId',
];
const APPROVAL_KEYS = [
  'schema',
  'repository',
  'convergenceIssue',
  'ledgerId',
  'ledgerDigest',
  'ledgerRecordId',
  'grantRecordId',
  'approvedBy',
  'approvedAt',
];
const OWNER_KEYS = [
  'schema',
  'repository',
  'incidentIssue',
  'convergenceIssue',
  'ledgerId',
  'ledgerDigest',
  'approvalRecordId',
];
const INCORPORATED_KEYS = [
  'schema',
  'repository',
  'issueNumber',
  'convergenceIssue',
  'ledgerId',
  'ledgerDigest',
  'approvalRecordId',
  'acceptedSha',
  'prNumber',
  'prHeadSha',
  'mergeSha',
  'codeOnTrunkBasis',
  'blocker',
];

const SHA_RE = /^[0-9a-f]{40}$/;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MAX_FIELD_BYTES = 1024;
const MAX_URL_BYTES = 2048;
const MAX_RECORDS = 4096;

export const REVIEWED_INCIDENT_ISSUES = Object.freeze([
  1378, 1379, 1380, 1381, 1382, 1383, 1384, 1386, 1387, 1388, 1389, 1390, 1392, 1393, 1395, 1397,
  1399, 1401, 1403,
]);

const REQUIRED_OUTCOME = new Map([
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

function incidentError(category) {
  return new TypeError(`delivery-incident:${category}`);
}

function isPlainDataObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== 'string') return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
  });
}

function hasExactlyKeys(value, expectedKeys) {
  if (!isPlainDataObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function immutableCopy(value) {
  canonicalRecordJson(value);
  return deepFreeze(structuredClone(value));
}

function assertExactKeys(value, keys, category) {
  if (!hasExactlyKeys(value, keys)) throw incidentError(category);
}

function assertPositiveInteger(value, category) {
  if (!Number.isSafeInteger(value) || value <= 0) throw incidentError(category);
}

function assertRepository(value) {
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value, 'utf8') > 256 ||
    !REPOSITORY_RE.test(value)
  ) {
    throw incidentError('repository');
  }
}

function hasForbiddenControl(value) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function assertBoundedString(value, category, maximumBytes = MAX_FIELD_BYTES) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    !value.isWellFormed() ||
    hasForbiddenControl(value) ||
    Buffer.byteLength(value, 'utf8') > maximumBytes
  ) {
    throw incidentError(category);
  }
}

function assertNullableString(value, category) {
  if (value !== null) assertBoundedString(value, category);
}

function assertSha(value, category) {
  if (typeof value !== 'string' || !SHA_RE.test(value)) throw incidentError(category);
}

function assertNullableSha(value, category) {
  if (value !== null) assertSha(value, category);
}

function assertNullablePositiveInteger(value, category) {
  if (value !== null) assertPositiveInteger(value, category);
}

function assertRecordId(value, category) {
  if (typeof value !== 'string' || !ULID_RE.test(value)) throw incidentError(category);
}

function assertDigest(value, category) {
  if (typeof value !== 'string' || !DIGEST_RE.test(value)) throw incidentError(category);
}

function assertCanonicalInstant(value, category) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw incidentError(category);
  }
}

function assertNullableHttpsUrl(value, category) {
  if (value === null) return;
  assertBoundedString(value, category, MAX_URL_BYTES);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw incidentError(category);
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.href !== value
  ) {
    throw incidentError(category);
  }
}

function validateRow(row, expectedIssue) {
  assertExactKeys(row, ROW_KEYS, 'row-keys');
  if (row.issueNumber !== expectedIssue) throw incidentError('reviewed-set');
  if (row.intendedOutcome !== REQUIRED_OUTCOME.get(expectedIssue)) {
    throw incidentError('intended-outcome');
  }
  if (!['OPEN', 'CLOSED'].includes(row.observedGitHubState)) {
    throw incidentError('github-state');
  }
  assertBoundedString(row.observedBoardState, 'board-state');
  assertNullableSha(row.acceptedSha, 'accepted-sha');
  assertNullablePositiveInteger(row.prNumber, 'pr-number');
  assertNullableSha(row.prHeadSha, 'pr-head-sha');
  assertNullableSha(row.mergeSha, 'merge-sha');
  assertNullableHttpsUrl(row.intentUrl, 'intent-url');
  assertNullableHttpsUrl(row.receiptUrl, 'receipt-url');
  assertNullableString(row.approvalMode, 'approval-mode');
  assertNullableSha(row.approvalSha, 'approval-sha');
  if (typeof row.codeOnTrunk !== 'boolean') throw incidentError('code-on-trunk');
  assertNullableString(row.codeOnTrunkBasis, 'code-on-trunk-basis');
  assertNullableString(row.blocker, 'blocker');
  if (expectedIssue === 1403) {
    if (
      row.prNumber !== 1404 ||
      row.acceptedSha !== 'ec160af0b03df8453fa0a1ad7f91b7138aeda38d' ||
      row.prHeadSha !== 'ec160af0b03df8453fa0a1ad7f91b7138aeda38d' ||
      row.mergeSha !== '19c6f54b0354699b988c470a99f122edab3aa2ba' ||
      row.codeOnTrunk !== true ||
      row.codeOnTrunkBasis !== 'carrier-pr' ||
      !/historical merge method/i.test(row.blocker || '') ||
      !/intent\/receipt/i.test(row.blocker || '') ||
      !/prohibit.*Delivered/i.test(row.blocker || '')
    ) {
      throw incidentError('issue-1403-evidence');
    }
  }
}

export function buildIncidentLedgerPayload(input) {
  assertExactKeys(input, LEDGER_KEYS, 'ledger-keys');
  if (input.schema !== LEDGER_SCHEMA) throw incidentError('ledger-schema');
  assertRecordId(input.ledgerId, 'ledger-id');
  assertRepository(input.repository);
  if (input.incidentIssue !== 939) throw incidentError('incident-issue');
  if (input.convergenceIssue !== 1381) throw incidentError('convergence-issue');
  assertSha(input.baselineTrunkSha, 'baseline-trunk-sha');
  if (!Array.isArray(input.rows) || input.rows.length !== REVIEWED_INCIDENT_ISSUES.length) {
    throw incidentError('reviewed-set');
  }
  input.rows.forEach((row, index) => validateRow(row, REVIEWED_INCIDENT_ISSUES[index]));
  return immutableCopy(input);
}

export function buildIncidentLedgerApprovalPayload(input) {
  assertExactKeys(input, APPROVAL_KEYS, 'approval-keys');
  if (input.schema !== APPROVAL_SCHEMA) throw incidentError('approval-schema');
  assertRepository(input.repository);
  if (input.convergenceIssue !== 1381) throw incidentError('convergence-issue');
  assertRecordId(input.ledgerId, 'ledger-id');
  assertDigest(input.ledgerDigest, 'ledger-digest');
  assertRecordId(input.ledgerRecordId, 'ledger-record-id');
  assertRecordId(input.grantRecordId, 'grant-record-id');
  assertBoundedString(input.approvedBy, 'approved-by', 256);
  assertCanonicalInstant(input.approvedAt, 'approved-at');
  return immutableCopy(input);
}

export function buildIncidentLedgerApprovalGrantPayload(input) {
  assertExactKeys(input, APPROVAL_GRANT_KEYS, 'approval-grant-keys');
  if (input.schema !== APPROVAL_GRANT_SCHEMA) throw incidentError('approval-grant-schema');
  assertRepository(input.repository);
  if (input.convergenceIssue !== 1381) throw incidentError('convergence-issue');
  assertRecordId(input.ledgerId, 'ledger-id');
  assertDigest(input.ledgerDigest, 'ledger-digest');
  assertRecordId(input.ledgerRecordId, 'ledger-record-id');
  return immutableCopy(input);
}

export function buildIncidentLedgerOwnerPayload(input) {
  assertExactKeys(input, OWNER_KEYS, 'owner-keys');
  if (input.schema !== OWNER_SCHEMA) throw incidentError('owner-schema');
  assertRepository(input.repository);
  if (input.incidentIssue !== 939) throw incidentError('incident-issue');
  if (input.convergenceIssue !== 1381) throw incidentError('convergence-issue');
  assertRecordId(input.ledgerId, 'ledger-id');
  assertDigest(input.ledgerDigest, 'ledger-digest');
  assertRecordId(input.approvalRecordId, 'approval-record-id');
  return immutableCopy(input);
}

export function buildIncorporatedPayload(input) {
  assertExactKeys(input, INCORPORATED_KEYS, 'incorporated-keys');
  if (input.schema !== INCORPORATED_SCHEMA) throw incidentError('incorporated-schema');
  assertRepository(input.repository);
  assertPositiveInteger(input.issueNumber, 'issue-number');
  if (REQUIRED_OUTCOME.get(input.issueNumber) !== 'incorporated') {
    throw incidentError('incorporated-issue');
  }
  if (input.convergenceIssue !== 1381) throw incidentError('convergence-issue');
  assertRecordId(input.ledgerId, 'ledger-id');
  assertDigest(input.ledgerDigest, 'ledger-digest');
  assertRecordId(input.approvalRecordId, 'approval-record-id');
  assertNullableSha(input.acceptedSha, 'accepted-sha');
  assertNullablePositiveInteger(input.prNumber, 'pr-number');
  assertNullableSha(input.prHeadSha, 'pr-head-sha');
  assertNullableSha(input.mergeSha, 'merge-sha');
  assertBoundedString(input.codeOnTrunkBasis, 'code-on-trunk-basis');
  assertBoundedString(input.blocker, 'blocker');
  return immutableCopy(input);
}

export function incidentLedgerOwnerRecordIdentity({
  repository,
  incidentIssue,
  convergenceIssue,
} = {}) {
  assertRepository(repository);
  assertPositiveInteger(incidentIssue, 'incident-issue');
  assertPositiveInteger(convergenceIssue, 'convergence-issue');
  return hashRecordPayload({ repository, incidentIssue, convergenceIssue });
}

export function incorporatedRecordIdentity({
  repository,
  issueNumber,
  convergenceIssue,
  ledgerId,
} = {}) {
  assertRepository(repository);
  assertPositiveInteger(issueNumber, 'issue-number');
  assertPositiveInteger(convergenceIssue, 'convergence-issue');
  assertRecordId(ledgerId, 'ledger-id');
  return hashRecordPayload({ repository, issueNumber, convergenceIssue, ledgerId });
}

export function incorporatedRecordMatchesRow(record, row) {
  const payload = record?.envelope?.payload;
  return (
    payload?.issueNumber === row?.issueNumber &&
    payload.acceptedSha === row.acceptedSha &&
    payload.prNumber === row.prNumber &&
    payload.prHeadSha === row.prHeadSha &&
    payload.mergeSha === row.mergeSha &&
    payload.codeOnTrunkBasis === row.codeOnTrunkBasis &&
    payload.blocker === row.blocker
  );
}

function validatedPayloadForEnvelope(envelope) {
  let payload;
  switch (envelope.recordType) {
    case LEDGER_TYPE:
      payload = buildIncidentLedgerPayload(envelope.payload);
      if (envelope.issue !== payload.convergenceIssue) throw incidentError('envelope-issue');
      break;
    case APPROVAL_GRANT_TYPE:
      payload = buildIncidentLedgerApprovalGrantPayload(envelope.payload);
      if (envelope.issue !== payload.convergenceIssue) throw incidentError('envelope-issue');
      break;
    case APPROVAL_TYPE:
      payload = buildIncidentLedgerApprovalPayload(envelope.payload);
      if (envelope.issue !== payload.convergenceIssue) throw incidentError('envelope-issue');
      if (envelope.authority.actor !== payload.approvedBy) {
        throw incidentError('approval-authority');
      }
      break;
    case OWNER_TYPE:
      payload = buildIncidentLedgerOwnerPayload(envelope.payload);
      if (envelope.issue !== payload.incidentIssue) throw incidentError('envelope-issue');
      break;
    case INCORPORATED_TYPE:
      payload = buildIncorporatedPayload(envelope.payload);
      if (envelope.issue !== payload.issueNumber) throw incidentError('envelope-issue');
      break;
    default:
      throw incidentError('record-type');
  }
  if (envelope.repository !== payload.repository) throw incidentError('envelope-repository');
  if (canonicalRecordJson(payload) !== canonicalRecordJson(envelope.payload)) {
    throw incidentError('noncanonical-payload');
  }
  return payload;
}

export function renderIncidentRecord({ envelope, visibleMarkdown = '' } = {}) {
  validatedPayloadForEnvelope(envelope);
  return renderAitmRecord({ envelope, visibleMarkdown });
}

function assertParsedRecord(record) {
  const hasProviderProvenance = hasExactlyKeys(record, [
    'id',
    'envelope',
    'authorLogin',
    'createdAt',
    'updatedAt',
  ]);
  if (!hasProviderProvenance && !hasExactlyKeys(record, ['id', 'envelope'])) {
    throw incidentError('project-record');
  }
  assertBoundedString(record.id, 'comment-id', 256);
  renderIncidentRecord({ envelope: record.envelope });
  if ([APPROVAL_GRANT_TYPE, APPROVAL_TYPE].includes(record.envelope.recordType)) {
    if (!hasProviderProvenance) throw incidentError('approval-authority');
    assertBoundedString(record.authorLogin, 'approval-authority', 256);
    assertCanonicalInstant(record.createdAt, 'approval-authority');
    assertCanonicalInstant(record.updatedAt, 'approval-authority');
    if (
      record.createdAt !== record.updatedAt ||
      record.envelope.authority.actor !== record.authorLogin ||
      (record.envelope.recordType === APPROVAL_TYPE &&
        record.envelope.payload.approvedBy !== record.authorLogin)
    ) {
      throw incidentError('approval-authority');
    }
  }
}

function assertApprovalGrantAuthority({ approvals, grants, ledgerByRecordId }) {
  const grantsByRecordId = new Map(grants.map((grant) => [grant.envelope.recordId, grant]));
  const usedGrantIds = new Set();
  for (const grant of grants) {
    const payload = grant.envelope.payload;
    const ledger = ledgerByRecordId.get(payload.ledgerRecordId);
    const ledgerPayload = ledger?.envelope.payload;
    if (
      !ledger ||
      payload.repository !== ledgerPayload.repository ||
      payload.convergenceIssue !== ledgerPayload.convergenceIssue ||
      payload.ledgerId !== ledgerPayload.ledgerId ||
      payload.ledgerDigest !== hashRecordPayload(ledgerPayload)
    ) {
      throw incidentError('stale-approval-grant');
    }
  }
  for (const approval of approvals) {
    const payload = approval.envelope.payload;
    const grant = grantsByRecordId.get(payload.grantRecordId);
    const grantPayload = grant?.envelope.payload;
    if (
      !grant ||
      usedGrantIds.has(payload.grantRecordId) ||
      payload.repository !== grantPayload.repository ||
      payload.convergenceIssue !== grantPayload.convergenceIssue ||
      payload.ledgerId !== grantPayload.ledgerId ||
      payload.ledgerDigest !== grantPayload.ledgerDigest ||
      payload.ledgerRecordId !== grantPayload.ledgerRecordId ||
      payload.approvedBy !== grant.authorLogin ||
      payload.approvedAt !== grant.createdAt ||
      approval.authorLogin !== grant.authorLogin
    ) {
      throw incidentError('approval-authority');
    }
    usedGrantIds.add(payload.grantRecordId);
  }
}

function approvalTips(approvals) {
  const approvalIds = new Set(approvals.map(({ envelope }) => envelope.recordId));
  const superseded = new Set();
  for (const { envelope } of approvals) {
    if (envelope.supersedes !== null) {
      if (!approvalIds.has(envelope.supersedes)) throw incidentError('stale-approval');
      superseded.add(envelope.supersedes);
    }
  }
  return approvals.filter(({ envelope }) => !superseded.has(envelope.recordId));
}

function assertOwnerAuthority({
  owners,
  approvedLedger,
  approvedLedgerApproval,
  approvalsByRecordId,
  ledgerByRecordId,
}) {
  if (owners.length === 0) throw incidentError('missing-owner');
  const ownerIds = new Set(owners.map(({ envelope }) => envelope.recordId));
  const superseded = new Set();
  for (const owner of owners) {
    const payload = owner.envelope.payload;
    const approval = approvalsByRecordId.get(payload.approvalRecordId);
    const ledger = approval
      ? ledgerByRecordId.get(approval.envelope.payload.ledgerRecordId)
      : undefined;
    const ledgerPayload = ledger?.envelope.payload;
    if (
      !approval ||
      !ledger ||
      payload.repository !== ledgerPayload.repository ||
      payload.incidentIssue !== ledgerPayload.incidentIssue ||
      payload.convergenceIssue !== ledgerPayload.convergenceIssue ||
      payload.ledgerId !== ledgerPayload.ledgerId ||
      payload.ledgerDigest !== hashRecordPayload(ledgerPayload)
    ) {
      throw incidentError('conflicting-owner');
    }
    if (owner.envelope.supersedes !== null) {
      if (!ownerIds.has(owner.envelope.supersedes)) throw incidentError('stale-owner');
      superseded.add(owner.envelope.supersedes);
    }
  }
  const tips = owners.filter(({ envelope }) => !superseded.has(envelope.recordId));
  if (tips.length !== 1) throw incidentError('ambiguous-owner');
  const owner = tips[0];
  const payload = owner.envelope.payload;
  const approvedPayload = approvedLedger.envelope.payload;
  if (
    payload.repository !== approvedPayload.repository ||
    payload.incidentIssue !== approvedPayload.incidentIssue ||
    payload.convergenceIssue !== approvedPayload.convergenceIssue ||
    payload.ledgerId !== approvedPayload.ledgerId ||
    payload.ledgerDigest !== hashRecordPayload(approvedPayload) ||
    payload.approvalRecordId !== approvedLedgerApproval.envelope.recordId
  ) {
    throw incidentError('conflicting-owner');
  }
  return owner;
}

function assertIncorporatedAuthority({
  records,
  approvedLedger,
  approvedLedgerApproval,
  approvalsByRecordId,
  ledgersByLedgerId,
}) {
  const seenIdentities = new Set();
  const approvedRecords = [];
  for (const record of records) {
    const payload = record.envelope.payload;
    const identity = incorporatedRecordIdentity(payload);
    if (seenIdentities.has(identity)) throw incidentError('ambiguous-incorporated');
    seenIdentities.add(identity);
    const ledger = ledgersByLedgerId.get(payload.ledgerId);
    const approval = approvalsByRecordId.get(payload.approvalRecordId);
    const ledgerPayload = ledger?.envelope.payload;
    const approvalPayload = approval?.envelope.payload;
    const rowsByIssue = new Map((ledgerPayload?.rows || []).map((row) => [row.issueNumber, row]));
    const row = rowsByIssue.get(payload.issueNumber);
    if (
      !ledger ||
      !approval ||
      row?.intendedOutcome !== 'incorporated' ||
      payload.repository !== ledgerPayload.repository ||
      payload.convergenceIssue !== ledgerPayload.convergenceIssue ||
      payload.ledgerDigest !== hashRecordPayload(ledgerPayload) ||
      approvalPayload.ledgerId !== ledgerPayload.ledgerId ||
      approvalPayload.ledgerRecordId !== ledger.envelope.recordId ||
      approvalPayload.ledgerDigest !== payload.ledgerDigest ||
      payload.acceptedSha !== row.acceptedSha ||
      payload.prNumber !== row.prNumber ||
      payload.prHeadSha !== row.prHeadSha ||
      payload.mergeSha !== row.mergeSha ||
      payload.codeOnTrunkBasis !== row.codeOnTrunkBasis ||
      payload.blocker !== row.blocker
    ) {
      throw incidentError('conflicting-incorporated');
    }
    if (payload.ledgerId === approvedLedger.envelope.payload.ledgerId) {
      if (payload.approvalRecordId !== approvedLedgerApproval.envelope.recordId) {
        throw incidentError('conflicting-incorporated');
      }
      approvedRecords.push(record);
    }
  }
  return approvedRecords;
}

export function projectDeliveryIncidentRecords(records) {
  if (!Array.isArray(records) || records.length === 0 || records.length > MAX_RECORDS) {
    throw incidentError('project-input');
  }
  const commentIds = new Set();
  const recordIds = new Set();
  const copies = records.map((record) => {
    assertParsedRecord(record);
    if (commentIds.has(record.id)) throw incidentError('duplicate-comment-id');
    if (recordIds.has(record.envelope.recordId)) throw incidentError('duplicate-record-id');
    commentIds.add(record.id);
    recordIds.add(record.envelope.recordId);
    return immutableCopy(record);
  });
  const ledgers = copies.filter(({ envelope }) => envelope.recordType === LEDGER_TYPE);
  const approvalGrants = copies.filter(
    ({ envelope }) => envelope.recordType === APPROVAL_GRANT_TYPE
  );
  const approvals = copies.filter(({ envelope }) => envelope.recordType === APPROVAL_TYPE);
  const owners = copies.filter(({ envelope }) => envelope.recordType === OWNER_TYPE);
  const incorporated = copies.filter(({ envelope }) => envelope.recordType === INCORPORATED_TYPE);
  if (ledgers.length === 0 || approvals.length === 0) throw incidentError('missing-authority');

  const ledgerByRecordId = new Map();
  const ledgersByLedgerId = new Map();
  for (const ledger of ledgers) {
    if (ledgersByLedgerId.has(ledger.envelope.payload.ledgerId))
      throw incidentError('conflicting-authority');
    ledgersByLedgerId.set(ledger.envelope.payload.ledgerId, ledger);
    ledgerByRecordId.set(ledger.envelope.recordId, ledger);
  }
  const approvalsByRecordId = new Map(
    approvals.map((approval) => [approval.envelope.recordId, approval])
  );
  assertApprovalGrantAuthority({ approvals, grants: approvalGrants, ledgerByRecordId });
  for (const approval of approvals) {
    const payload = approval.envelope.payload;
    const ledgerRecord = ledgerByRecordId.get(payload.ledgerRecordId);
    if (!ledgerRecord) throw incidentError('stale-approval');
    const ledgerPayload = ledgerRecord.envelope.payload;
    if (
      payload.repository !== ledgerPayload.repository ||
      payload.convergenceIssue !== ledgerPayload.convergenceIssue ||
      payload.ledgerId !== ledgerPayload.ledgerId ||
      payload.ledgerDigest !== hashRecordPayload(ledgerPayload)
    ) {
      throw incidentError('conflicting-authority');
    }
  }
  const tips = approvalTips(approvals);
  if (tips.length !== 1) throw incidentError('ambiguous-authority');
  const approvedLedger = ledgerByRecordId.get(tips[0].envelope.payload.ledgerRecordId);
  const approvedLedgerOwner = assertOwnerAuthority({
    owners,
    approvedLedger,
    approvedLedgerApproval: tips[0],
    approvalsByRecordId,
    ledgerByRecordId,
  });
  const approvedLedgerIncorporated = assertIncorporatedAuthority({
    records: incorporated,
    approvedLedger,
    approvedLedgerApproval: tips[0],
    approvalsByRecordId,
    ledgersByLedgerId,
  });
  return deepFreeze({
    ledgers,
    approvalGrants,
    approvals,
    owners,
    incorporated,
    approvedLedger,
    approvedLedgerApproval: tips[0],
    approvedLedgerOwner,
    approvedLedgerIncorporated,
  });
}
