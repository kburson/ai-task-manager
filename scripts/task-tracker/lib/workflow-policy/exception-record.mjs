// @story #1626 #1787 #1793 #1794
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { createAitmRecordEnvelope, hashRecordPayload } from '../github-records/record-envelope.mjs';
import {
  validateConstraints,
  validateDeliveryExceptionIds,
  validateWaiverIds,
} from './catalog.mjs';
import { meaningfulDeliveryReason } from './delivery-request.mjs';
import { buildDeliveryScope } from './delivery-scope.mjs';
import { partitionWorkflowExceptions } from './exception-partitions.mjs';

export const WORKFLOW_EXCEPTION_SCHEMA = 'aitm.workflow-exception/v1';
export const WORKFLOW_EXCEPTION_SCHEMA_V2 = 'aitm.workflow-exception/v2';
export const WORKFLOW_EXCEPTION_RECORD_TYPE = 'workflow-exception';

const ENVELOPE_KEYS = [
  'authority',
  'createdAt',
  'issue',
  'payload',
  'payloadHash',
  'predecessor',
  'recordId',
  'recordType',
  'repository',
  'schema',
  'supersedes',
];
const PAYLOAD_KEYS = [
  'approvalEvidence',
  'constraints',
  'exceptionId',
  'expiresAt',
  'operationId',
  'reason',
  'requirementIds',
  'revision',
  'schema',
  'scopeIdentity',
  'status',
];
const DELIVERY_PAYLOAD_KEYS = [...PAYLOAD_KEYS, 'scopeKind', 'deliveryScope', 'waiverScopeDigest'];
const AUTHORIZATION_KEYS = [
  'origin',
  'principal',
  'recordingActor',
  'reference',
  'statement',
  'verificationLevel',
];
const AUTHORITY_KEYS = ['actor', 'epoch', 'grantId'];
const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const HASH_RE = /^sha256:[0-9a-f]{64}$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const EXCEPTION_ID_RE = /^[a-z0-9][a-z0-9._:-]{0,127}$/;

function fail(category) {
  throw new TypeError(`workflow-exception:${category}`);
}

function exact(value, keys, category) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(category);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(category);
  }
}

function opaque(value) {
  return (
    typeof value === 'string' &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= 4096 &&
    ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  );
}

function canonicalInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const millis = Date.parse(value);
  return Number.isFinite(millis) && new Date(millis).toISOString() === value;
}

function validateAuthorization(value) {
  exact(value, AUTHORIZATION_KEYS, 'authorization-keys');
  if (
    value.origin !== 'codex-session-transcript' ||
    value.verificationLevel !== 'host-verified-user-message'
  ) {
    fail('unsupported-authority');
  }
  if (
    typeof value.reference !== 'string' ||
    !/^codex:\/\/sessions\/[^/\s]+\/messages\/[^/\s]+$/.test(value.reference)
  ) {
    fail('authorization-reference');
  }
  if (!opaque(value.statement)) fail('authorization-statement');
  if (value.principal !== null && !opaque(value.principal)) fail('authorization-principal');
  if (!opaque(value.recordingActor)) fail('recording-actor');
}

function validateLinks(envelope, payload) {
  if (payload.revision === 1) {
    if (
      payload.status !== 'active' ||
      envelope.predecessor !== null ||
      envelope.supersedes !== null
    ) {
      fail('initial-links');
    }
    return;
  }
  if (
    !ULID_RE.test(envelope.predecessor ?? '') ||
    envelope.predecessor !== envelope.supersedes ||
    envelope.predecessor === envelope.recordId
  ) {
    fail('revision-links');
  }
}

