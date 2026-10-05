// @story #1859
import { createHash } from 'node:crypto';
import path from 'node:path';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';

export const LIMITS = Object.freeze({
  manifest: 8192,
  record: 8192,
  comment: 12288,
  pointer: 384,
  artifacts: 16,
  artifactBytes: 4194304,
  aggregateBytes: 16777216,
  body: 60000,
});
export const POLICY_MARKER = '<!-- aitm-scope-evidence-policy:v1 -->';
export class ReviewedScopeError extends Error {
  constructor(code, detail = '') {
    super(`${code}${detail ? ': ' + detail : ''}`);
    this.name = 'ReviewedScopeError';
    this.code = code;
  }
}
export function refuse(code, detail = '') {
  throw new ReviewedScopeError(code, detail);
}
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
function exact(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')
  )
    refuse('reviewed-scope-schema');
}
function text(value, max, { nonempty = true } = {}) {
  if (
    typeof value !== 'string' ||
    !value.isWellFormed() ||
    value.includes('\0') ||
    Buffer.byteLength(value) > max ||
    (nonempty && !value.trim())
  )
    refuse('reviewed-scope-text');
  return value;
}
function digest(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) refuse('reviewed-scope-digest');
}
function commit(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) refuse('reviewed-scope-head');
}
function id(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,19}$/.test(value)) refuse('reviewed-scope-id');
}
function issue(value) {
  if (!Number.isSafeInteger(value) || value < 1) refuse('reviewed-scope-issue');
}
function repository(value) {
  text(value, 256);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) refuse('reviewed-scope-repository');
}
function timestamp(value) {
  text(value, 32);
  if (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)
    refuse('reviewed-scope-time');
}
export function validateRelativePath(value) {
  text(value, 512);
  if (
    value.includes('\\') ||
    value.startsWith('/') ||
    value.split('/').some((p) => !p || p === '.' || p === '..')
  )
    refuse('reviewed-scope-artifact-path');
  return value;
}
export function validateManifest(value) {
  exact(value, [
    'schema',
    'repository',
    'issue',
    'worktree',
    'branch',
    'head',
    'label',
    'provenance',
    'rationale',
    'artifacts',
  ]);
  if (value.schema !== 'aitm.reviewed-scope-evidence/v1') refuse('reviewed-scope-schema');
  repository(value.repository);
  issue(value.issue);
  commit(value.head);
  text(value.worktree, 1024);
  if (!path.isAbsolute(value.worktree) || path.normalize(value.worktree) !== value.worktree)
    refuse('reviewed-scope-worktree');
  text(value.branch, 256);
  if (
    value.branch === 'HEAD' ||
    /[\s~^:?*\[\\]/.test(value.branch) ||
    value.branch.includes('..') ||
    value.branch.includes('@{') ||
    value.branch.includes('//') ||
    value.branch.startsWith('/') ||
    value.branch.endsWith('/')
  )
    refuse('reviewed-scope-branch');
  text(value.label, 1024);
  text(value.rationale, 2048);
  const p = value.provenance;
  if (p?.kind === 'operator-inspection') exact(p, ['kind']);
  else if (p?.kind === 'historical-command-output') {
    exact(p, [
      'kind',
      'command',
      'executedAt',
      'sourceRepository',
      'sourceIssue',
      'sourceCommit',
      'unknownCommitReason',
      'reportedOutcome',
    ]);
    text(p.command, 2048);
    timestamp(p.executedAt);
    repository(p.sourceRepository);
    issue(p.sourceIssue);
    text(p.reportedOutcome, 512);
    if (p.sourceCommit === null) text(p.unknownCommitReason, 512);
    else {
      commit(p.sourceCommit);
      if (p.unknownCommitReason !== null) refuse('reviewed-scope-provenance');
    }
  } else refuse('reviewed-scope-provenance');
  if (
    !Array.isArray(value.artifacts) ||
    !value.artifacts.length ||
    value.artifacts.length > LIMITS.artifacts
  )
    refuse('reviewed-scope-artifacts');
  let previous = null;
  for (const artifact of value.artifacts) {
    exact(artifact, ['path', 'sha256']);
    validateRelativePath(artifact.path);
    digest(artifact.sha256);
    if (previous !== null && artifact.path <= previous) refuse('reviewed-scope-artifacts');
    previous = artifact.path;
  }
  return value;
}
export function parseManifest(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > LIMITS.manifest)
    refuse('reviewed-scope-manifest-size');
  let source, value;
  try {
    source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    value = JSON.parse(source);
  } catch {
    refuse('reviewed-scope-manifest-json');
  }
  if (source.endsWith('\n')) source = source.slice(0, -1);
  if (canonicalRecordJson(value) !== source) refuse('reviewed-scope-manifest-canonical');
  return validateManifest(value);
}
export function requestDigest({ manifest, targetDigest }) {
  validateManifest(manifest);
  digest(targetDigest);
  return sha256(canonicalRecordJson({ manifest, targetDigest }));
}
export function lineageDigest({ repository: repo, issue: issueNumber, targetDigest }) {
  repository(repo);
  issue(issueNumber);
  digest(targetDigest);
  return sha256(canonicalRecordJson({ repository: repo, issue: issueNumber, targetDigest }));
}
function validateRecord(record) {
  exact(record, [
    'schema',
    'manifest',
    'targetDigest',
    'requestDigest',
    'lineage',
    'predecessor',
    'actor',
    'recordedAt',
  ]);
  if (record.schema !== 'aitm.reviewed-scope-record/v1') refuse('reviewed-scope-record');
  validateManifest(record.manifest);
  digest(record.targetDigest);
  digest(record.requestDigest);
  digest(record.lineage);
  if (requestDigest(record) !== record.requestDigest) refuse('reviewed-scope-request');
  if (record.predecessor !== null) {
    exact(record.predecessor, ['commentId', 'sha256']);
    id(record.predecessor.commentId);
    digest(record.predecessor.sha256);
  }
  exact(record.actor, ['id', 'login']);
  id(record.actor.id);
  text(record.actor.login, 256);
  timestamp(record.recordedAt);
  return record;
}
export function makeRecord(input) {
  return validateRecord({ schema: 'aitm.reviewed-scope-record/v1', ...input });
}
export function encodeRecord(record) {
  validateRecord(record);
  const json = canonicalRecordJson(record);
  if (Buffer.byteLength(json) > LIMITS.record) refuse('reviewed-scope-record-size');
  const digest = sha256(json),
    commentBody = `<!-- aitm-reviewed-scope-record:v1 sha256="${digest}" data="${Buffer.from(json).toString('base64url')}" -->`;
  if (Buffer.byteLength(commentBody) > LIMITS.comment) refuse('reviewed-scope-comment-size');
  return { json, sha256: digest, commentBody };
}
export function parseRecordComment(body) {
  if (typeof body !== 'string' || Buffer.byteLength(body) > LIMITS.comment)
    refuse('reviewed-scope-comment-invalid');
  const match =
    /^<!-- aitm-reviewed-scope-record:v1 sha256="([a-f0-9]{64})" data="([A-Za-z0-9_-]+)" -->$/.exec(
      body
    );
  if (!match) refuse('reviewed-scope-comment-invalid');
  let record;
  try {
    record = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(match[2], 'base64url'))
    );
  } catch {
    refuse('reviewed-scope-comment-invalid');
  }
  const encoded = encodeRecord(record);
  if (encoded.commentBody !== body) refuse('reviewed-scope-comment-invalid');
  return { record, sha256: encoded.sha256 };
}
const POINTER =
  /<!-- aitm-reviewed-scope-evidence comment="([1-9][0-9]{0,19})" sha256="([a-f0-9]{64})" lineage="([a-f0-9]{64})" -->/g;
export function serializePointer(pointer) {
  exact(pointer, ['commentId', 'sha256', 'lineage']);
  id(pointer.commentId);
  digest(pointer.sha256);
  digest(pointer.lineage);
  const result = `<!-- aitm-reviewed-scope-evidence comment="${pointer.commentId}" sha256="${pointer.sha256}" lineage="${pointer.lineage}" -->`;
  if (Buffer.byteLength(result) > LIMITS.pointer) refuse('reviewed-scope-pointer-size');
  return result;
}
export function parsePointer(line) {
  const matches = [...String(line).matchAll(POINTER)];
  const remaining = String(line).replace(POINTER, '');
  if (matches.length > 1 || /<!--\s*aitm-reviewed-scope-evidence/.test(remaining))
    refuse('reviewed-scope-pointer-invalid');
  if (!matches.length) return null;
  return { commentId: matches[0][1], sha256: matches[0][2], lineage: matches[0][3] };
}
export function stripReviewedPointer(line) {
  const pointer = parsePointer(line);
  if (!pointer) return String(line);
  const encoded = serializePointer(pointer);
  return String(line).includes(' ' + encoded)
    ? String(line).replace(' ' + encoded, '')
    : String(line).replace(encoded, '');
}
