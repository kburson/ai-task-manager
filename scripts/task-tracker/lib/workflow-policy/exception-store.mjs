// @story #1626 #1787 #1794 #1795
import { isDeepStrictEqual } from 'node:util';

import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { renderAitmRecord } from '../github-records/record-envelope.mjs';
import {
  createWorkflowExceptionEnvelope,
  resolveDeliveryExceptionChain,
  resolveWorkflowExceptionRecords,
  WORKFLOW_EXCEPTION_RECORD_TYPE,
  WORKFLOW_EXCEPTION_SCHEMA_V2,
} from './exception-record.mjs';
import { buildDeliveryScope } from './delivery-scope.mjs';
import { partitionWorkflowExceptions } from './exception-partitions.mjs';
import { createHash } from 'node:crypto';

function operationId(value) {
  return `sha256:${createHash('sha256').update(canonicalRecordJson(value)).digest('hex')}`;
}

function policyOf(payload) {
  return {
    exceptionId: payload.exceptionId,
    scopeIdentity: payload.scopeIdentity,
    requirementIds: payload.requirementIds,
    constraints: payload.constraints,
    reason: payload.reason,
    authorization: payload.approvalEvidence,
    expiresAt: payload.expiresAt,
    ...(payload.schema === WORKFLOW_EXCEPTION_SCHEMA_V2
      ? {
          schema: payload.schema,
          scopeKind: payload.scopeKind,
          deliveryScope: payload.deliveryScope,
          waiverScopeDigest: payload.waiverScopeDigest,
        }
      : {}),
  };
}

function desiredPolicy({ request, scopeIdentity, authority }) {
  return {
    exceptionId: request.exceptionId,
    scopeIdentity,
    requirementIds: request.requirementIds,
    constraints: request.constraints,
    reason: request.reason,
    authorization: authority,
    expiresAt: request.expiresAt,
    ...(request.scopeKind === 'delivery'
      ? {
          schema: WORKFLOW_EXCEPTION_SCHEMA_V2,
          scopeKind: 'delivery',
          deliveryScope: request.deliveryScope,
          waiverScopeDigest: request.waiverScopeDigest,
        }
      : {}),
  };
}

function recordResult(issue, status, envelope, extras = {}) {
  return Object.freeze({
    issue,
    status,
    recordId: envelope?.recordId ?? null,
    revision: envelope?.payload?.revision ?? null,
    ...extras,
  });
}

function workflowRecords(records) {
  return records.filter(
    (record) => record?.envelope?.recordType === WORKFLOW_EXCEPTION_RECORD_TYPE
  );
}

async function reconcileOperation({
  issue,
  expectedOperationId,
  partitionKey,
  repository,
  runtime,
}) {
  try {
    const refreshed = workflowRecords(await runtime.listRecords(issue));
    const grouped = partitionWorkflowExceptions({ records: refreshed, repository, issue });
    const selected =
      partitionKey === null ? grouped.ordinary : (grouped.delivery.get(partitionKey) ?? []);
    const allMatches = refreshed.filter(
      (record) => record.envelope.payload.operationId === expectedOperationId
    );
    const matches = selected.filter(
      (record) => record.envelope.payload.operationId === expectedOperationId
    );
    if (allMatches.length > matches.length)
      return { status: 'wrong-partition', records: refreshed };
    if (matches.length > 1) return { status: 'ambiguous', records: refreshed };
    return matches.length === 1
      ? { status: 'found', record: matches[0], records: refreshed }
      : { status: 'missing', records: refreshed };
  } catch {
    return { status: 'indeterminate', records: [] };
  }
}

export async function inspectWorkflowException({
  repository,
  issue,
  scopeIdentity,
  now,
  runtime,
  deliveryScope = null,
} = {}) {
  const records = await runtime.listRecords(issue);
  if (deliveryScope !== null) {
    const { partitionKey } = buildDeliveryScope(deliveryScope);
    return resolveDeliveryExceptionChain({
      records,
      partitionKey,
      repository,
      issue,
      scopeIdentity,
      now,
    });
  }
  return resolveWorkflowExceptionRecords({
    records,
    repository,
    issue,
    currentScopeIdentity: scopeIdentity,
    now,
  });
}

