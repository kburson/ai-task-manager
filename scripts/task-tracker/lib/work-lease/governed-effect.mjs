import os from 'node:os';

import { WorkLeaseError } from '@kburson/aitm-ledger';

import { currentBranch } from '../../fleet-registry.mjs';
import { aiAppName, currentSessionId } from '../../word-counter.mjs';
import { createWorkLeaseHeartbeat, verifyGovernedEffect } from './guard.mjs';
import { normalizeLeaseContext } from './context.mjs';
import { createWorkLeaseProvider } from './provider.mjs';

export const GOVERNED_EFFECT_OPERATIONS = Object.freeze([
  'source-write',
  'issue-attributed-commit',
  'lifecycle-mutation',
  'issue-body-mutation',
  'evidence-mutation',
  'approval-mutation',
  'review-mutation',
  'close',
  'branch-worktree-orchestration',
]);

const OPERATION_SET = new Set(GOVERNED_EFFECT_OPERATIONS);
const HOLDER_IDENTITY_FIELDS = Object.freeze([
  'principalKind',
  'provider',
  'agentRunId',
  'sessionId',
  'hostId',
  'worktreeId',
  'pathHash',
  'branch',
]);

function invalid(message) {
  return new WorkLeaseError('invalid-request', message);
}

export function assertGovernedEffectOperation(operation) {
  if (typeof operation !== 'string' || !OPERATION_SET.has(operation)) {
    throw invalid(`unknown governed effect operation: ${String(operation ?? '')}`);
  }
  return operation;
}

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw invalid(`${label} is required`);
  }
  return value;
}

function trustedHolderIdentity(identity) {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
    throw invalid('trusted runtime identity is required');
  }
  requiredString(identity.sessionId, 'trusted runtime sessionId');
  requiredString(identity.hostId, 'trusted runtime hostId');
  return Object.freeze(
    Object.fromEntries(
      HOLDER_IDENTITY_FIELDS.filter((field) => identity[field] !== undefined).map((field) => [
        field,
        identity[field],
      ])
    )
  );
}

function verifiedLeaseContext(result) {
  const lease = result?.lease;
  if (result?.allowed !== true || !lease || typeof lease !== 'object') {
    throw invalid('governed effect verification result is malformed');
  }
  return normalizeLeaseContext({
    projectId: lease.projectId,
    leaseId: lease.leaseId,
    fencingToken: lease.fencingToken,
    worktreeId: lease.holder?.worktreeId,
  });
}

function commandOwnerKey(sessionId, issueId, operation) {
  return `governed:${process.pid}:${sessionId}:${String(issueId).replace(/^#/, '')}:${operation}`;
}

// One operation-aware boundary for governed callbacks. Unknown operations are
// rejected before runtime identity resolution or lazy authority initialization.
// Every reverify reloads the persisted session through verifyGovernedEffect;
// no lease proof is cached across callback phases.
export function createGovernedEffectAdapter({
  projectDir,
  getStore,
  getIdentity,
  verifyEffect = verifyGovernedEffect,
  createHeartbeat = createWorkLeaseHeartbeat,
} = {}) {
  requiredString(projectDir, 'governed effect projectDir');
  if (
    typeof getStore !== 'function' ||
    typeof getIdentity !== 'function' ||
    typeof verifyEffect !== 'function' ||
    typeof createHeartbeat !== 'function'
  ) {
    throw invalid('governed effect runtime dependencies are required');
  }

  return async function withGovernedEffect(options, callback) {
    const { issueId, operation, heartbeat = false } = options || {};
    assertGovernedEffectOperation(operation);
    if (typeof callback !== 'function') {
      throw invalid('governed effect callback is required');
    }

    const identity = getIdentity();
    const holderIdentity = trustedHolderIdentity(identity);
    const heartbeatOwnerKey = commandOwnerKey(identity.sessionId, issueId, operation);
    const verifyOptions = {
      issueId,
      sessionId: identity.sessionId,
      projectDir,
      hostId: identity.hostId,
      operation,
      store: getStore(),
      holderIdentity,
      heartbeatOwnerKey,
    };
    let verified = await verifyEffect(verifyOptions);
    let leaseContext = verifiedLeaseContext(verified);

    const reverify = async () => {
      verified = await verifyEffect(verifyOptions);
      leaseContext = verifiedLeaseContext(verified);
      return Object.freeze({ allowed: true, lease: verified.lease, leaseContext });
    };

    let heartbeatController;
    if (heartbeat) {
      heartbeatController = createHeartbeat({
        ...verifyOptions,
        ownerKey: heartbeatOwnerKey,
        verifyEffect,
      });
    }
    try {
      return await callback(
        Object.freeze({
          allowed: true,
          lease: verified.lease,
          leaseContext,
          reverify,
        })
      );
    } finally {
      heartbeatController?.stop?.();
    }
  };
}

function lazy(factory) {
  let initialized = false;
  let value;
  return () => {
    if (!initialized) {
      value = factory();
      initialized = true;
    }
    return value;
  };
}

export function createRuntimeGovernedEffectAdapter({
  projectDir,
  config,
  getStore = lazy(() => createWorkLeaseProvider({ config, projectDir })),
  getIdentity = () => {
    const sessionId = currentSessionId();
    return Object.freeze({
      principalKind: 'worker',
      provider: aiAppName(),
      agentRunId: sessionId,
      sessionId,
      hostId: os.hostname(),
      branch: currentBranch(projectDir),
    });
  },
  ...deps
} = {}) {
  return createGovernedEffectAdapter({
    projectDir,
    getStore,
    getIdentity,
    ...deps,
  });
}
