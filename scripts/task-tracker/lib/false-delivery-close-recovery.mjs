// @story #1635
//
// Same-SHA terminal recovery for a completed close whose historical no-commit
// delivery premise was later proven false by a governed audit.

import { randomUUID } from 'node:crypto';

import {
  readDeliveredCloseTransactions,
  TERMINAL_CLOSE_STEPS,
  upsertDeliveredCloseTransaction,
} from './close-convergence.mjs';
import { decodeCanonical, encodeCanonical, fingerprint } from './resident-action-ledger-codec.mjs';

export const FALSE_DELIVERY_CLOSE_RECOVERY_SCHEMA = 'aitm.false-delivery-close-recovery/v1';
export const FALSE_DELIVERY_CLOSE_RECOVERY_REASON = 'historical-no-commit-false-delivery';

const SHA_RE = /^[0-9a-f]{40}$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const REVIEW_AUTHORITIES = new Set(['human-gate', 'gate-bypassed']);
const RECORD_KEYS = Object.freeze([
  'acceptedSha',
  'actor',
  'auditIssueNumber',
  'completedSteps',
  'currentReviewAuthority',
  'intentId',
  'issueNumber',
  'mergeCommitSha',
  'noCommitDeliverableUrl',
  'noCommitRecordId',
  'oldReviewAuthority',
  'oldTransactionId',
  'prNumber',
  'reason',
  'recoveryId',
  'recoveryIssueNumber',
  'replacementTransactionId',
  'repository',
  'schema',
  'ts',
]);

export class FalseDeliveryCloseRecoveryError extends TypeError {
  constructor(category) {
    super(`false-delivery-close-recovery:${category}`);
    this.name = 'FalseDeliveryCloseRecoveryError';
    this.category = category;
  }
}

