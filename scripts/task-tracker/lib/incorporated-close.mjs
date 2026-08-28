import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import { createAitmRecordEnvelope, renderAitmRecord } from './github-records/record-envelope.mjs';
import {
  buildIncorporatedPayload,
  incorporatedRecordIdentity,
  renderIncidentRecord,
} from './delivery-incident-records.mjs';
import { resolveApprovedIncidentLedger } from './delivery-incident-reconciliation.mjs';
import { parseDeliveryCommentForPullRequest, projectDeliveryRecords } from './delivery-records.mjs';

const SHA_RE = /^[0-9a-f]{40}$/;
const CLOSE_TRANSACTION_TYPE = 'delivery-incident-incorporated-close';
const CLOSE_TRANSACTION_SCHEMA = 'aitm.delivery-incident-incorporated-close/v1';
const CLOSE_TRANSACTION_KEYS = Object.freeze([
  'schema',
  'repository',
  'issueNumber',
  'convergenceIssue',
  'ledgerId',
  'incorporatedRecordId',
  'acceptedSha',
  'authorizationDecision',
  'completedSteps',
]);
const REVIEW_AUTHORIZATION_KEYS = Object.freeze(['mode', 'source']);
const REVIEW_AUTHORIZATION_MODES = new Set(['full-auto', 'human']);
const REVIEW_AUTHORIZATION_SOURCES = new Set([
  'session',
  'project',
  'human-evidence',
  'directory-human-evidence',
]);
const REVIEW_AUTHORIZATION_SOURCE_BY_MODE = Object.freeze({
  'full-auto': new Set(['session', 'project']),
  human: new Set(['human-evidence', 'directory-human-evidence']),
});

export const INCORPORATED_CLOSE_STEPS = Object.freeze([
  'record',
  'timing',
  'disposition',
  'done',
  'close',
  'audit',
  'release',
]);

