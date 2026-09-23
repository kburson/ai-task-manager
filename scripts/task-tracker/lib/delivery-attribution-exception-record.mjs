// @story #1755
// Canonical, bounded authorization records for one delivery attribution scope.

import { createHash } from 'node:crypto';

import { canonicalRecordJson } from './github-records/canonical-json.mjs';

const SCHEMA = 'aitm.delivery-attribution-exception/v1';
const ID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const REF_RE = /^(?!\/)(?!.*(?:\/\/|\.\.))[A-Za-z0-9._/-]+(?<!\/)$/;
const TOKEN_RE = /^#[1-9][0-9]*$/;
const PROPOSAL_KEYS = [
  'exceptionId',
  'operationId',
  'repository',
  'issueNumber',
  'prNumber',
  'baseRef',
  'headRef',
  'headSha',
  'sourceDigest',
  'mappings',
  'attributionTokens',
  'expiresAt',
];
const RECORD_KEYS = [
  'schema',
  'kind',
  'recordId',
  'predecessorId',
  'proposal',
  'proposalDigest',
  'authority',
  'createdAt',
];
const AUTHORITY_KEYS = ['sourceReference', 'statement', 'actor', 'level'];
const MAX_COMMENT_BYTES = 60 * 1024;
const COMMENT_PREFIX = '### Delivery attribution exception\n\n';
const MARKER_PREFIX = '<!-- aitm-delivery-attribution-exception/v1 ';
const MARKER_SUFFIX = ' -->';

function fail(category) {
  throw new TypeError(`delivery-attribution-exception-record:${category}`);
}

function exact(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function positive(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function instant(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function printable(value, maxBytes) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value === value.trim() &&
    value.isWellFormed() &&
    Buffer.byteLength(value, 'utf8') <= maxBytes &&
    ![...value].some((character) => {
      const code = character.codePointAt(0);
      return code < 0x20 || code === 0x7f;
    })
  );
}

function rawSubject(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.isWellFormed() &&
    !value.includes('\n') &&
    !value.includes('\r')
  );
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function validateProposal(proposal) {
  canonicalRecordJson(proposal);
  if (!exact(proposal, PROPOSAL_KEYS)) fail('proposal-keys');
  if (!ID_RE.test(proposal.exceptionId) || !ID_RE.test(proposal.operationId)) fail('ids');
  if (
    !REPO_RE.test(proposal.repository) ||
    !positive(proposal.issueNumber) ||
    !positive(proposal.prNumber)
  )
    fail('target');
  if (
    !REF_RE.test(proposal.baseRef) ||
    !REF_RE.test(proposal.headRef) ||
    !SHA_RE.test(proposal.headSha) ||
    !DIGEST_RE.test(proposal.sourceDigest)
  )
    fail('scope');
  if (!instant(proposal.expiresAt)) fail('expiry');
  if (!Array.isArray(proposal.mappings)) fail('mappings');
  const seen = new Set();
  for (const mapping of proposal.mappings) {
    if (
      !exact(mapping, ['oid', 'messageHeadline', 'issueNumber']) ||
      !SHA_RE.test(mapping.oid) ||
      !rawSubject(mapping.messageHeadline) ||
      !positive(mapping.issueNumber) ||
      seen.has(mapping.oid)
    )
      fail('mapping');
    seen.add(mapping.oid);
  }
  if (
    !Array.isArray(proposal.attributionTokens) ||
    !proposal.attributionTokens.every(
      (token) => typeof token === 'string' && TOKEN_RE.test(token)
    ) ||
    proposal.attributionTokens.join('\0') !==
      [...new Set(proposal.attributionTokens)].sort().join('\0') ||
    !proposal.attributionTokens.includes(`#${proposal.issueNumber}`)
  )
    fail('tokens');
}

export function buildDeliveryAttributionProposal(input = {}) {
  validateProposal(input);
  const proposal = structuredClone(input);
  const canonicalBytes = canonicalRecordJson(proposal);
  return Object.freeze({ proposal, canonicalBytes, proposalDigest: sha256(canonicalBytes) });
}

function validateRecord(record) {
  canonicalRecordJson(record);
  if (!exact(record, RECORD_KEYS) || record.schema !== SCHEMA) fail('record-keys');
  if (!['grant', 'revision', 'revocation'].includes(record.kind)) fail('kind');
  if (
    !ID_RE.test(record.recordId) ||
    (record.predecessorId !== null && !ID_RE.test(record.predecessorId))
  )
    fail('links');
  if ((record.kind === 'grant') !== (record.predecessorId === null)) fail('predecessor');
  if (!instant(record.createdAt)) fail('created-at');
  if (Date.parse(record.createdAt) >= Date.parse(record.proposal?.expiresAt))
    fail('expired-at-write');
  const built = buildDeliveryAttributionProposal(record.proposal);
  if (record.proposalDigest !== built.proposalDigest) fail('proposal-digest');
  if (
    !exact(record.authority, AUTHORITY_KEYS) ||
    !printable(record.authority.sourceReference, 2048) ||
    !printable(record.authority.statement, 4096) ||
    !printable(record.authority.actor, 128) ||
    record.authority.level !== 'host-verified-user-message'
  )
    fail('authority');
  return record;
}

function renderValidated(record) {
  const json = canonicalRecordJson(record);
  const marker = `${MARKER_PREFIX}${Buffer.from(json).toString('base64url')}${MARKER_SUFFIX}`;
  return (
    `${COMMENT_PREFIX}- Kind: ${record.kind}\n- Issue: #${record.proposal.issueNumber}\n` +
    `- PR: #${record.proposal.prNumber}\n- Source: ${record.authority.sourceReference}\n\n${marker}`
  );
}

export function renderDeliveryAttributionExceptionComment(record) {
  validateRecord(record);
  const rendered = renderValidated(record);
  if (Buffer.byteLength(rendered, 'utf8') > MAX_COMMENT_BYTES) fail('comment-bytes');
  return rendered;
}

function scopeMatches(proposal, scope) {
  const keys = [
    'operationId',
    'repository',
    'issueNumber',
    'prNumber',
    'baseRef',
    'headRef',
    'headSha',
    'sourceDigest',
  ];
  return keys.every((key) => scope?.[key] === proposal[key]);
}

export function parseDeliveryAttributionExceptionComment(comment, context) {
  if (comment !== null && typeof comment === 'object' && !Array.isArray(comment)) {
    if (
      !(typeof comment.id === 'string' && comment.id.length > 0) ||
      !instant(comment.createdAt) ||
      !instant(comment.updatedAt) ||
      comment.createdAt !== comment.updatedAt
    )
      fail('edited-comment');
    comment = comment.body;
  }
  if (typeof comment !== 'string' || !comment.startsWith(COMMENT_PREFIX)) fail('comment');
  const start = comment.lastIndexOf(MARKER_PREFIX);
  if (start < 0 || !comment.endsWith(MARKER_SUFFIX)) fail('marker');
  const encoded = comment.slice(start + MARKER_PREFIX.length, -MARKER_SUFFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) fail('marker');
  let record;
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    record = JSON.parse(json);
    validateRecord(record);
    if (json !== canonicalRecordJson(record)) fail('canonical-bytes');
  } catch {
    fail('record');
  }
  if (renderDeliveryAttributionExceptionComment(record) !== comment) fail('edited-comment');
  if (context && !scopeMatches(record.proposal, context)) fail('scope');
  return record;
}

