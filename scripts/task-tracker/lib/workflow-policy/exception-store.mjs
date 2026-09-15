// @story #1626
import { isDeepStrictEqual } from 'node:util';

import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { renderAitmRecord } from '../github-records/record-envelope.mjs';
import {
  createWorkflowExceptionEnvelope,
  resolveWorkflowExceptionRecords,
  WORKFLOW_EXCEPTION_RECORD_TYPE,
} from './exception-record.mjs';
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

async function reconcileOperation({ issue, expectedOperationId, runtime }) {
  const refreshed = workflowRecords(await runtime.listRecords(issue));
  const matches = refreshed.filter(
    (record) => record.envelope.payload.operationId === expectedOperationId
  );
  if (matches.length > 1) return { status: 'ambiguous', records: refreshed };
  return matches.length === 1
    ? { status: 'found', record: matches[0], records: refreshed }
    : { status: 'missing', records: refreshed };
}

export async function inspectWorkflowException({
  repository,
  issue,
  scopeIdentity,
  now,
  runtime,
} = {}) {
  const records = await runtime.listRecords(issue);
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
  const resolved = resolveWorkflowExceptionRecords({
    records,
    repository,
    issue,
    currentScopeIdentity: scopeIdentity,
    now,
  });
  if (resolved.status === 'invalid') {
    return recordResult(issue, 'blocked', null, { code: resolved.conflicts[0].code });
  }
  const headRecord =
    resolved.head === null
      ? null
      : (records.find((record) => record.envelope.recordId === resolved.head.recordId) ?? null);
  const head = headRecord?.envelope ?? null;

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
    status = 'active';
  } else if (action === 'revoke') {
    if (head === null) return recordResult(issue, 'blocked', null, { code: 'record-not-found' });
    if (head.payload.status === 'revoked') return recordResult(issue, 'revoked', head);
    policy = {
      ...policyOf(head.payload),
      scopeIdentity,
      reason: request.reason,
      authorization: authority,
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
    const reconciled = await reconcileOperation({ issue, expectedOperationId: opId, runtime });
    if (reconciled.status !== 'found') {
      return recordResult(issue, 'indeterminate', null, {
        code: reconciled.status === 'ambiguous' ? 'ambiguous-operation' : 'transport-ambiguity',
      });
    }
    recoveredAfterTransport = true;
  }
  const verified = await reconcileOperation({ issue, expectedOperationId: opId, runtime });
  if (verified.status !== 'found') {
    return recordResult(issue, 'indeterminate', null, { code: 'readback-mismatch' });
  }
  const postWriteResolution = resolveWorkflowExceptionRecords({
    records: verified.records,
    repository,
    issue,
    currentScopeIdentity: scopeIdentity,
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
