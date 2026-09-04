// @story #1466

import { randomUUID } from 'node:crypto';

import {
  readDeliveredCloseTransactions,
  TERMINAL_CLOSE_STEPS,
  upsertDeliveredCloseTransaction,
} from './close-convergence.mjs';
import { normalizeGitHubInstant } from './github-records/github-comment-store.mjs';
import {
  canonicalJson,
  decodeCanonical,
  encodeCanonical,
  fingerprint,
} from './resident-action-ledger-codec.mjs';

export const DELIVERED_CLOSE_SUPERSESSION_SCHEMA = 'aitm.delivered-close-supersession/v1';
export const DELIVERED_CLOSE_RESTART_REASON = 'accepted-sha-corrective-amend';

const SHA_RE = /^[0-9a-f]{40}$/;
const REVIEW_AUTHORITIES = new Set(['human-gate', 'gate-bypassed']);
const CLOSE_MANAGED_LABELS = new Set(['ToDo', 'BLOCKED']);
const CLOSE_TRANSACTION_KEYS = Object.freeze([
  'acceptedSha',
  'completedSteps',
  'issueNumber',
  'reviewAuthority',
  'schema',
  'transactionId',
]);
const SUPERSESSION_RECORD_KEYS = Object.freeze([
  'completedSteps',
  'issueNumber',
  'newAcceptedSha',
  'newReviewAuthority',
  'oldAcceptedSha',
  'oldTransactionId',
  'reason',
  'replacementTransactionId',
  'repository',
  'schema',
  'supersessionId',
]);
const SUPERSESSION_MARKER_RE =
  /<!--\s*aitm-delivered-close-supersession\s+id="([^"]+)"\s+data="([A-Za-z0-9_-]+)"\s*-->/i;
const SUPERSESSION_MARKER_GLOBAL_RE =
  /<!--\s*aitm-delivered-close-supersession\s+id="([^"]+)"\s+data="([A-Za-z0-9_-]+)"\s*-->/gi;
const CLAIMS_SUPERSESSION_RE = /<!--\s*aitm-delivered-close-supersession\b/i;

export class DeliveredCloseSupersessionError extends TypeError {
  constructor(category) {
    super(`delivered-close-supersession:${category}`);
    this.name = 'DeliveredCloseSupersessionError';
    this.category = category;
  }
}