export function validateWorkflowExceptionEnvelope(
  envelope,
  { repository = envelope?.repository, issue = envelope?.issue } = {}
) {
  try {
    canonicalRecordJson(envelope);
  } catch {
    fail('canonical');
  }
  exact(envelope, ENVELOPE_KEYS, 'envelope-keys');
  if (envelope.schema !== 'aitm.record/v1') fail('envelope-schema');
  if (envelope.recordType !== WORKFLOW_EXCEPTION_RECORD_TYPE) fail('record-type');
  if (!ULID_RE.test(envelope.recordId ?? '')) fail('record-id');
  if (!REPOSITORY_RE.test(envelope.repository ?? '')) fail('repository');
  if (envelope.repository !== repository) fail('repository-mismatch');
  if (!Number.isSafeInteger(envelope.issue) || envelope.issue <= 0) fail('issue');
  if (envelope.issue !== issue) fail('issue-mismatch');
  if (!canonicalInstant(envelope.createdAt)) fail('created-at');
  exact(envelope.authority, AUTHORITY_KEYS, 'envelope-authority');
  if (
    !ULID_RE.test(envelope.authority.grantId ?? '') ||
    !Number.isSafeInteger(envelope.authority.epoch) ||
    envelope.authority.epoch <= 0 ||
    !opaque(envelope.authority.actor)
  ) {
    fail('envelope-authority');
  }

  const payload = envelope.payload;
  if (payload?.schema === WORKFLOW_EXCEPTION_SCHEMA) {
    exact(payload, PAYLOAD_KEYS, 'payload-keys');
  } else if (payload?.schema === WORKFLOW_EXCEPTION_SCHEMA_V2) {
    if (payload.scopeKind !== 'delivery') fail('scope-kind');
    exact(payload, DELIVERY_PAYLOAD_KEYS, 'payload-keys');
  } else {
    fail('unsupported-schema');
  }
  if (!EXCEPTION_ID_RE.test(payload.exceptionId ?? '')) fail('exception-id');
  if (!Number.isSafeInteger(payload.revision) || payload.revision <= 0) fail('revision');
  if (!['active', 'revoked'].includes(payload.status)) fail('status');
  if (!HASH_RE.test(payload.scopeIdentity ?? '')) fail('scope-identity');
  if (!HASH_RE.test(payload.operationId ?? '')) fail('operation-id');
  if (!opaque(payload.reason)) fail('reason');
  if (
    payload.schema === WORKFLOW_EXCEPTION_SCHEMA_V2 &&
    !meaningfulDeliveryReason(payload.reason)
  ) {
    fail('reason');
  }
  validateAuthorization(payload.approvalEvidence);
  if (envelope.authority.actor !== payload.approvalEvidence.recordingActor) {
    fail('recording-actor-mismatch');
  }
  let requirementIds;
  let constraints;
  try {
    if (payload.schema === WORKFLOW_EXCEPTION_SCHEMA_V2) {
      const { scope, waiverScopeDigest } = buildDeliveryScope(payload.deliveryScope);
      if (scope.repository !== envelope.repository || scope.issue !== envelope.issue) {
        fail('delivery-scope-identity');
      }
      if (payload.waiverScopeDigest !== waiverScopeDigest) fail('scope-digest');
      requirementIds = validateDeliveryExceptionIds(payload.requirementIds, scope);
      if (!Array.isArray(payload.constraints) || payload.constraints.length !== 0) {
        fail('delivery-constraints');
      }
      constraints = [];
    } else {
      requirementIds = validateWaiverIds(payload.requirementIds);
      constraints = validateConstraints(payload.constraints);
    }
  } catch (error) {
    if (error?.message?.startsWith('workflow-exception:')) throw error;
    fail(error.message.replace(/^workflow-policy:/, 'policy-'));
  }
  if (requirementIds.length === 0 && constraints.length === 0) fail('empty-policy');
  if (new Set(constraints.map(({ id }) => id)).size !== constraints.length) {
    fail('duplicate-constraint');
  }
  if (payload.schema === WORKFLOW_EXCEPTION_SCHEMA_V2 && payload.expiresAt === null) {
    fail('expires-at');
  }
  if (payload.expiresAt !== null) {
    if (
      !canonicalInstant(payload.expiresAt) ||
      Date.parse(payload.expiresAt) <= Date.parse(envelope.createdAt)
    ) {
      fail('expires-at');
    }
  }
  validateLinks(envelope, payload);
  if (envelope.payloadHash !== hashRecordPayload(payload)) fail('payload-hash');
  return envelope;
}

export function createWorkflowExceptionEnvelope({
  schema = WORKFLOW_EXCEPTION_SCHEMA,
  repository,
  issue,
  exceptionId,
  revision,
  status = 'active',
  scopeIdentity,
  requirementIds,
  constraints,
  reason,
  authorization,
  expiresAt = null,
  operationId,
  predecessor = null,
  supersedes = null,
  createdAt,
  recordId,
  grantId,
  scopeKind,
  deliveryScope,
  waiverScopeDigest,
} = {}) {
  const payload = {
    schema,
    exceptionId,
    revision,
    status,
    scopeIdentity,
    requirementIds,
    constraints,
    reason,
    approvalEvidence: authorization,
    expiresAt,
    operationId,
    ...(schema === WORKFLOW_EXCEPTION_SCHEMA_V2
      ? { scopeKind, deliveryScope, waiverScopeDigest }
      : {}),
  };
  let envelope;
  try {
    envelope = createAitmRecordEnvelope({
      recordType: WORKFLOW_EXCEPTION_RECORD_TYPE,
      repository,
      issue,
      payload,
      actor: authorization?.recordingActor,
      predecessor,
      supersedes,
      createdAt,
      recordId,
      grantId,
    });
  } catch (error) {
    fail(error?.message?.replace(/^record-envelope:/, '') || 'envelope');
  }
  validateWorkflowExceptionEnvelope(envelope, { repository, issue });
  return envelope;
}