function fail(category) {
  throw new Error(`incorporated-close:${category}`);
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function sameCanonical(left, right) {
  try {
    return canonicalRecordJson(left) === canonicalRecordJson(right);
  } catch {
    return false;
  }
}

function exactKeys(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function exactCarrier(row, live) {
  return (
    live?.issueNumber === row.issueNumber &&
    live?.pullRequest?.number === row.prNumber &&
    live?.pullRequest?.headRefOid === row.prHeadSha &&
    live?.pullRequest?.mergeCommitSha === row.mergeSha
  );
}

function validateReviewAuthorization(value) {
  if (
    !exactKeys(value, REVIEW_AUTHORIZATION_KEYS) ||
    !REVIEW_AUTHORIZATION_MODES.has(value.mode) ||
    !REVIEW_AUTHORIZATION_SOURCES.has(value.source) ||
    !REVIEW_AUTHORIZATION_SOURCE_BY_MODE[value.mode]?.has(value.source)
  ) {
    fail('review-authorization');
  }
  return deepFreeze({ mode: value.mode, source: value.source });
}

export function projectExactDeliveryReceipt({
  comments,
  repository,
  issueNumber,
  prNumber,
  acceptedSha,
} = {}) {
  if (!Array.isArray(comments)) fail('delivery-receipt-conflict');
  const claims = comments.filter((comment) =>
    /<!--\s*aitm-delivery-(?:intent|receipt)\b/i.test(comment?.body || '')
  );
  if (claims.length === 0) return deepFreeze({ status: 'absent' });
  let parsed;
  try {
    parsed = claims
      .map((comment) =>
        parseDeliveryCommentForPullRequest(
          { id: comment.id, body: comment.body, createdAt: comment.createdAt },
          { repository, issueNumber, prNumber }
        )
      )
      .filter(Boolean);
  } catch {
    fail('delivery-receipt-conflict');
  }
  if (parsed.length === 0) return deepFreeze({ status: 'absent' });
  let projection;
  try {
    projection = projectDeliveryRecords(parsed);
  } catch {
    fail('delivery-receipt-conflict');
  }
  const exactReceipts = projection.receipts.filter(
    ({ record }) => record.expectedHeadSha === acceptedSha
  );
  if (exactReceipts.length > 1) fail('delivery-receipt-conflict');
  if (exactReceipts.length === 1) {
    return deepFreeze({ status: 'present', receipt: exactReceipts[0].record });
  }
  return deepFreeze({ status: 'absent' });
}

export function authorizeIncorporatedClose({
  repository,
  issueNumber,
  convergenceIssue,
  records,
  live,
  deps = {},
} = {}) {
  if (convergenceIssue !== 1381) fail('convergence-owner');
  const resolve = deps.resolveApprovedIncidentLedger || resolveApprovedIncidentLedger;
  const authority = resolve({ records, repository, convergenceIssue, incidentIssue: 939 });
  if (
    authority?.repository !== repository ||
    authority?.convergenceIssue !== convergenceIssue ||
    authority?.incidentIssue !== 939
  ) {
    fail('convergence-owner');
  }
  const rows = authority.ledgerPayload?.rows?.filter(
    (candidate) => candidate.issueNumber === issueNumber
  );
  if (rows?.length !== 1 || rows[0].intendedOutcome !== 'incorporated') fail('approved-row');
  const row = rows[0];
  if (
    typeof row.blocker !== 'string' ||
    row.blocker.length === 0 ||
    typeof row.codeOnTrunkBasis !== 'string' ||
    row.codeOnTrunkBasis.length === 0 ||
    row.codeOnTrunk !== true
  ) {
    fail('incomplete-delivery-explanation');
  }
  if (live?.acceptedEvidenceValid !== true || live?.acceptedSha !== row.acceptedSha) {
    fail('accepted-evidence');
  }
  if (live?.reviewAuthorizationValid !== true) fail('review-authorization');
  const reviewAuthorization = validateReviewAuthorization(live.reviewAuthorization);
  if (!exactCarrier(row, live)) fail('carrier-evidence');
  if (live?.sourceOnTrunk !== true || !SHA_RE.test(live?.trunkSha || '')) fail('trunk-evidence');
  if (live?.deliveryReceiptStatus === 'present') fail('delivery-receipt-exists');
  if (live?.deliveryReceiptStatus !== 'absent') fail('delivery-receipt-conflict');
  const issueState = String(live?.issueState || '').toUpperCase();
  const stateReason = String(live?.issueStateReason || '').toUpperCase();
  if (issueState === 'CLOSED') {
    if (live?.closeTransactionPresent !== true || stateReason !== 'COMPLETED') {
      fail('contradictory-terminal-state');
    }
  } else if (issueState !== 'OPEN') {
    fail('issue-state');
  }
  const carriers = live?.blockerCarriers;
  if (
    carriers?.labelCleared !== true ||
    carriers?.fieldCleared !== true ||
    carriers?.bodyCleared !== true
  ) {
    fail('blocker-not-cleared');
  }
  const incorporatedPayload = buildIncorporatedPayload({
    schema: 'aitm.delivery-incident-incorporated/v1',
    repository,
    issueNumber,
    convergenceIssue,
    ledgerId: authority.ledgerId,
    ledgerDigest: authority.ledgerDigest,
    approvalRecordId: authority.approvalRecordId,
    acceptedSha: row.acceptedSha,
    prNumber: row.prNumber,
    prHeadSha: row.prHeadSha,
    mergeSha: row.mergeSha,
    codeOnTrunkBasis: row.codeOnTrunkBasis,
    blocker: row.blocker,
  });
  return deepFreeze({
    repository,
    issueNumber,
    convergenceIssue,
    incidentIssue: authority.incidentIssue,
    ledgerId: authority.ledgerId,
    ledgerDigest: authority.ledgerDigest,
    approvalRecordId: authority.approvalRecordId,
    acceptedSha: row.acceptedSha,
    prNumber: row.prNumber,
    prHeadSha: row.prHeadSha,
    mergeSha: row.mergeSha,
    trunkSha: live.trunkSha,
    reviewAuthorization,
    incorporatedPayload,
  });
}

function exactIncorporatedRecords(records, authorization) {
  if (!Array.isArray(records)) fail('record-read');
  const expectedIdentity = incorporatedRecordIdentity(authorization.incorporatedPayload);
  const issueRecords = records.filter(({ envelope }) => {
    if (envelope?.recordType !== 'delivery-incident-incorporated') return false;
    return (
      envelope?.payload?.issueNumber === authorization.issueNumber &&
      envelope?.payload?.convergenceIssue === authorization.convergenceIssue
    );
  });
  const candidates = issueRecords.filter(({ envelope }) => {
    try {
      return incorporatedRecordIdentity(envelope.payload) === expectedIdentity;
    } catch {
      return false;
    }
  });
  if (issueRecords.length !== candidates.length || candidates.length > 1)
    fail('conflicting-record');
  if (
    candidates.length === 1 &&
    !sameCanonical(candidates[0].envelope.payload, authorization.incorporatedPayload)
  ) {
    fail('conflicting-record');
  }
  return candidates;
}

function buildCloseTransactionPayload(authorization, incorporatedRecordId, completedSteps) {
  const payload = {
    schema: CLOSE_TRANSACTION_SCHEMA,
    repository: authorization.repository,
    issueNumber: authorization.issueNumber,
    convergenceIssue: authorization.convergenceIssue,
    ledgerId: authorization.ledgerId,
    incorporatedRecordId,
    acceptedSha: authorization.acceptedSha,
    authorizationDecision: validateReviewAuthorization(authorization.reviewAuthorization),
    completedSteps: [...completedSteps],
  };
  if (
    !exactKeys(payload, CLOSE_TRANSACTION_KEYS) ||
    payload.completedSteps.length === 0 ||
    payload.completedSteps.length > INCORPORATED_CLOSE_STEPS.length ||
    payload.completedSteps.some((step, index) => step !== INCORPORATED_CLOSE_STEPS[index])
  ) {
    fail('transaction-steps');
  }
  return deepFreeze(payload);
}

function projectCloseTransaction(records, authorization, incorporatedRecordId) {
  const transactions = records.filter(
    ({ envelope }) => envelope?.recordType === CLOSE_TRANSACTION_TYPE
  );
  if (transactions.length === 0) return null;
  const byId = new Map();
  const successors = new Map();
  for (const transaction of transactions) {
    const { envelope } = transaction;
    if (byId.has(envelope.recordId)) fail('transaction-fork');
    const expected = buildCloseTransactionPayload(
      authorization,
      incorporatedRecordId,
      envelope.payload?.completedSteps || []
    );
    if (!sameCanonical(envelope.payload, expected)) fail('transaction-conflict');
    byId.set(envelope.recordId, transaction);
  }
  for (const transaction of transactions) {
    const parent = transaction.envelope.supersedes;
    if (parent === null) continue;
    if (!byId.has(parent) || successors.has(parent)) fail('transaction-fork');
    successors.set(parent, transaction.envelope.recordId);
  }
  const roots = transactions.filter(({ envelope }) => envelope.supersedes === null);
  const tips = transactions.filter(({ envelope }) => !successors.has(envelope.recordId));
  if (roots.length !== 1 || tips.length !== 1) fail('transaction-fork');
  let current = roots[0];
  let visited = 0;
  while (current) {
    visited += 1;
    const nextId = successors.get(current.envelope.recordId);
    if (!nextId) break;
    const next = byId.get(nextId);
    const currentSteps = current.envelope.payload.completedSteps;
    const nextSteps = next.envelope.payload.completedSteps;
    if (
      nextSteps.length !== currentSteps.length + 1 ||
      currentSteps.some((step, index) => nextSteps[index] !== step)
    ) {
      fail('transaction-steps');
    }
    current = next;
  }
  if (visited !== transactions.length || current.envelope.recordId !== tips[0].envelope.recordId) {
    fail('transaction-fork');
  }
  return current;
}

export function projectIncorporatedCloseReviewAuthority({
  records,
  repository,
  issueNumber,
  convergenceIssue,
  ledgerId,
  acceptedSha,
} = {}) {
  if (!Array.isArray(records)) fail('record-read');
  const transactions = records.filter(
    ({ envelope }) => envelope?.recordType === CLOSE_TRANSACTION_TYPE
  );
  if (transactions.length === 0) return null;
  const firstPayload = transactions[0].envelope?.payload;
  if (
    firstPayload?.repository !== repository ||
    firstPayload?.issueNumber !== issueNumber ||
    firstPayload?.convergenceIssue !== convergenceIssue ||
    firstPayload?.ledgerId !== ledgerId ||
    firstPayload?.acceptedSha !== acceptedSha
  ) {
    fail('transaction-conflict');
  }
  const reviewAuthorization = validateReviewAuthorization(firstPayload.authorizationDecision);
  const incorporatedRecordId = firstPayload.incorporatedRecordId;
  const incorporated = records.filter(
    ({ envelope }) =>
      envelope?.recordType === 'delivery-incident-incorporated' &&
      envelope?.recordId === incorporatedRecordId
  );
  if (incorporated.length !== 1) fail('transaction-conflict');
  const incorporatedPayload = incorporated[0].envelope.payload;
  if (
    incorporatedPayload?.repository !== repository ||
    incorporatedPayload?.issueNumber !== issueNumber ||
    incorporatedPayload?.convergenceIssue !== convergenceIssue ||
    incorporatedPayload?.ledgerId !== ledgerId ||
    incorporatedPayload?.acceptedSha !== acceptedSha
  ) {
    fail('transaction-conflict');
  }
  projectCloseTransaction(
    records,
    {
      repository,
      issueNumber,
      convergenceIssue,
      ledgerId,
      acceptedSha,
      reviewAuthorization,
    },
    incorporatedRecordId
  );
  return deepFreeze({ acceptedSha, reviewAuthorization });
}

async function appendCheckpoint({ deps, authorization, incorporatedRecordId, previous, steps }) {
  const payload = buildCloseTransactionPayload(authorization, incorporatedRecordId, steps);
  const envelope = deps.createCheckpointEnvelope
    ? deps.createCheckpointEnvelope({ payload, previous })
    : createAitmRecordEnvelope({
        recordType: CLOSE_TRANSACTION_TYPE,
        repository: authorization.repository,
        issue: authorization.issueNumber,
        payload,
        actor: 'aitm/incorporated-close',
        supersedes: previous?.envelope?.recordId ?? null,
      });
  try {
    await deps.appendCheckpointRecord({
      envelope,
      body: renderAitmRecord({
        envelope,
        visibleMarkdown: `AITM Incorporated close checkpoint: ${steps.at(-1)}.\n`,
      }),
    });
  } catch {
    // Recover only by projecting the provider's exact append-only chain.
  }
  const records = await deps.listIssueRecords();
  const tip = projectCloseTransaction(records, authorization, incorporatedRecordId);
  if (!tip || !sameCanonical(tip.envelope.payload, payload)) fail('transaction-write');
  return tip;
}

function normalizeCloseState(value) {
  if (typeof value === 'string') return { state: value.toUpperCase(), stateReason: '' };
  return {
    state: String(value?.state || '').toUpperCase(),
    stateReason: String(value?.stateReason || '').toUpperCase(),
  };
}

function assertExactTerminal({ disposition, status, closeState, audit, released }) {
  if (
    disposition !== 'Incorporated' ||
    status !== 'Done' ||
    closeState.state !== 'CLOSED' ||
    closeState.stateReason !== 'COMPLETED' ||
    audit !== true ||
    released !== true
  ) {
    fail('transaction-live-conflict');
  }
}

export async function runIncorporatedClose({ authorization, deps = {} } = {}) {
  if (!authorization?.incorporatedPayload) fail('authorization');
  const required = [
    'listIssueRecords',
    'appendIssueRecord',
    'appendCheckpointRecord',
    'flushTiming',
    'readDisposition',
    'writeDisposition',
    'readStatus',
    'writeStatusDone',
    'readIssueCloseState',
    'closeIssueCompleted',
    'hasAudit',
    'postAudit',
    'isBindingReleased',
    'releaseBinding',
  ];
  if (required.some((key) => typeof deps[key] !== 'function')) fail('dependencies');

  const mutatedSteps = [];
  let records = await deps.listIssueRecords();
  let [record] = exactIncorporatedRecords(records, authorization);
  const checkpointRecords = records.filter(
    ({ envelope }) => envelope?.recordType === CLOSE_TRANSACTION_TYPE
  );
  if (!record && checkpointRecords.length > 0) fail('transaction-conflict');
  let transaction = record
    ? projectCloseTransaction(records, authorization, record.envelope.recordId)
    : null;
  const [entryDisposition, entryStatus, entryCloseState] = await Promise.all([
    deps.readDisposition(),
    deps.readStatus(),
    deps.readIssueCloseState(),
  ]);
  const normalizedEntryClose = normalizeCloseState(entryCloseState);
  if (!transaction) {
    if (
      entryDisposition !== '' ||
      entryStatus === 'Done' ||
      normalizedEntryClose.state !== 'OPEN'
    ) {
      fail('contradictory-terminal-state');
    }
  } else if (entryDisposition !== '' && entryDisposition !== 'Incorporated') {
    fail('transaction-live-conflict');
  }

  if (!record) {
    const envelope = deps.createEnvelope
      ? deps.createEnvelope({ payload: authorization.incorporatedPayload, authorization })
      : createAitmRecordEnvelope({
          recordType: 'delivery-incident-incorporated',
          repository: authorization.repository,
          issue: authorization.issueNumber,
          payload: authorization.incorporatedPayload,
          actor: 'aitm/incorporated-close',
        });
    const render = deps.renderRecord || renderIncidentRecord;
    try {
      await deps.appendIssueRecord({
        envelope,
        body: render({ envelope, visibleMarkdown: 'AITM approved Incorporated outcome.\n' }),
      });
    } catch {
      // A lost response is recoverable only through exact provider readback.
    }
    records = await deps.listIssueRecords();
    [record] = exactIncorporatedRecords(records, authorization);
    if (!record) fail('record-write');
    mutatedSteps.push('record');
  }

  if (!transaction) {
    transaction = await appendCheckpoint({
      deps,
      authorization,
      incorporatedRecordId: record.envelope.recordId,
      previous: null,
      steps: ['record'],
    });
  }
  const entrySteps = transaction.envelope.payload.completedSteps;
  if (entrySteps.length === INCORPORATED_CLOSE_STEPS.length) {
    const [disposition, status, closeState, audit, released] = await Promise.all([
      deps.readDisposition(),
      deps.readStatus(),
      deps.readIssueCloseState(),
      deps.hasAudit({ recordId: record.envelope.recordId }),
      deps.isBindingReleased(),
    ]);
    assertExactTerminal({
      disposition,
      status,
      closeState: normalizeCloseState(closeState),
      audit,
      released,
    });
    return deepFreeze({
      status: 'already-incorporated',
      issueNumber: authorization.issueNumber,
      convergenceIssue: authorization.convergenceIssue,
      ledgerId: authorization.ledgerId,
      recordId: record.envelope.recordId,
      mutatedSteps,
    });
  }

  for (let index = entrySteps.length; index < INCORPORATED_CLOSE_STEPS.length; index += 1) {
    const step = INCORPORATED_CLOSE_STEPS[index];
    if (step === 'timing') {
      const timing = await deps.flushTiming(authorization.issueNumber);
      const timingCounts = ['delivered', 'discarded', 'retained'].every(
        (key) => Number.isInteger(timing?.[key]) && timing[key] >= 0
      );
      const pendingValid =
        timing?.pending === undefined || (Number.isInteger(timing.pending) && timing.pending >= 0);
      if (
        timing?.ok === false ||
        !timingCounts ||
        !pendingValid ||
        timing.discarded > 0 ||
        timing.retained > 0 ||
        (timing.pending || 0) > 0
      ) {
        fail('timing-pending');
      }
      mutatedSteps.push('timing');
    } else if (step === 'disposition') {
      const disposition = await deps.readDisposition();
      if (disposition === '') {
        await deps.writeDisposition({
          issueNumber: authorization.issueNumber,
          disposition: 'Incorporated',
        });
        if ((await deps.readDisposition()) !== 'Incorporated') fail('disposition-readback');
        mutatedSteps.push('disposition');
      } else if (disposition !== 'Incorporated') {
        fail('transaction-live-conflict');
      }
    } else if (step === 'done') {
      const status = await deps.readStatus();
      if (status !== 'Done') {
        await deps.writeStatusDone({ issueNumber: authorization.issueNumber });
        if ((await deps.readStatus()) !== 'Done') fail('status-readback');
        mutatedSteps.push('done');
      }
    } else if (step === 'close') {
      const closeState = normalizeCloseState(await deps.readIssueCloseState());
      if (closeState.state === 'OPEN') {
        await deps.closeIssueCompleted({ issueNumber: authorization.issueNumber });
        const readback = normalizeCloseState(await deps.readIssueCloseState());
        if (readback.state !== 'CLOSED' || readback.stateReason !== 'COMPLETED') {
          fail('issue-readback');
        }
        mutatedSteps.push('close');
      } else if (closeState.state !== 'CLOSED' || closeState.stateReason !== 'COMPLETED') {
        fail('transaction-live-conflict');
      }
    } else if (step === 'audit') {
      if ((await deps.hasAudit({ recordId: record.envelope.recordId })) !== true) {
        await deps.postAudit({ authorization, recordId: record.envelope.recordId });
        if ((await deps.hasAudit({ recordId: record.envelope.recordId })) !== true) {
          fail('audit-readback');
        }
        mutatedSteps.push('audit');
      }
    } else if (step === 'release') {
      if ((await deps.isBindingReleased()) !== true) {
        await deps.releaseBinding({ issueNumber: authorization.issueNumber });
        if ((await deps.isBindingReleased()) !== true) fail('binding-readback');
        mutatedSteps.push('release');
      }
    }
    transaction = await appendCheckpoint({
      deps,
      authorization,
      incorporatedRecordId: record.envelope.recordId,
      previous: transaction,
      steps: INCORPORATED_CLOSE_STEPS.slice(0, index + 1),
    });
  }

  return deepFreeze({
    status: 'incorporated',
    issueNumber: authorization.issueNumber,
    convergenceIssue: authorization.convergenceIssue,
    ledgerId: authorization.ledgerId,
    recordId: record.envelope.recordId,
    mutatedSteps,
  });
}
