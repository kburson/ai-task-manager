// @story #1728
import { createHash } from 'node:crypto';

import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { computeScopeIdentity } from '../workflow-policy/scope-identity.mjs';
import { AUTHORITY_RESOURCE_IDS } from './contract.mjs';

function digest(value) {
  return `sha256:${createHash('sha256').update(canonicalRecordJson(value)).digest('hex')}`;
}

function frozenCopy(value) {
  const copy = JSON.parse(canonicalRecordJson(value));
  function freeze(item) {
    if (item && typeof item === 'object') {
      for (const member of Object.values(item)) freeze(member);
      Object.freeze(item);
    }
    return item;
  }
  return freeze(copy);
}

function nonempty(value, name) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new TypeError(`action-observation:${name}`);
  }
}

function instant(now) {
  const value = now();
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new TypeError('action-observation:clock');
  }
  return value;
}

function reasonFor(error) {
  if (error?.code === 'ETIMEDOUT' || error?.name === 'TimeoutError') return 'timeout';
  if (error?.status === 429 || error?.code === 'RATE_LIMITED') return 'rate-limited';
  return 'unavailable';
}

function failure({
  repository,
  issue,
  boundaryId,
  resource,
  identity,
  scope,
  observedAt,
  reason,
  detail,
}) {
  const base = {
    status: 'indeterminate',
    repository,
    issue,
    boundaryId,
    resource,
    identity,
    scope,
    observedAt,
    cause: {
      code: 'authority-read-failed',
      guardId: 'authority-collection',
      args: { source: resource, reason, subject: { issue } },
      noAutomaticRemediation: { reason: 'authority-investigation-required' },
    },
    provenance: { detail },
  };
  return frozenCopy({ ...base, digest: digest(base) });
}

function compatible(result, request, repository, issue) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return 'missing-source';
  if (
    result.repository !== repository ||
    result.issue !== issue ||
    result.resource !== request.resource ||
    result.identity !== request.identity ||
    result.scope !== request.scope
  )
    return 'incompatible-identity';
  if (!Object.hasOwn(result, 'value') || result.value === undefined || result.value === null) {
    return 'missing-value';
  }
  if (request.resource === 'issue-body') {
    if (result.value?.number !== issue || typeof result.value.body !== 'string') {
      return 'incompatible-body';
    }
    try {
      if (computeScopeIdentity({ repository, issue, body: result.value.body }) !== request.scope) {
        return 'incompatible-body';
      }
    } catch {
      return 'incompatible-body';
    }
  }
  try {
    canonicalRecordJson(result.value);
    if (result.revision !== undefined) nonempty(result.revision, 'revision');
  } catch {
    return 'invalid-value';
  }
  return null;
}

/**
 * Collect read-only authority inside one command-boundary attempt. The caller
 * supplies a read-only `read(request)` port; no capability to mutate is passed
 * to the collector. A new command, retry, effect, or identity change requires
 * a new attempt. This module never computes action readiness.
 */
export function createObservationAttempt({ repository, issue, boundaryId, now, read } = {}) {
  nonempty(repository, 'repository');
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) throw new TypeError('action-observation:repository');
  if (!Number.isSafeInteger(issue) || issue <= 0) throw new TypeError('action-observation:issue');
  nonempty(boundaryId, 'boundary');
  if (typeof now !== 'function' || typeof read !== 'function') {
    throw new TypeError('action-observation:ports');
  }
  const startedAt = instant(now);
  const memo = new Map();
  let invalidated = false;
  let finished = false;

  async function observe({ resource, identity, scope, refresh = false } = {}) {
    if (invalidated || finished) throw new TypeError('action-observation:closed');
    if (!AUTHORITY_RESOURCE_IDS.includes(resource))
      throw new TypeError('action-observation:resource');
    nonempty(identity, 'identity');
    nonempty(scope, 'scope');
    if (typeof refresh !== 'boolean') throw new TypeError('action-observation:refresh');
    const request = frozenCopy({ repository, issue, boundaryId, resource, identity, scope });
    const key = canonicalRecordJson(request);
    if (!refresh && memo.has(key)) return memo.get(key);
    const pending = (async () => {
      let result;
      try {
        result = await read(request);
      } catch (error) {
        return failure({
          ...request,
          observedAt: instant(now),
          reason: reasonFor(error),
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      const observedAt = instant(now);
      let snapshot = result;
      if (result !== undefined && result !== null) {
        try {
          snapshot = frozenCopy(result);
        } catch {
          return failure({
            ...request,
            observedAt,
            reason: 'invalid',
            detail: 'invalid-response',
          });
        }
      }
      const incompatibility = compatible(snapshot, request, repository, issue);
      if (incompatibility) {
        return failure({
          ...request,
          observedAt,
          reason: incompatibility.startsWith('missing-') ? 'incomplete' : 'invalid',
          detail: incompatibility,
        });
      }
      const value = snapshot.value;
      const revision = snapshot.revision ?? null;
      return frozenCopy({
        status: 'observed',
        ...request,
        observedAt,
        revision,
        value,
        digest: digest({ ...request, revision, value }),
      });
    })();
    memo.set(key, pending);
    const observation = await pending;
    if (invalidated) throw new TypeError('action-observation:closed');
    if (memo.get(key) === pending) memo.set(key, observation);
    return observation;
  }

  function finish({ normalizationInputs = [] } = {}) {
    if (invalidated || finished) throw new TypeError('action-observation:closed');
    if (memo.size === 0) throw new TypeError('action-observation:empty');
    if ([...memo.values()].some((entry) => entry instanceof Promise)) {
      throw new TypeError('action-observation:pending');
    }
    const completedAt = instant(now);
    const observations = frozenCopy([...memo.values()]);
    const inputs = frozenCopy(normalizationInputs);
    const bundle = frozenCopy({
      repository,
      issue,
      boundaryId,
      startedAt,
      completedAt,
      observations,
      normalizationInputs: inputs,
      digest: digest({
        repository,
        issue,
        boundaryId,
        startedAt,
        completedAt,
        observations,
        normalizationInputs: inputs,
      }),
    });
    finished = true;
    return bundle;
  }

  function invalidate(reason) {
    nonempty(reason, 'invalidation-reason');
    invalidated = true;
    memo.clear();
  }

  return Object.freeze({ observe, finish, invalidate });
}