function fail(category) {
  throw new DeliveredCloseSupersessionError(category);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function validIssueNumber(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function validRepository(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

function hasExactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function sameValue(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function intentFromAuthorization(authorization) {
  return {
    completedSteps: [...authorization.oldTransaction.completedSteps],
    issueNumber: authorization.issueNumber,
    newAcceptedSha: authorization.newAcceptedSha,
    newReviewAuthority: authorization.newReviewAuthority,
    oldAcceptedSha: authorization.oldTransaction.acceptedSha,
    oldTransactionId: authorization.oldTransaction.transactionId,
    reason: DELIVERED_CLOSE_RESTART_REASON,
    repository: authorization.repository,
  };
}

function intentFromRecord(record) {
  return {
    completedSteps: [...record.completedSteps],
    issueNumber: record.issueNumber,
    newAcceptedSha: record.newAcceptedSha,
    newReviewAuthority: record.newReviewAuthority,
    oldAcceptedSha: record.oldAcceptedSha,
    oldTransactionId: record.oldTransactionId,
    reason: record.reason,
    repository: record.repository,
  };
}

function supersessionId(intent) {
  return `close-restart:${fingerprint(intent).replace(/^sha256:/, '')}`;
}

function validateRecord(record) {
  if (!hasExactKeys(record, SUPERSESSION_RECORD_KEYS)) fail('record');
  if (
    record.schema !== DELIVERED_CLOSE_SUPERSESSION_SCHEMA ||
    !validRepository(record.repository) ||
    !validIssueNumber(record.issueNumber) ||
    typeof record.oldTransactionId !== 'string' ||
    record.oldTransactionId.length === 0 ||
    typeof record.replacementTransactionId !== 'string' ||
    record.replacementTransactionId.length === 0 ||
    record.replacementTransactionId === record.oldTransactionId ||
    !SHA_RE.test(record.oldAcceptedSha || '') ||
    !SHA_RE.test(record.newAcceptedSha || '') ||
    record.oldAcceptedSha === record.newAcceptedSha ||
    !REVIEW_AUTHORITIES.has(record.newReviewAuthority) ||
    record.reason !== DELIVERED_CLOSE_RESTART_REASON ||
    !Array.isArray(record.completedSteps) ||
    record.completedSteps.length > 3 ||
    !record.completedSteps.every((step, index) => step === TERMINAL_CLOSE_STEPS[index]) ||
    record.supersessionId !== supersessionId(intentFromRecord(record))
  ) {
    fail('record');
  }
  return deepFreeze(structuredClone(record));
}

function createRecord(authorization, randomUUIDFn = randomUUID) {
  const replacementTransactionId = randomUUIDFn();
  if (
    typeof replacementTransactionId !== 'string' ||
    replacementTransactionId.length === 0 ||
    replacementTransactionId === authorization.oldTransaction.transactionId
  ) {
    fail('replacement-transaction-id');
  }
  const intent = intentFromAuthorization(authorization);
  return validateRecord({
    schema: DELIVERED_CLOSE_SUPERSESSION_SCHEMA,
    supersessionId: supersessionId(intent),
    ...intent,
    replacementTransactionId,
  });
}

export function authorizeDeliveredCloseRestart(input = {}) {
  const { repository, issueNumber, oldTransaction, newAcceptedSha, newReviewAuthority, live } =
    input;
  if (!validRepository(repository) || !validIssueNumber(issueNumber)) fail('input');
  if (
    !hasExactKeys(oldTransaction, CLOSE_TRANSACTION_KEYS) ||
    oldTransaction.schema !== 'aitm.delivered-close/v1' ||
    oldTransaction.issueNumber !== issueNumber ||
    typeof oldTransaction.transactionId !== 'string' ||
    oldTransaction.transactionId.length === 0 ||
    !SHA_RE.test(oldTransaction.acceptedSha || '') ||
    !REVIEW_AUTHORITIES.has(oldTransaction.reviewAuthority) ||
    !Array.isArray(oldTransaction.completedSteps)
  ) {
    fail('old-transaction');
  }
  if (
    !SHA_RE.test(newAcceptedSha || '') ||
    oldTransaction.acceptedSha === newAcceptedSha ||
    !REVIEW_AUTHORITIES.has(newReviewAuthority)
  ) {
    fail('fresh-authority');
  }
  const completedSteps = oldTransaction.completedSteps;
  if (
    completedSteps.length > 3 ||
    !completedSteps.every((step, index) => step === TERMINAL_CLOSE_STEPS[index])
  ) {
    fail('terminal-prefix');
  }
  if (
    !live ||
    live.boardState !== 'review' ||
    live.issueClosed !== false ||
    live.terminalDisposition !== null ||
    !Array.isArray(live.labels) ||
    !live.labels.some((label) => CLOSE_MANAGED_LABELS.has(label)) ||
    live.bindingStatus !== 'pending'
  ) {
    fail('live-terminal-state');
  }
  return deepFreeze({
    repository,
    issueNumber,
    oldTransaction: structuredClone(oldTransaction),
    newAcceptedSha,
    newReviewAuthority,
    reason: DELIVERED_CLOSE_RESTART_REASON,
    live: structuredClone(live),
  });
}

export function renderDeliveredCloseSupersessionComment(record) {
  const valid = validateRecord(record);
  return [
    'AITM Delivered close transaction supersession. Do not edit or delete this comment.',
    'Use the governed close recovery path for any correction.',
    `<!-- aitm-delivered-close-supersession id="${valid.supersessionId}" data="${encodeCanonical(valid)}" -->`,
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

export function parseDeliveredCloseSupersessionComment(comment, context = {}) {
  const body = typeof comment?.body === 'string' ? comment.body : '';
  const matches = [...body.matchAll(SUPERSESSION_MARKER_GLOBAL_RE)];
  if (matches.length > 1) fail('malformed-comment');
  const match = SUPERSESSION_MARKER_RE.exec(body);
  if (!match) {
    if (CLAIMS_SUPERSESSION_RE.test(body)) fail('malformed-comment');
    return null;
  }
  let record;
  try {
    record = validateRecord(decodeCanonical(match[2]));
  } catch {
    fail('malformed-comment');
  }
  const createdAt = normalizeGitHubInstant(comment?.created_at);
  const updatedAt = normalizeGitHubInstant(comment?.updated_at);
  const commentId = comment?.id == null ? '' : String(comment.id);
  const authorLogin = comment?.user?.login;
  if (
    match[1] !== record.supersessionId ||
    record.repository !== context.repository ||
    record.issueNumber !== context.issueNumber ||
    !commentIssueMatches(comment?.issue_url, context.repository, context.issueNumber) ||
    commentId.length === 0 ||
    typeof authorLogin !== 'string' ||
    authorLogin.length === 0 ||
    createdAt === null ||
    updatedAt === null ||
    createdAt !== updatedAt
  ) {
    fail('malformed-comment');
  }
  return deepFreeze({ commentId, authorLogin, createdAt, record, body });
}

export function resolveDeliveredCloseSupersession({
  authorization,
  comments,
  randomUUIDFn = randomUUID,
} = {}) {
  if (!authorization || !Array.isArray(comments)) fail('resolution-input');
  const evidence = comments
    .map((comment) =>
      parseDeliveredCloseSupersessionComment(comment, {
        repository: authorization.repository,
        issueNumber: authorization.issueNumber,
      })
    )
    .filter(Boolean)
    .filter(
      (candidate) =>
        candidate.record.oldTransactionId === authorization.oldTransaction.transactionId
    );
  if (evidence.length > 1) {
    const unique = new Set(evidence.map((candidate) => canonicalJson(candidate.record)));
    fail(unique.size === 1 ? 'duplicate-evidence' : 'conflicting-evidence');
  }
  if (evidence.length === 1) {
    if (!sameValue(intentFromRecord(evidence[0].record), intentFromAuthorization(authorization))) {
      fail('conflicting-evidence');
    }
    return deepFreeze({ action: 'reuse', record: evidence[0].record, evidence: evidence[0] });
  }
  return deepFreeze({
    action: 'create',
    record: createRecord(authorization, randomUUIDFn),
    evidence: null,
  });
}

function replacementTransaction(authorization, record) {
  return {
    schema: 'aitm.delivered-close/v1',
    transactionId: record.replacementTransactionId,
    issueNumber: authorization.issueNumber,
    acceptedSha: authorization.newAcceptedSha,
    reviewAuthority: authorization.newReviewAuthority,
    completedSteps: [],
  };
}

export function replaceStaleDeliveredCloseTransaction(body, authorization, recordInput) {
  const record = validateRecord(recordInput);
  if (!sameValue(intentFromRecord(record), intentFromAuthorization(authorization))) {
    fail('audit-authority');
  }
  const current = readDeliveredCloseTransactions(body);
  if (current.length !== 1) fail('stale-body');
  const transaction = replacementTransaction(authorization, record);
  const observed = current[0];
  const observedSteps = Array.isArray(observed.completedSteps) ? observed.completedSteps : null;
  const validObservedPrefix =
    observedSteps !== null &&
    observedSteps.length <= TERMINAL_CLOSE_STEPS.length &&
    observedSteps.every((step, index) => step === TERMINAL_CLOSE_STEPS[index]);
  if (validObservedPrefix && sameValue({ ...observed, completedSteps: [] }, transaction)) {
    return deepFreeze({ status: 'already-replaced', body, transaction: observed });
  }
  if (!sameValue(observed, authorization.oldTransaction)) fail('stale-body');
  return deepFreeze({
    status: 'replaced',
    body: upsertDeliveredCloseTransaction(body, transaction),
    transaction,
  });
}

export async function ensureDeliveredCloseSupersession({ authorization, deps = {} } = {}) {
  for (const key of ['listComments', 'createComment', 'readComment']) {
    if (typeof deps[key] !== 'function') fail('persistence-input');
  }
  const comments = await deps.listComments();
  const resolution = resolveDeliveredCloseSupersession({
    authorization,
    comments,
    randomUUIDFn: deps.randomUUIDFn,
  });
  if (resolution.action === 'reuse') return resolution.evidence;
  const body = renderDeliveredCloseSupersessionComment(resolution.record);
  const created = await deps.createComment(body);
  const id = created?.id == null ? '' : String(created.id);
  if (!id) fail('comment-id');
  const readback = await deps.readComment(id);
  const evidence = parseDeliveredCloseSupersessionComment(readback, {
    repository: authorization.repository,
    issueNumber: authorization.issueNumber,
  });
  if (
    evidence === null ||
    evidence.body !== body ||
    !sameValue(evidence.record, resolution.record)
  ) {
    fail('comment-readback');
  }
  return evidence;
}
