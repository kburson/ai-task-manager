// @story #1490
//
// Terminal-lifecycle recovery for a COMPLETED delivered-close transaction that
// survived a reopen.
//
// #1466's `--restart-stale-transaction` restarts a close that was interrupted
// PARTWAY: it accepts at most three completed steps and requires a null terminal
// disposition plus a ToDo/BLOCKED label. Those predicates are correct there and are
// deliberately NOT reused here — a close that ran to completion legitimately removed
// its managed labels and set disposition `Delivered`.
//
// This module covers the distinct shape where an issue was delivered and closed at
// one accepted SHA, then reopened so a corrective delivery could land at a new
// accepted SHA. The old transaction records a TRUE historical delivery and close, so
// it is never hand-retired; it is superseded by durable, read-back-verified evidence
// before the active marker is replaced with a fresh transaction carrying no completed
// steps. The normal eight-step saga then runs unchanged.
//
// Fail-closed throughout: every predicate below must hold, and any contradictory
// state refuses BEFORE any mutation.

import { randomUUID } from 'node:crypto';

import {
  readDeliveredCloseTransactions,
  TERMINAL_CLOSE_STEPS,
  upsertDeliveredCloseTransaction,
} from './close-convergence.mjs';
import { decodeCanonical, encodeCanonical, fingerprint } from './resident-action-ledger-codec.mjs';

export const REOPENED_CLOSE_RECOVERY_SCHEMA = 'aitm.reopened-close-recovery/v1';
export const REOPENED_CLOSE_RECOVERY_REASON = 'completed-close-reopened-corrective-delivery';

const SHA_RE = /^[0-9a-f]{40}$/;
const REVIEW_AUTHORITIES = new Set(['human-gate', 'gate-bypassed']);
const CLOSE_TRANSACTION_KEYS = Object.freeze([
  'acceptedSha',
  'completedSteps',
  'issueNumber',
  'reviewAuthority',
  'schema',
  'transactionId',
]);
const RECOVERY_RECORD_KEYS = Object.freeze([
  'actor',
  'completedSteps',
  'issueNumber',
  'newAcceptedSha',
  'newReviewAuthority',
  'oldAcceptedSha',
  'oldReviewAuthority',
  'oldTransactionId',
  'reason',
  'recoveryId',
  'replacementTransactionId',
  'repository',
  'schema',
  'ts',
]);
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export class ReopenedCloseRecoveryError extends TypeError {
  constructor(category) {
    super(`reopened-close-recovery:${category}`);
    this.name = 'ReopenedCloseRecoveryError';
    this.category = category;
  }
}