export async function executeWorkflowExceptionWrite({
  action,
  repository,
  issue,
  scopeIdentity,
  request,
  authority,
  now,
  runtime,
} = {}) {
  const records = workflowRecords(await runtime.listRecords(issue));
  let partitionKey = null;
  let grouped;
  try {
    grouped = partitionWorkflowExceptions({ records, repository, issue });
    if (request?.scopeKind === 'delivery') {
      const built = buildDeliveryScope(request.deliveryScope);
      if (built.waiverScopeDigest !== request.waiverScopeDigest) {
        return recordResult(issue, 'blocked', null, { code: 'delivery-scope-digest' });
      }
      partitionKey = built.partitionKey;
    } else if (request?.deliveryScope !== undefined || request?.waiverScopeDigest !== undefined) {
      return recordResult(issue, 'blocked', null, { code: 'delivery-selector-incomplete' });
    }
  } catch {
    return recordResult(issue, 'blocked', null, { code: 'invalid-workflow-exception-record' });
  }
  const selected =
    partitionKey === null ? grouped.ordinary : (grouped.delivery.get(partitionKey) ?? []);
  const resolved =
    partitionKey === null
      ? resolveWorkflowExceptionRecords({
          records,
          repository,
          issue,
          currentScopeIdentity: scopeIdentity,
          now,
        })
      : resolveDeliveryExceptionChain({
          records,
          partitionKey,
          repository,
          issue,
          scopeIdentity,
          now,
        });
  if (resolved.status === 'invalid') {
    return recordResult(issue, 'blocked', null, { code: resolved.conflicts[0].code });
  }
  const headRecord =
    resolved.head === null
      ? null
      : (selected.find((record) => record.envelope.recordId === resolved.head.recordId) ?? null);
  const head = headRecord?.envelope ?? null;
  if (partitionKey !== null) {
    if (action === 'record') {
      if (request.priorRecordId !== null || request.priorRevision !== null) {
        return recordResult(issue, 'blocked', head, { code: 'stale-prior-selector' });
      }
    } else if (
      head?.recordId !== request.priorRecordId ||
      head?.payload?.revision !== request.priorRevision
    ) {
      return recordResult(issue, 'blocked', head, { code: 'stale-prior-selector' });
    }
  }

  let policy;
  let status;
  if (action === 'record') {
    policy = desiredPolicy({ request, scopeIdentity, authority });
    if (head !== null) {
      if (head.payload.status === 'active' && isDeepStrictEqual(policyOf(head.payload), policy)) {
        return recordResult(issue, 'existing', head);
      }
      return recordResult(issue, 'blocked', head, { code: 'revision-required' });
    }
    status = 'active';
  } else if (action === 'revise') {
    if (head === null) return recordResult(issue, 'blocked', null, { code: 'record-not-found' });
    if (head.payload.status === 'revoked') {
      return recordResult(issue, 'blocked', head, { code: 'record-revoked' });
    }
    policy = desiredPolicy({ request, scopeIdentity, authority });
    if (isDeepStrictEqual(policyOf(head.payload), policy))
      return recordResult(issue, 'existing', head);
    if (
      partitionKey !== null &&
      head.payload.waiverScopeDigest !== policy.waiverScopeDigest &&
      authority?.reference === head.payload.approvalEvidence.reference
    ) {
      return recordResult(issue, 'blocked', head, { code: 'fresh-approval-required' });
    }
    status = 'active';
  } else if (action === 'revoke') {
    if (head === null) return recordResult(issue, 'blocked', null, { code: 'record-not-found' });
    if (head.payload.status === 'revoked') return recordResult(issue, 'revoked', head);
    policy = {
      ...policyOf(head.payload),
      scopeIdentity,
      reason: request.reason,
      authorization: authority,
      ...(partitionKey !== null ? { expiresAt: request.expiresAt } : {}),
    };
    status = 'revoked';
  } else {
    throw new TypeError('workflow-exception-store:action');
  }

  const revision = head === null ? 1 : head.payload.revision + 1;
  const opId = operationId({ action, repository, issue, revision, status, ...policy });
  const existingOperation = records.filter(
    (record) => record.envelope.payload.operationId === opId
  );
  if (existingOperation.some((record) => !selected.includes(record))) {
    return recordResult(issue, 'blocked', null, { code: 'operation-digest-collision' });
  }
  if (existingOperation.length > 1) {
    return recordResult(issue, 'blocked', null, { code: 'ambiguous-operation' });
  }
  if (existingOperation.length === 1) {
    return recordResult(
      issue,
      status === 'revoked' ? 'revoked' : 'existing',
      existingOperation[0].envelope
    );
  }
  const ids = runtime.nextIds();
  const envelope = createWorkflowExceptionEnvelope({
    repository,
    issue,
    ...policy,
    revision,
    status,
    operationId: opId,
    predecessor: head?.recordId ?? null,
    supersedes: head?.recordId ?? null,
    createdAt: now,
    ...ids,
  });
  const body = renderAitmRecord({
    envelope,
    visibleMarkdown:
      `AITM workflow exception ${status === 'revoked' ? 'revoked' : 'recorded'}: ` +
      `${policy.exceptionId} revision ${revision}.\n`,
  });
  let recoveredAfterTransport = false;
  try {
    await runtime.appendRecord({ issue, body, envelope });
  } catch {
    const reconciled = await reconcileOperation({
      issue,
      expectedOperationId: opId,
      partitionKey,
      repository,
      runtime,
    });
    if (reconciled.status !== 'found') {
      return recordResult(issue, 'indeterminate', null, {
        code: reconciled.status === 'ambiguous' ? 'ambiguous-operation' : 'transport-ambiguity',
      });
    }
    recoveredAfterTransport = true;
  }
  const verified = await reconcileOperation({
    issue,
    expectedOperationId: opId,
    partitionKey,
    repository,
    runtime,
  });
  if (verified.status !== 'found') {
    return recordResult(issue, 'indeterminate', null, { code: 'readback-mismatch' });
  }
  const postWriteResolution =
    partitionKey === null
      ? resolveWorkflowExceptionRecords({
          records: verified.records,
          repository,
          issue,
          currentScopeIdentity: scopeIdentity,
          now,
        })
      : resolveDeliveryExceptionChain({
          records: verified.records,
          partitionKey,
          repository,
          issue,
          scopeIdentity,
          now,
        });
  if (postWriteResolution.status === 'invalid') {
    return recordResult(issue, 'blocked', envelope, {
      code: postWriteResolution.conflicts[0].code,
    });
  }
  return recordResult(issue, status === 'revoked' ? 'revoked' : 'created', envelope, {
    recoveredAfterTransport,
  });
}