export function toEvaluatorRecord(envelope) {
  validateWorkflowExceptionEnvelope(envelope);
  const payload = envelope.payload;
  return Object.freeze({
    recordId: envelope.recordId,
    revision: payload.revision,
    disposition: payload.status,
    repository: envelope.repository,
    issue: envelope.issue,
    scopeIdentity: payload.scopeIdentity,
    requirementIds: Object.freeze([...payload.requirementIds]),
    constraints: Object.freeze(payload.constraints.map((item) => Object.freeze({ ...item }))),
    authority: Object.freeze({
      reference: payload.approvalEvidence.reference,
      verificationLevel: payload.approvalEvidence.verificationLevel,
    }),
    createdAt: envelope.createdAt,
    expiresAt: payload.expiresAt,
    ...(payload.schema === WORKFLOW_EXCEPTION_SCHEMA_V2
      ? {
          scopeKind: payload.scopeKind,
          deliveryScope: Object.freeze({ ...payload.deliveryScope }),
          waiverScopeDigest: payload.waiverScopeDigest,
        }
      : {}),
  });
}

function invalid(code = 'invalid-workflow-exception-record') {
  return Object.freeze({
    status: 'invalid',
    active: null,
    head: null,
    history: Object.freeze([]),
    conflicts: Object.freeze([{ code }]),
  });
}

function resolveChain({
  records = [],
  repository,
  issue,
  currentScopeIdentity,
  now = new Date().toISOString(),
} = {}) {
  if (
    !Array.isArray(records) ||
    !canonicalInstant(now) ||
    !HASH_RE.test(currentScopeIdentity ?? '')
  ) {
    fail('resolver-input');
  }
  const workflowRecords = records.filter(
    (record) => record?.envelope?.recordType === WORKFLOW_EXCEPTION_RECORD_TYPE
  );
  if (workflowRecords.length === 0) {
    return Object.freeze({
      status: 'none',
      active: null,
      head: null,
      history: Object.freeze([]),
      conflicts: Object.freeze([]),
    });
  }
  try {
    for (const record of workflowRecords) {
      validateWorkflowExceptionEnvelope(record.envelope, { repository, issue });
    }
  } catch {
    return invalid();
  }
  const exceptionIds = new Set(
    workflowRecords.map((record) => record.envelope.payload.exceptionId)
  );
  if (exceptionIds.size !== 1) return invalid('ambiguous-active-records');
  const ids = new Set(workflowRecords.map((record) => record.envelope.recordId));
  if (ids.size !== workflowRecords.length) return invalid('duplicate-record-id');

  const ordered = [...workflowRecords].sort(
    (left, right) =>
      left.envelope.payload.revision - right.envelope.payload.revision ||
      left.envelope.createdAt.localeCompare(right.envelope.createdAt)
  );
  if (ordered[0].envelope.payload.revision !== 1) return invalid('broken-revision-chain');
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1].envelope;
    const current = ordered[index].envelope;
    if (
      current.payload.revision !== previous.payload.revision + 1 ||
      current.predecessor !== previous.recordId ||
      current.supersedes !== previous.recordId
    ) {
      return invalid(
        current.payload.revision === previous.payload.revision
          ? 'ambiguous-active-records'
          : 'broken-revision-chain'
      );
    }
  }
  const headEnvelope = ordered.at(-1).envelope;
  const history = Object.freeze(
    ordered.map(({ envelope }, index) =>
      Object.freeze({
        recordId: envelope.recordId,
        revision: envelope.payload.revision,
        disposition: index === ordered.length - 1 ? envelope.payload.status : 'superseded',
      })
    )
  );
  const head = toEvaluatorRecord(headEnvelope);
  const base = { head, history, conflicts: Object.freeze([]) };
  if (headEnvelope.payload.status === 'revoked') {
    return Object.freeze({ status: 'revoked', active: null, ...base });
  }
  if (headEnvelope.payload.expiresAt !== null && now >= headEnvelope.payload.expiresAt) {
    return Object.freeze({ status: 'expired', active: null, ...base });
  }
  if (headEnvelope.payload.scopeIdentity !== currentScopeIdentity) {
    return Object.freeze({ status: 'stale-scope', active: null, ...base });
  }
  return Object.freeze({ status: 'active', active: head, ...base });
}

export function resolveWorkflowExceptionRecords(input = {}) {
  if (!Array.isArray(input.records ?? [])) fail('resolver-input');
  try {
    const grouped = partitionWorkflowExceptions({
      records: input.records ?? [],
      repository: input.repository,
      issue: input.issue,
    });
    return resolveChain({ ...input, records: grouped.ordinary });
  } catch {
    return invalid();
  }
}

export function resolveDeliveryExceptionChain({
  records = [],
  partitionKey,
  repository,
  issue,
  scopeIdentity,
  now = new Date().toISOString(),
} = {}) {
  if (typeof partitionKey !== 'string' || partitionKey.length === 0) fail('partition-key');
  try {
    const grouped = partitionWorkflowExceptions({ records, repository, issue });
    return resolveChain({
      records: grouped.delivery.get(partitionKey) ?? [],
      repository,
      issue,
      currentScopeIdentity: scopeIdentity,
      now,
    });
  } catch {
    return invalid();
  }
}