function fail(category) {
  throw new FalseDeliveryCloseRecoveryError(category);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validIssueNumber(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function validInstant(value) {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return (
    Number.isFinite(parsed) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    new Date(parsed).toISOString() === value
  );
}

function completeTerminalSteps(steps) {
  return (
    Array.isArray(steps) &&
    steps.length === TERMINAL_CLOSE_STEPS.length &&
    steps.every((step, index) => step === TERMINAL_CLOSE_STEPS[index])
  );
}

function validateOldTransaction(transaction, issueNumber) {
  if (
    !isObject(transaction) ||
    transaction.schema !== 'aitm.delivered-close/v1' ||
    transaction.issueNumber !== issueNumber ||
    typeof transaction.transactionId !== 'string' ||
    transaction.transactionId.length === 0 ||
    !SHA_RE.test(transaction.acceptedSha || '') ||
    !REVIEW_AUTHORITIES.has(transaction.reviewAuthority) ||
    !completeTerminalSteps(transaction.completedSteps)
  ) {
    fail('old-transaction');
  }
}

function validateNoCommit(evidence, { repository, issueNumber, acceptedSha }) {
  const record = evidence?.record;
  if (
    !isObject(evidence) ||
    typeof evidence.id !== 'string' ||
    evidence.id.length === 0 ||
    !validInstant(evidence.createdAt) ||
    !isObject(record) ||
    record.schema !== 'aitm.no-commit-delivery/v1' ||
    record.result !== 'delivered' ||
    record.repository !== repository ||
    record.issueNumber !== issueNumber ||
    record.issueKind !== 'epic' ||
    record.acceptedSha !== acceptedSha ||
    typeof record.recordId !== 'string' ||
    record.recordId.length === 0 ||
    typeof record.deliverableUrl !== 'string' ||
    !record.deliverableUrl.startsWith('https://github.com/')
  ) {
    fail('historical-no-commit');
  }
}

function validateDeliveryBundle(current, { repository, issueNumber, acceptedSha }) {
  const { pullRequest, intent, receipt } = current || {};
  if (
    !isObject(current) ||
    !isObject(pullRequest) ||
    !isObject(intent) ||
    !isObject(receipt) ||
    intent.schema !== 'aitm.delivery-intent/v1' ||
    receipt.schema !== 'aitm.delivery-receipt/v1' ||
    current.testReceiptSha !== acceptedSha ||
    current.reviewApprovedSha !== acceptedSha ||
    pullRequest.headRefOid !== acceptedSha ||
    (pullRequest.merged !== true && String(pullRequest.state || '').toUpperCase() !== 'MERGED') ||
    pullRequest.baseRefName !== 'trunk' ||
    !validIssueNumber(pullRequest.number) ||
    !SHA_RE.test(pullRequest.mergeCommitSha || '') ||
    intent.repository !== repository ||
    intent.issueNumber !== issueNumber ||
    intent.expectedHeadSha !== acceptedSha ||
    intent.prNumber !== pullRequest.number ||
    intent.headRef !== pullRequest.headRefName ||
    intent.baseRef !== pullRequest.baseRefName ||
    receipt.issueNumber !== issueNumber ||
    receipt.expectedHeadSha !== acceptedSha ||
    receipt.prNumber !== pullRequest.number ||
    receipt.mergeCommitSha !== pullRequest.mergeCommitSha ||
    receipt.intentId !== intent.intentId ||
    receipt.baseRef !== intent.baseRef ||
    receipt.mergeMethod !== intent.mergeMethod ||
    receipt.provider !== intent.provider ||
    receipt.result !== 'delivered'
  ) {
    fail('current-evidence');
  }
  const verified = current.verifiedDelivery;
  if (
    !isObject(verified) ||
    verified.issueNumber !== issueNumber ||
    verified.expectedHeadSha !== acceptedSha ||
    verified.prNumber !== pullRequest.number ||
    verified.mergeCommitSha !== pullRequest.mergeCommitSha ||
    verified.intentId !== intent.intentId
  ) {
    fail('current-evidence');
  }
}

function validateAudit(audit, { auditIssueNumber, recoveryIssueNumber, issueNumber, acceptedSha }) {
  if (
    !isObject(audit) ||
    audit.issueNumber !== auditIssueNumber ||
    audit.state !== 'CLOSED' ||
    audit.disposition !== 'Delivered' ||
    typeof audit.deliverableUrl !== 'string' ||
    !audit.deliverableUrl.startsWith('https://github.com/') ||
    !isObject(audit.finding) ||
    audit.finding.issueNumber !== issueNumber ||
    audit.finding.acceptedSha !== acceptedSha ||
    audit.finding.classification !== 'false-Done' ||
    audit.finding.recoveryIssueNumber !== recoveryIssueNumber
  ) {
    fail('audit-authority');
  }
}

function validateRecovery(recovery, { recoveryIssueNumber, auditIssueNumber, issueNumber, actor }) {
  if (
    !isObject(recovery) ||
    recovery.issueNumber !== recoveryIssueNumber ||
    recovery.state !== 'OPEN' ||
    typeof recovery.boardState !== 'string' ||
    recovery.boardState === 'done' ||
    !Array.isArray(recovery.assignees) ||
    !recovery.assignees.includes(actor) ||
    !isObject(recovery.marker) ||
    recovery.marker.auditIssueNumber !== auditIssueNumber ||
    recovery.marker.issueNumber !== issueNumber
  ) {
    fail('recovery-authority');
  }
}

function validateLive(live) {
  const completedSteps = live?.completedSteps ?? [];
  const validPrefix =
    Array.isArray(completedSteps) &&
    completedSteps.length <= TERMINAL_CLOSE_STEPS.length &&
    completedSteps.every((step, index) => step === TERMINAL_CLOSE_STEPS[index]);
  const boardDone = completedSteps.includes('board');
  const issueDone = completedSteps.includes('issue');
  const bindingDone = completedSteps.includes('binding');
  if (
    !isObject(live) ||
    !validPrefix ||
    live.boardState !== (boardDone ? 'done' : 'review') ||
    live.issueClosed !== issueDone ||
    live.stateReason !== (issueDone ? 'completed' : 'reopened') ||
    live.terminalDisposition !== 'Delivered' ||
    live.dirty !== false ||
    (!bindingDone &&
      (live.bindingOwnership?.authorized !== true ||
        live.bindingOwnership?.disposition !== 'own-post-close-claim'))
  ) {
    fail('live-terminal-state');
  }
}

function recordIntent(value) {
  return {
    acceptedSha: value.acceptedSha,
    actor: value.actor,
    auditIssueNumber: value.auditIssueNumber,
    completedSteps: [...value.completedSteps],
    currentReviewAuthority: value.currentReviewAuthority,
    intentId: value.intentId,
    issueNumber: value.issueNumber,
    mergeCommitSha: value.mergeCommitSha,
    noCommitDeliverableUrl: value.noCommitDeliverableUrl,
    noCommitRecordId: value.noCommitRecordId,
    oldReviewAuthority: value.oldReviewAuthority,
    oldTransactionId: value.oldTransactionId,
    prNumber: value.prNumber,
    reason: value.reason,
    recoveryIssueNumber: value.recoveryIssueNumber,
    repository: value.repository,
  };
}

function authorizationIntent(authorization) {
  return recordIntent({
    acceptedSha: authorization.oldTransaction.acceptedSha,
    actor: authorization.actor,
    auditIssueNumber: authorization.auditIssueNumber,
    completedSteps: authorization.oldTransaction.completedSteps,
    currentReviewAuthority: authorization.currentReviewAuthority,
    intentId: authorization.currentDelivery.intent.intentId,
    issueNumber: authorization.issueNumber,
    mergeCommitSha: authorization.currentDelivery.pullRequest.mergeCommitSha,
    noCommitDeliverableUrl: authorization.historicalNoCommit.record.deliverableUrl,
    noCommitRecordId: authorization.historicalNoCommit.record.recordId,
    oldReviewAuthority: authorization.oldTransaction.reviewAuthority,
    oldTransactionId: authorization.oldTransaction.transactionId,
    prNumber: authorization.currentDelivery.pullRequest.number,
    reason: FALSE_DELIVERY_CLOSE_RECOVERY_REASON,
    recoveryIssueNumber: authorization.recoveryIssueNumber,
    repository: authorization.repository,
  });
}

function recoveryId(intent) {
  return `close-false-delivery:${fingerprint(intent).replace(/^sha256:/, '')}`;
}

export function authorizeFalseDeliveryCloseRestart(input = {}) {
  const {
    repository,
    issueNumber,
    auditIssueNumber,
    recoveryIssueNumber,
    actor,
    currentReviewAuthority,
    oldTransaction,
    historicalNoCommit,
    currentDelivery,
    audit,
    recovery,
    live,
  } = input;
  if (
    typeof repository !== 'string' ||
    !REPOSITORY_RE.test(repository) ||
    !validIssueNumber(issueNumber) ||
    !validIssueNumber(auditIssueNumber) ||
    !validIssueNumber(recoveryIssueNumber) ||
    new Set([issueNumber, auditIssueNumber, recoveryIssueNumber]).size !== 3 ||
    typeof actor !== 'string' ||
    actor.trim().length === 0 ||
    currentReviewAuthority !== 'human-gate'
  ) {
    fail('input');
  }
  validateOldTransaction(oldTransaction, issueNumber);
  validateNoCommit(historicalNoCommit, {
    repository,
    issueNumber,
    acceptedSha: oldTransaction.acceptedSha,
  });
  validateDeliveryBundle(currentDelivery, {
    repository,
    issueNumber,
    acceptedSha: oldTransaction.acceptedSha,
  });
  validateAudit(audit, {
    auditIssueNumber,
    recoveryIssueNumber,
    issueNumber,
    acceptedSha: oldTransaction.acceptedSha,
  });
  validateRecovery(recovery, { recoveryIssueNumber, auditIssueNumber, issueNumber, actor });
  validateLive(live);
  return deepFreeze({
    repository,
    issueNumber,
    auditIssueNumber,
    recoveryIssueNumber,
    actor,
    currentReviewAuthority,
    oldTransaction: structuredClone(oldTransaction),
    historicalNoCommit: structuredClone(historicalNoCommit),
    currentDelivery: structuredClone(currentDelivery),
    audit: structuredClone(audit),
    recovery: structuredClone(recovery),
    live: structuredClone(live),
    reason: FALSE_DELIVERY_CLOSE_RECOVERY_REASON,
  });
}

export function validateFalseDeliveryCloseRecoveryRecord(record) {
  if (!exactKeys(record, RECORD_KEYS)) fail('record');
  if (
    record.schema !== FALSE_DELIVERY_CLOSE_RECOVERY_SCHEMA ||
    typeof record.repository !== 'string' ||
    !REPOSITORY_RE.test(record.repository) ||
    !validIssueNumber(record.issueNumber) ||
    !validIssueNumber(record.auditIssueNumber) ||
    !validIssueNumber(record.recoveryIssueNumber) ||
    new Set([record.issueNumber, record.auditIssueNumber, record.recoveryIssueNumber]).size !== 3 ||
    typeof record.actor !== 'string' ||
    record.actor.trim().length === 0 ||
    !validInstant(record.ts) ||
    record.reason !== FALSE_DELIVERY_CLOSE_RECOVERY_REASON ||
    typeof record.oldTransactionId !== 'string' ||
    record.oldTransactionId.length === 0 ||
    typeof record.replacementTransactionId !== 'string' ||
    record.replacementTransactionId.length === 0 ||
    record.oldTransactionId === record.replacementTransactionId ||
    !SHA_RE.test(record.acceptedSha || '') ||
    !SHA_RE.test(record.mergeCommitSha || '') ||
    !REVIEW_AUTHORITIES.has(record.oldReviewAuthority) ||
    record.currentReviewAuthority !== 'human-gate' ||
    !completeTerminalSteps(record.completedSteps) ||
    typeof record.noCommitRecordId !== 'string' ||
    record.noCommitRecordId.length === 0 ||
    typeof record.noCommitDeliverableUrl !== 'string' ||
    !record.noCommitDeliverableUrl.startsWith('https://github.com/') ||
    !validIssueNumber(record.prNumber) ||
    typeof record.intentId !== 'string' ||
    record.intentId.length === 0 ||
    record.recoveryId !== recoveryId(recordIntent(record))
  ) {
    fail('record');
  }
  return deepFreeze(structuredClone(record));
}

export function createFalseDeliveryCloseRecoveryRecord(
  authorization,
  { now, randomUUIDFn = randomUUID } = {}
) {
  const replacementTransactionId = randomUUIDFn();
  if (
    typeof replacementTransactionId !== 'string' ||
    replacementTransactionId.length === 0 ||
    replacementTransactionId === authorization.oldTransaction.transactionId
  ) {
    fail('replacement-transaction-id');
  }
  const intent = authorizationIntent(authorization);
  return validateFalseDeliveryCloseRecoveryRecord({
    schema: FALSE_DELIVERY_CLOSE_RECOVERY_SCHEMA,
    recoveryId: recoveryId(intent),
    ...intent,
    replacementTransactionId,
    ts: now,
  });
}

export function renderFalseDeliveryCloseRecoveryComment(recordInput) {
  const record = validateFalseDeliveryCloseRecoveryRecord(recordInput);
  return [
    'AITM false-delivery close recovery. Do not edit or delete this comment.',
    'It supersedes the terminal effect of an audited historical no-commit delivery.',
    `<!-- aitm-false-delivery-close-recovery id="${record.recoveryId}" data="${encodeCanonical(record)}" -->`,
  ].join('\n');
}

const MARKER_RE =
  /<!--\s*aitm-false-delivery-close-recovery\s+id="([^"]+)"\s+data="([A-Za-z0-9_-]+)"\s*-->/g;
