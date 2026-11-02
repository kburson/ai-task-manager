// @story #2049
// Pure shared native payload decoding. No runtime bootstrap, grant, I/O or publication port.
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  parsePlanApprovedMarker,
  readCandidatePlanApprovalMarker,
  readCandidateForecastReady,
} from '../plan-approval-markers.mjs';
import { computeScopeIdentity } from '../workflow-policy/scope-identity.mjs';
import { canonicalRecordJson as json } from '../github-records/canonical-json.mjs';
const hash = (v) => createHash('sha256').update(v).digest('hex');
const same = (a, b) => json(a) === json(b);
const token = (value) =>
  typeof value === 'string' && value.length > 0 && !/[\s\p{Cc}]/u.test(value);
export const NATIVE_APPROVAL_CANDIDATE_SCHEMA = 'aitm.story-issue-update/v2';
function refuse(reason) {
  throw new Error('plan-candidate:' + reason);
}
function fail(reason) {
  throw Object.assign(new Error('Story batch invalid: ' + reason), {
    code: 'STORY_BATCH_INVALID',
    reason,
  });
}
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('shape');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    !same(Reflect.ownKeys(descriptors).sort(), [...keys].sort()) ||
    Object.values(descriptors).some(
      (entry) => !Object.hasOwn(entry, 'value') || entry.enumerable !== true
    )
  )
    fail('shape');
}
function payload(record, entry) {
  const bytes = record.payloads.get(entry?.payloadPath);
  if (bytes === undefined || hash(bytes) !== entry.digest) refuse('approval-payload');
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(bytes));
}
export function readNativeApprovalEnvelope(record) {
  if (!record) return null;
  const key = `issue:${record.generation.identity.issueNodeId}`;
  const entry = record.generation.working[key];
  if (!entry) return null;
  let value;
  try {
    value = JSON.parse(payload(record, entry));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    if (entry.capabilityRef?.startsWith('plan-approved:')) refuse('approval-envelope');
    return null;
  }
  if (value?.schema !== NATIVE_APPROVAL_CANDIDATE_SCHEMA) {
    if (entry.capabilityRef?.startsWith('plan-approved:')) refuse('approval-envelope');
    return null;
  }
  if (
    Object.keys(value).sort().join(',') !== 'body,nativeApproval,schema,title' ||
    json(value) !== payload(record, entry)
  )
    refuse('approval-envelope');
  if (entry.capabilityRef !== 'plan-approved:' + hash(json(value.nativeApproval)))
    refuse('approval-reference');
  return value;
}
export function readRetainedNativePlanApproval(record) {
  const value = readNativeApprovalEnvelope(record);
  if (value === null) return null;
  if (
    typeof value.body !== 'string' ||
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    /[\p{Cc}\p{Zl}\p{Zp}]/u.test(value.title) ||
    !value.nativeApproval?.identity ||
    json(value.nativeApproval.identity) !== json(record.generation.identity)
  )
    refuse('approval-envelope');
  const approval = value.nativeApproval;
  const keys = [
    'schema',
    'identity',
    'claimId',
    'sessionId',
    'worktree',
    'beforeBody',
    'decomposition',
    'publishedBody',
    'approved',
    'scopeIdentity',
    'planObservation',
    'currentForecastSelection',
    'cfg',
  ];
  if (
    Object.keys(approval).sort().join(',') !== keys.sort().join(',') ||
    approval.schema !== 'aitm.native-plan-approval/v1' ||
    approval.claimId !== record.manifest.claimId ||
    !token(approval.sessionId) ||
    typeof approval.worktree !== 'string' ||
    !path.isAbsolute(approval.worktree) ||
    path.resolve(approval.worktree) !== approval.worktree ||
    typeof approval.beforeBody !== 'string' ||
    typeof approval.publishedBody !== 'string' ||
    !approval.cfg ||
    typeof approval.cfg.repo !== 'string' ||
    approval.cfg.repo.toLowerCase() !== record.generation.identity.repository ||
    approval.cfg.projectId !== record.generation.identity.projectId ||
    [approval.decomposition, approval.planObservation, approval.currentForecastSelection].some(
      (v) => v !== null && (typeof v !== 'object' || Array.isArray(v))
    ) ||
    !approval.approved ||
    typeof approval.approved !== 'object' ||
    Array.isArray(approval.approved)
  )
    refuse('approval-envelope');
  const approvedKeys = [
    'ts',
    'forecastRecordId',
    'mode',
    'repairRecordId',
    'trunkSha',
    'storyDigest',
    'storyIntentDigest',
    'storyIntentSource',
  ];
  const approved = approval.approved;
  if (
    Object.keys(approved).sort().join(',') !== approvedKeys.sort().join(',') ||
    !['human', 'full-auto'].includes(approved.mode) ||
    typeof approved.ts !== 'string' ||
    !Number.isFinite(Date.parse(approved.ts)) ||
    !/^[a-f0-9]{40}$/i.test(approved.trunkSha ?? '') ||
    !/^[a-f0-9]{64}$/.test(approved.storyDigest ?? '') ||
    !/^[a-f0-9]{64}$/.test(approved.storyIntentDigest ?? '') ||
    !['deep-dive', 'linked-plan', 'linked-plan-task'].includes(approved.storyIntentSource) ||
    [approved.forecastRecordId, approved.repairRecordId].some(
      (id) => id !== null && !/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(id)
    ) ||
    approval.scopeIdentity !==
      computeScopeIdentity({
        repository: record.generation.identity.repository,
        issue: record.generation.identity.issueNumber,
        body: value.body,
      })
  )
    refuse('approval-envelope');
  readCandidatePlanApprovalMarker(value.body);
  if (
    !same(parsePlanApprovedMarker(value.body), approved) ||
    readCandidateForecastReady(value.body) !== approved.forecastRecordId
  )
    refuse('approval-drift');
  return JSON.parse(json(value));
}
export function validateStoryFieldCandidate(row) {
  exact(row, ['itemId', 'fieldId', 'type', 'value']);
  if (
    !token(row.itemId) ||
    !token(row.fieldId) ||
    !['NUMBER', 'TEXT', 'DATE', 'SINGLE_SELECT', 'ITERATION'].includes(row.type)
  )
    fail('field-value');
  const value = row.value;
  if (value === null || same(value, { state: 'absent' })) return;
  if (row.type === 'NUMBER') {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail('field-value');
    return;
  }
  if (row.type === 'SINGLE_SELECT') {
    exact(value, ['optionId', 'name']);
    if (!token(value.optionId) || typeof value.name !== 'string') fail('field-value');
    return;
  }
  if (typeof value !== 'string' || !value.isWellFormed()) fail('field-value');
  if (row.type === 'ITERATION' && !token(value)) fail('field-value');
  if (
    row.type === 'DATE' &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value)
  )
    fail('field-value');
}