function fail(category) {
  throw new ReopenedCloseRecoveryError(category);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, keys) {
  if (!isPlainObject(value)) return false;
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

function isCanonicalInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

// The transaction must record the COMPLETE ordered terminal sequence. A partial or
// reordered prefix is #1466's territory, not this one.
function isCompleteTerminalSequence(steps) {
  return (
    Array.isArray(steps) &&
    steps.length === TERMINAL_CLOSE_STEPS.length &&
    steps.every((step, index) => step === TERMINAL_CLOSE_STEPS[index])
  );
}

function validateOldTransaction(oldTransaction, issueNumber) {
  if (
    !hasExactKeys(oldTransaction, CLOSE_TRANSACTION_KEYS) ||
    oldTransaction.schema !== 'aitm.delivered-close/v1' ||
    oldTransaction.issueNumber !== issueNumber ||
    typeof oldTransaction.transactionId !== 'string' ||
    oldTransaction.transactionId.length === 0 ||
    !SHA_RE.test(oldTransaction.acceptedSha || '') ||
    !REVIEW_AUTHORITIES.has(oldTransaction.reviewAuthority)
  ) {
    fail('old-transaction');
  }
  if (!isCompleteTerminalSequence(oldTransaction.completedSteps)) fail('incomplete-terminal-close');
}

// Live state must be exactly the reopened-after-completed-close shape. Note this
// requires disposition `Delivered` and does NOT require a managed label — the
// inverse of #1466's pre-terminal predicates.
function validateLive(live) {
  if (
    !isPlainObject(live) ||
    live.boardState !== 'review' ||
    live.issueClosed !== false ||
    live.stateReason !== 'reopened' ||
    live.terminalDisposition !== 'Delivered' ||
    live.dirty !== false ||
    live.bindingStatus !== 'pending'
  ) {
    fail('live-terminal-state');
  }
}

// Both SHAs must carry their own evidence, and it must be REAL: an immutable
// historical delivery receipt for the old SHA, and concretely resolved current
// Test / review / delivery results for the new one.
//
// Nothing here accepts a caller-asserted boolean. The first implementation passed
// `verified: true` and `deliveryVerified: true` as literals, which made these two
// conditions decorative. Every field below is a value the caller must have
// obtained by parsing a real record.
// A correlated {pullRequest, intent, receipt} bundle, not a receipt plus a boolean.
// Every field must agree across all three records; any disagreement refuses.
function validateDeliveryBundle(bundle, issueNumber, repository, acceptedSha, category) {
  if (!isPlainObject(bundle)) fail(category);
  const { pullRequest, intent, receipt } = bundle;
  if (
    !isPlainObject(pullRequest) ||
    !isPlainObject(intent) ||
    !isPlainObject(receipt) ||
    intent.schema !== 'aitm.delivery-intent/v1' ||
    receipt.schema !== 'aitm.delivery-receipt/v1'
  ) {
    fail(category);
  }
  // The pull request must genuinely be the merged delivery of this accepted SHA.
  if (
    pullRequest.headRefOid !== acceptedSha ||
    (pullRequest.merged !== true && String(pullRequest.state || '').toUpperCase() !== 'MERGED') ||
    !Number.isSafeInteger(pullRequest.number) ||
    pullRequest.number <= 0 ||
    !SHA_RE.test(pullRequest.mergeCommitSha || '')
  ) {
    fail(category);
  }
  // Exact agreement across pull request, intent, and receipt.
  if (
    intent.issueNumber !== issueNumber ||
    receipt.issueNumber !== issueNumber ||
    intent.repository !== repository ||
    intent.expectedHeadSha !== acceptedSha ||
    receipt.expectedHeadSha !== acceptedSha ||
    intent.prNumber !== pullRequest.number ||
    receipt.prNumber !== pullRequest.number ||
    receipt.mergeCommitSha !== pullRequest.mergeCommitSha ||
    receipt.intentId !== intent.intentId ||
    receipt.baseRef !== intent.baseRef ||
    receipt.mergeMethod !== intent.mergeMethod ||
    receipt.provider !== intent.provider ||
    intent.headRef !== pullRequest.headRefName ||
    intent.baseRef !== pullRequest.baseRefName ||
    receipt.result !== 'delivered'
  ) {
    fail(category);
  }
}

function validateEvidence(evidence, issueNumber, repository, oldAcceptedSha, newAcceptedSha) {
  if (!isPlainObject(evidence)) fail('evidence');
  // Historical: the immutable delivery of the OLD accepted SHA.
  validateDeliveryBundle(
    evidence.historical,
    issueNumber,
    repository,
    oldAcceptedSha,
    'historical-evidence'
  );
  // Current: Test and Review resolved at the NEW accepted SHA, plus the delivery
  // the verifier independently produced. `verifiedDelivery` comes from
  // `verification.receiptInput` — the verifier's own output — so comparing it to
  // the receipt is a real cross-check rather than a value compared to itself.
  const current = evidence.current;
  if (
    !isPlainObject(current) ||
    current.testReceiptSha !== newAcceptedSha ||
    current.reviewApprovedSha !== newAcceptedSha
  ) {
    fail('current-evidence');
  }
  validateDeliveryBundle(current, issueNumber, repository, newAcceptedSha, 'current-evidence');
  const verified = current.verifiedDelivery;
  if (
    !isPlainObject(verified) ||
    verified.issueNumber !== issueNumber ||
    verified.expectedHeadSha !== newAcceptedSha ||
    verified.prNumber !== current.pullRequest.number ||
    verified.mergeCommitSha !== current.pullRequest.mergeCommitSha ||
    verified.intentId !== current.intent.intentId
  ) {
    fail('current-evidence');
  }
  if (oldAcceptedSha === newAcceptedSha) fail('evidence');
}

function intentFromRecord(record) {
  return {
    actor: record.actor,
    completedSteps: [...record.completedSteps],
    issueNumber: record.issueNumber,
    newAcceptedSha: record.newAcceptedSha,
    newReviewAuthority: record.newReviewAuthority,
    oldAcceptedSha: record.oldAcceptedSha,
    oldReviewAuthority: record.oldReviewAuthority,
    oldTransactionId: record.oldTransactionId,
    reason: record.reason,
    repository: record.repository,
  };
}

function intentFromAuthorization(authorization) {
  return {
    actor: authorization.actor,
    completedSteps: [...authorization.oldTransaction.completedSteps],
    issueNumber: authorization.issueNumber,
    newAcceptedSha: authorization.newAcceptedSha,
    newReviewAuthority: authorization.newReviewAuthority,
    oldAcceptedSha: authorization.oldTransaction.acceptedSha,
    oldReviewAuthority: authorization.oldTransaction.reviewAuthority,
    oldTransactionId: authorization.oldTransaction.transactionId,
    reason: REOPENED_CLOSE_RECOVERY_REASON,
    repository: authorization.repository,
  };
}

// Deterministic identity over the intent, so a retry after a lost response resolves
// to the SAME recovery rather than minting a second one.
function recoveryId(intent) {
  return `close-reopened:${fingerprint(intent).replace(/^sha256:/, '')}`;
}

export function authorizeReopenedCloseRestart(input = {}) {
  const {
    repository,
    issueNumber,
    oldTransaction,
    newAcceptedSha,
    newReviewAuthority,
    actor,
    live,
    evidence,
  } = input;
  if (
    typeof repository !== 'string' ||
    !REPOSITORY_RE.test(repository) ||
    !Number.isSafeInteger(issueNumber) ||
    issueNumber <= 0 ||
    typeof actor !== 'string' ||
    actor.trim().length === 0
  ) {
    fail('input');
  }
  validateOldTransaction(oldTransaction, issueNumber);
  if (
    !SHA_RE.test(newAcceptedSha || '') ||
    oldTransaction.acceptedSha === newAcceptedSha ||
    !REVIEW_AUTHORITIES.has(newReviewAuthority)
  ) {
    fail('fresh-authority');
  }
  validateLive(live);
  validateEvidence(evidence, issueNumber, repository, oldTransaction.acceptedSha, newAcceptedSha);
  return deepFreeze({
    repository,
    issueNumber,
    oldTransaction: structuredClone(oldTransaction),
    newAcceptedSha,
    newReviewAuthority,
    actor,
    reason: REOPENED_CLOSE_RECOVERY_REASON,
    live: structuredClone(live),
    evidence: structuredClone(evidence),
  });
}

export function validateReopenedCloseRecoveryRecord(record) {
  if (!hasExactKeys(record, RECOVERY_RECORD_KEYS)) fail('record');
  if (
    record.schema !== REOPENED_CLOSE_RECOVERY_SCHEMA ||
    typeof record.repository !== 'string' ||
    !REPOSITORY_RE.test(record.repository) ||
    !Number.isSafeInteger(record.issueNumber) ||
    record.issueNumber <= 0 ||
    typeof record.oldTransactionId !== 'string' ||
    record.oldTransactionId.length === 0 ||
    typeof record.replacementTransactionId !== 'string' ||
    record.replacementTransactionId.length === 0 ||
    record.replacementTransactionId === record.oldTransactionId ||
    !SHA_RE.test(record.oldAcceptedSha || '') ||
    !SHA_RE.test(record.newAcceptedSha || '') ||
    record.oldAcceptedSha === record.newAcceptedSha ||
    !REVIEW_AUTHORITIES.has(record.oldReviewAuthority) ||
    !REVIEW_AUTHORITIES.has(record.newReviewAuthority) ||
    record.reason !== REOPENED_CLOSE_RECOVERY_REASON ||
    typeof record.actor !== 'string' ||
    record.actor.trim().length === 0 ||
    !isCanonicalInstant(record.ts) ||
    !isCompleteTerminalSequence(record.completedSteps) ||
    record.recoveryId !== recoveryId(intentFromRecord(record))
  ) {
    fail('record');
  }
  return deepFreeze(structuredClone(record));
}

export function createReopenedCloseRecoveryRecord(
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
  const intent = intentFromAuthorization(authorization);
  return validateReopenedCloseRecoveryRecord({
    schema: REOPENED_CLOSE_RECOVERY_SCHEMA,
    recoveryId: recoveryId(intent),
    ...intent,
    replacementTransactionId,
    ts: now,
  });
}

// ---- durable evidence codec -------------------------------------------------
//
// Substring matching on a comment body is not evidence. The first implementation
// asked whether a body "includes" the recovery id, which would accept any comment
// quoting it. This mirrors the audited codec in `delivered-close-supersession.mjs`:
// canonical render, exact hidden-marker parse, full record validation, and
// issue/repository/id correlation.

const RECOVERY_MARKER_RE =
  /<!--\s*aitm-reopened-close-recovery\s+id="([^"]+)"\s+data="([^"]+)"\s*-->/;
const RECOVERY_MARKER_GLOBAL_RE = new RegExp(RECOVERY_MARKER_RE.source, 'g');
const CLAIMS_RECOVERY_RE = /aitm-reopened-close-recovery/i;

export function renderReopenedCloseRecoveryComment(record) {
  const valid = validateReopenedCloseRecoveryRecord(record);
  return [
    'AITM reopened delivered-close recovery. Do not edit or delete this comment.',
    'It supersedes a completed close transaction that survived a reopen.',
    `<!-- aitm-reopened-close-recovery id="${valid.recoveryId}" data="${encodeCanonical(valid)}" -->`,
  ].join('\n');
}

function commentIssueMatches(issueUrl, repository, issueNumber) {
  if (typeof issueUrl !== 'string') return false;
  try {
    const url = new URL(issueUrl);
    return url.pathname === `/repos/${repository}/issues/${issueNumber}`;
  } catch {
    return false;
  }
}

export function parseReopenedCloseRecoveryComment(comment, context = {}) {
  const body = typeof comment?.body === 'string' ? comment.body : '';
  const matches = [...body.matchAll(RECOVERY_MARKER_GLOBAL_RE)];
  if (matches.length > 1) fail('malformed-comment');
  const match = RECOVERY_MARKER_RE.exec(body);
  if (!match) {
    // A body that CLAIMS to be recovery evidence but carries no well-formed
    // marker is malformed, not absent — it must never be silently skipped.
    if (CLAIMS_RECOVERY_RE.test(body)) fail('malformed-comment');
    return null;
  }
  let record;
  try {
    record = validateReopenedCloseRecoveryRecord(decodeCanonical(match[2]));
  } catch {
    fail('malformed-comment');
  }
  const commentId = comment?.id == null ? '' : String(comment.id);
  if (
    match[1] !== record.recoveryId ||
    record.repository !== context.repository ||
    record.issueNumber !== context.issueNumber ||
    !commentIssueMatches(comment?.issue_url, context.repository, context.issueNumber) ||
    commentId.length === 0
  ) {
    fail('malformed-comment');
  }
  return deepFreeze({ commentId, record, body });
}

// Find durable evidence for THIS exact intent. A record whose intent differs is a
// different recovery and must not be reused.
export function resolveReopenedCloseRecovery({ authorization, comments, record }) {
  if (!Array.isArray(comments)) fail('persistence-input');
  const context = {
    repository: authorization.repository,
    issueNumber: authorization.issueNumber,
  };
  const parsed = comments
    .map((comment) => parseReopenedCloseRecoveryComment(comment, context))
    .filter((entry) => entry !== null)
    .filter((entry) => entry.record.recoveryId === record.recoveryId);
  if (parsed.length > 1) fail('ambiguous-evidence');
  if (parsed.length === 0) return deepFreeze({ status: 'absent', record: null });
  const durable = parsed[0].record;
  if (!sameValue(intentFromRecord(durable), intentFromAuthorization(authorization))) {
    fail('audit-authority');
  }
  // Retry reuses the DURABLE replacement id; never mint a second one.
  return deepFreeze({ status: 'present', record: durable, commentId: parsed[0].commentId });
}

// The replacement carries the CURRENT accepted SHA and NO completed steps, so the
// normal eight-step saga runs from the beginning.
export function replacementTransaction(authorization, record) {
  return deepFreeze({
    schema: 'aitm.delivered-close/v1',
    transactionId: record.replacementTransactionId,
    issueNumber: authorization.issueNumber,
    acceptedSha: authorization.newAcceptedSha,
    reviewAuthority: authorization.newReviewAuthority,
    completedSteps: [],
  });
}

// Reconstruct the old transaction from durable evidence. Used at interruption
// point two, where the body already carries the replacement so the original
// transaction is no longer readable from it.
export function oldTransactionFromRecord(record) {
  const valid = validateReopenedCloseRecoveryRecord(record);
  return deepFreeze({
    schema: 'aitm.delivered-close/v1',
    transactionId: valid.oldTransactionId,
    issueNumber: valid.issueNumber,
    acceptedSha: valid.oldAcceptedSha,
    reviewAuthority: valid.oldReviewAuthority,
    completedSteps: [...valid.completedSteps],
  });
}

// Classify what a body shows relative to durable evidence, so a retry resumes from
// the right point instead of re-running a completed step.
export function classifyRecoveryProgress(body, authorization, record) {
  const valid = validateReopenedCloseRecoveryRecord(record);
  const current = readDeliveredCloseTransactions(body);
  if (current.length !== 1) fail('ambiguous-body');
  const expected = replacementTransaction(authorization, valid);
  if (sameValue(current[0], expected)) {
    return deepFreeze({ phase: 'body-replaced', transaction: expected });
  }
  if (sameValue(current[0], oldTransactionFromRecord(valid))) {
    return deepFreeze({ phase: 'body-pending', transaction: null });
  }
  fail('stale-body');
}

export function replaceCompletedDeliveredCloseTransaction(body, authorization, recordInput) {
  const record = validateReopenedCloseRecoveryRecord(recordInput);
  if (!sameValue(intentFromRecord(record), intentFromAuthorization(authorization))) {
    fail('audit-authority');
  }
  const current = readDeliveredCloseTransactions(body);
  if (current.length !== 1) fail('ambiguous-body');
  const transaction = replacementTransaction(authorization, record);
  // Idempotent: a retry after the marker was already replaced is a no-op.
  if (sameValue(current[0], transaction)) {
    return deepFreeze({ status: 'already-replaced', body, transaction });
  }
  if (!sameValue(current[0], authorization.oldTransaction)) fail('stale-body');
  return deepFreeze({
    status: 'replaced',
    body: upsertDeliveredCloseTransaction(body, transaction),
    transaction,
  });
}