const CLAIM_RE = /aitm-false-delivery-close-recovery/i;

export function parseFalseDeliveryCloseRecoveryComment(comment, context = {}) {
  const body = typeof comment?.body === 'string' ? comment.body : '';
  const matches = [...body.matchAll(MARKER_RE)];
  if (matches.length === 0) {
    if (CLAIM_RE.test(body)) fail('malformed-comment');
    return null;
  }
  if (matches.length !== 1) fail('malformed-comment');
  let record;
  try {
    record = validateFalseDeliveryCloseRecoveryRecord(decodeCanonical(matches[0][2]));
  } catch {
    fail('malformed-comment');
  }
  if (
    matches[0][1] !== record.recoveryId ||
    body !== renderFalseDeliveryCloseRecoveryComment(record) ||
    record.repository !== context.repository ||
    record.issueNumber !== context.issueNumber ||
    comment?.id == null
  ) {
    fail('malformed-comment');
  }
  try {
    const url = new URL(comment.issue_url);
    if (url.pathname !== `/repos/${record.repository}/issues/${record.issueNumber}`) {
      fail('malformed-comment');
    }
  } catch {
    fail('malformed-comment');
  }
  return deepFreeze({ id: String(comment.id), body, record });
}

export function resolveFalseDeliveryCloseRecovery({ authorization, comments, record } = {}) {
  if (!Array.isArray(comments)) fail('persistence-input');
  const matches = comments
    .map((comment) =>
      parseFalseDeliveryCloseRecoveryComment(comment, {
        repository: authorization.repository,
        issueNumber: authorization.issueNumber,
      })
    )
    .filter(Boolean)
    .filter((entry) => entry.record.recoveryId === record.recoveryId);
  if (matches.length > 1) fail('ambiguous-evidence');
  if (matches.length === 0) return deepFreeze({ status: 'absent', record: null });
  if (!sameValue(recordIntent(matches[0].record), authorizationIntent(authorization))) {
    fail('audit-authority');
  }
  return deepFreeze({ status: 'present', record: matches[0].record, commentId: matches[0].id });
}