export function upperBoundDeliveryAttributionCommentBytes(proposal) {
  validateProposal(proposal);
  const record = {
    schema: SCHEMA,
    kind: 'revision',
    recordId: '7'.repeat(26),
    predecessorId: '7'.repeat(26),
    proposal,
    proposalDigest: sha256(canonicalRecordJson(proposal)),
    authority: {
      sourceReference: '"'.repeat(2048),
      statement: '"'.repeat(4096),
      actor: '"'.repeat(128),
      level: 'host-verified-user-message',
    },
    createdAt: '9999-12-31T23:59:59.999Z',
  };
  const bytes = Buffer.byteLength(renderValidated(record), 'utf8');
  if (bytes > MAX_COMMENT_BYTES) fail('comment-upper-bound');
  return bytes;
}

export function resolveActiveDeliveryAttributionException(comments, scope, now) {
  if (!Array.isArray(comments) || !instant(now)) fail('resolution-input');
  const records = [];
  for (const comment of comments) {
    const body = typeof comment === 'string' ? comment : comment?.body;
    if (typeof body !== 'string') fail('comment');
    if (!body.startsWith(COMMENT_PREFIX) && !body.includes('aitm-delivery-attribution-exception/'))
      continue;
    if (!body.includes('aitm-delivery-attribution-exception/v1')) fail('unsupported-schema');
    records.push(parseDeliveryAttributionExceptionComment(comment, scope));
  }
  if (records.length === 0) fail('missing-record');
  const byId = new Map();
  const exceptionIds = new Set();
  const sources = new Set();
  for (const record of records) {
    if (
      byId.has(record.recordId) ||
      exceptionIds.has(record.proposal.exceptionId) ||
      sources.has(record.authority.sourceReference)
    )
      fail('duplicate-identity');
    byId.set(record.recordId, record);
    exceptionIds.add(record.proposal.exceptionId);
    sources.add(record.authority.sourceReference);
  }
  const roots = records.filter((record) => record.predecessorId === null);
  if (roots.length !== 1) fail('roots');
  const children = new Map();
  for (const record of records) {
    if (record.predecessorId === null) continue;
    const predecessor = byId.get(record.predecessorId);
    if (
      !predecessor ||
      record.createdAt <= predecessor.createdAt ||
      predecessor.kind === 'revocation' ||
      children.has(record.predecessorId)
    )
      fail('chain');
    children.set(record.predecessorId, record);
  }
  const walked = new Set();
  let head = roots[0];
  while (head) {
    walked.add(head.recordId);
    const next = children.get(head.recordId);
    if (!next) break;
    head = next;
  }
  if (
    walked.size !== records.length ||
    head.kind === 'revocation' ||
    Date.parse(head.proposal.expiresAt) <= Date.parse(now)
  )
    fail('inactive');
  return head;
}