export function replacementFalseDeliveryTransaction(authorization, recordInput) {
  const record = validateFalseDeliveryCloseRecoveryRecord(recordInput);
  return deepFreeze({
    schema: 'aitm.delivered-close/v1',
    transactionId: record.replacementTransactionId,
    issueNumber: authorization.issueNumber,
    acceptedSha: authorization.oldTransaction.acceptedSha,
    reviewAuthority: authorization.currentReviewAuthority,
    completedSteps: [],
  });
}

export function oldFalseDeliveryTransactionFromRecord(recordInput) {
  const record = validateFalseDeliveryCloseRecoveryRecord(recordInput);
  return deepFreeze({
    schema: 'aitm.delivered-close/v1',
    transactionId: record.oldTransactionId,
    issueNumber: record.issueNumber,
    acceptedSha: record.acceptedSha,
    reviewAuthority: record.oldReviewAuthority,
    completedSteps: [...record.completedSteps],
  });
}

export function findFalseDeliveryRecoveryBackedReplacement({
  body,
  comments,
  repository,
  issueNumber,
} = {}) {
  const transactions = readDeliveredCloseTransactions(typeof body === 'string' ? body : '');
  if (transactions.length !== 1) {
    return deepFreeze({ status: 'none', record: null, transaction: null });
  }
  const transaction = transactions[0];
  const matches = (Array.isArray(comments) ? comments : [])
    .map((comment) => parseFalseDeliveryCloseRecoveryComment(comment, { repository, issueNumber }))
    .filter(Boolean)
    .filter(
      ({ record }) =>
        record.replacementTransactionId === transaction.transactionId &&
        record.acceptedSha === transaction.acceptedSha
    );
  if (matches.length > 1) {
    return deepFreeze({ status: 'ambiguous', record: null, transaction });
  }
  if (matches.length === 0) {
    return deepFreeze({ status: 'none', record: null, transaction });
  }
  return deepFreeze({ status: 'found', record: matches[0].record, transaction });
}

export function classifyFalseDeliveryRecoveryProgress(body, authorization, recordInput) {
  const record = validateFalseDeliveryCloseRecoveryRecord(recordInput);
  const transactions = readDeliveredCloseTransactions(body);
  if (transactions.length !== 1) fail('ambiguous-body');
  const observed = transactions[0];
  const expectedReplacement = replacementFalseDeliveryTransaction(authorization, record);
  const validPrefix =
    Array.isArray(observed.completedSteps) &&
    observed.completedSteps.length <= TERMINAL_CLOSE_STEPS.length &&
    observed.completedSteps.every((step, index) => step === TERMINAL_CLOSE_STEPS[index]);
  if (validPrefix && sameValue({ ...observed, completedSteps: [] }, expectedReplacement)) {
    return deepFreeze({ phase: 'body-replaced', transaction: observed });
  }
  if (sameValue(observed, oldFalseDeliveryTransactionFromRecord(record))) {
    return deepFreeze({ phase: 'body-pending', transaction: null });
  }
  fail('stale-body');
}

export function replaceFalseDeliveredCloseTransaction(body, authorization, recordInput) {
  const record = validateFalseDeliveryCloseRecoveryRecord(recordInput);
  if (!sameValue(recordIntent(record), authorizationIntent(authorization))) fail('audit-authority');
  const progress = classifyFalseDeliveryRecoveryProgress(body, authorization, record);
  if (progress.phase === 'body-replaced') {
    return deepFreeze({ status: 'already-replaced', body, transaction: progress.transaction });
  }
  const transaction = replacementFalseDeliveryTransaction(authorization, record);
  return deepFreeze({
    status: 'replaced',
    body: upsertDeliveredCloseTransaction(body, transaction),
    transaction,
  });
}
