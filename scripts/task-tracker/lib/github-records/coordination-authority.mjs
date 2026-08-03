import { isDeepStrictEqual } from 'node:util';

import { resolveSupersession } from './capsule-chain.mjs';
import { assertNoSecretRecordData } from './record-envelope.mjs';

const GRANT_KEYS = [
  'activatedAt',
  'branchBoundary',
  'coordinator',
  'epoch',
  'expiresAt',
  'grantId',
  'integrationBoundary',
  'issuer',
  'operations',
  'parentGrantId',
  'schema',
  'scope',
];
const SCOPE_KEYS = ['excludedIssues', 'includedIssues', 'scopeRootIssue'];
const IDENTITY_KEYS = ['actor', 'platform', 'session'];
const INTEGRATION_KEYS = ['destinationBranches', 'sourceBranches'];
const PROJECTION_KEYS = ['adoptionState', 'epoch', 'grantId', 'schema'];
const REVOCATION_KEYS = ['epoch', 'grantId', 'schema', 'state'];
const REPLACEMENT_REVOCATION_KEYS = [...REVOCATION_KEYS, 'replacementGrantId'];
const activeAuthorityResults = new WeakSet();
const invalidatedAuthorityResults = new WeakSet();
const activeAuthorityResultsByEpoch = new Map();

function authorityError(category) {
  return new TypeError(`coordination-authority:${category}`);
}

function isPlainDataObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== 'string') return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
  });
}

function hasExactlyKeys(value, keys) {
  if (!isPlainDataObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isOpaqueId(value) {
  return (
    typeof value === 'string' && value.length > 0 && value === value.trim() && value.length <= 256
  );
}

function isIssue(value) {
  return Number.isInteger(value) && value > 0;
}

function isInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function normalizeBranch(value) {
  if (!isOpaqueId(value)) throw authorityError('branch');
  const branch = value.startsWith('refs/heads/') ? value.slice('refs/heads/'.length) : value;
  if (!branch || branch.startsWith('/') || branch.endsWith('/') || branch.includes('//')) {
    throw authorityError('branch');
  }
  return branch;
}

function assertDistinct(values, category) {
  if (
    !Array.isArray(values) ||
    values.some((value) => !isOpaqueId(value)) ||
    new Set(values).size !== values.length
  ) {
    throw authorityError(category);
  }
}

function assertDistinctIssues(values, category) {
  if (
    !Array.isArray(values) ||
    values.some((value) => !isIssue(value)) ||
    new Set(values).size !== values.length
  ) {
    throw authorityError(category);
  }
}

function validateIdentity(value, category = 'grant') {
  if (!hasExactlyKeys(value, IDENTITY_KEYS) || !Object.values(value).every(isOpaqueId)) {
    throw authorityError(category);
  }
  return value;
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function frozenCopy(value) {
  return deepFreeze(structuredClone(value));
}

function blocked(reason) {
  return deepFreeze({ status: 'blocked', diagnostic: { reason } });
}

function paused() {
  return deepFreeze({ status: 'paused', diagnostic: { reason: 'adoption-required' } });
}

function authorization(authorized, reason = undefined) {
  return deepFreeze(reason === undefined ? { authorized } : { authorized, reason });
}

function buildHierarchy(issueHierarchy) {
  if (!Array.isArray(issueHierarchy)) throw authorityError('hierarchy');
  const parents = new Map();
  for (const entry of issueHierarchy) {
    if (!hasExactlyKeys(entry, ['issue', 'parentIssue']) || !isIssue(entry.issue)) {
      throw authorityError('hierarchy');
    }
    if (entry.parentIssue !== null && !isIssue(entry.parentIssue))
      throw authorityError('hierarchy');
    if (parents.has(entry.issue)) throw authorityError('hierarchy');
    parents.set(entry.issue, entry.parentIssue);
  }
  for (const parent of parents.values()) {
    if (parent !== null && !parents.has(parent)) throw authorityError('hierarchy');
  }
  const visits = new Set();
  const complete = new Set();
  const visit = (issue) => {
    if (visits.has(issue)) throw authorityError('hierarchy');
    if (complete.has(issue)) return;
    visits.add(issue);
    const parent = parents.get(issue);
    if (parent !== null) visit(parent);
    visits.delete(issue);
    complete.add(issue);
  };
  for (const issue of parents.keys()) visit(issue);
  return parents;
}

function isDescendant(issue, ancestor, parents) {
  let current = parents.get(issue);
  while (current !== null && current !== undefined) {
    if (current === ancestor) return true;
    current = parents.get(current);
  }
  return false;
}

function scopeIssueIds(grant, parents) {
  const { excludedIssues, includedIssues, scopeRootIssue } = grant.scope;
  if (
    !hasExactlyKeys(grant.scope, SCOPE_KEYS) ||
    !isIssue(scopeRootIssue) ||
    !parents.has(scopeRootIssue)
  ) {
    throw authorityError('grant');
  }
  assertDistinctIssues(includedIssues, 'grant');
  assertDistinctIssues(excludedIssues, 'grant');
  if (
    includedIssues.some(
      (issue) => !parents.has(issue) || !isDescendant(issue, scopeRootIssue, parents)
    )
  ) {
    throw authorityError('grant');
  }
  if (
    excludedIssues.some(
      (issue) => !parents.has(issue) || !isDescendant(issue, scopeRootIssue, parents)
    )
  ) {
    throw authorityError('grant');
  }
  return [scopeRootIssue, ...includedIssues]
    .filter((issue) => !excludedIssues.includes(issue))
    .sort((a, b) => a - b);
}

function branchSet(branches, category) {
  if (!Array.isArray(branches) || branches.length === 0) throw authorityError(category);
  const normalized = branches.map(normalizeBranch);
  if (new Set(normalized).size !== normalized.length) throw authorityError(category);
  return normalized;
}

function validateGrant(grant, parents) {
  if (!hasExactlyKeys(grant, GRANT_KEYS)) throw authorityError('grant');
  try {
    assertNoSecretRecordData(grant);
  } catch {
    throw authorityError('grant');
  }
  if (grant.schema !== 'aitm.coordinator-grant/v1' || !isOpaqueId(grant.grantId)) {
    throw authorityError('grant');
  }
  validateIdentity(grant.coordinator);
  if (grant.issuer !== null) validateIdentity(grant.issuer);
  if (grant.parentGrantId !== null && !isOpaqueId(grant.parentGrantId))
    throw authorityError('grant');
  if (!Number.isInteger(grant.epoch) || grant.epoch <= 0) throw authorityError('grant');
  assertDistinct(grant.operations, 'grant');
  if (!isInstant(grant.activatedAt) || (grant.expiresAt !== null && !isInstant(grant.expiresAt))) {
    throw authorityError('grant');
  }
  if (grant.expiresAt !== null && grant.expiresAt <= grant.activatedAt)
    throw authorityError('grant');
  const scope = scopeIssueIds(grant, parents);
  const branches = branchSet(grant.branchBoundary, 'grant');
  if (!hasExactlyKeys(grant.integrationBoundary, INTEGRATION_KEYS)) throw authorityError('grant');
  if (
    !Array.isArray(grant.integrationBoundary.sourceBranches) ||
    !Array.isArray(grant.integrationBoundary.destinationBranches)
  ) {
    throw authorityError('grant');
  }
  const sourceBranches = grant.integrationBoundary.sourceBranches.map(normalizeBranch);
  const destinationBranches = grant.integrationBoundary.destinationBranches.map(normalizeBranch);
  if (
    new Set(sourceBranches).size !== sourceBranches.length ||
    new Set(destinationBranches).size !== destinationBranches.length ||
    sourceBranches.some((branch) => !branches.includes(branch)) ||
    destinationBranches.some((branch) => !branches.includes(branch))
  ) {
    throw authorityError('grant');
  }
  return { grant, scope, branches, sourceBranches, destinationBranches };
}

function validateProjection(projection) {
  if (!hasExactlyKeys(projection, PROJECTION_KEYS)) throw authorityError('projection');
  if (
    projection.schema !== 'aitm.coordination-projection/v1' ||
    !isOpaqueId(projection.grantId) ||
    !Number.isInteger(projection.epoch) ||
    projection.epoch <= 0 ||
    !['adopted', 'required'].includes(projection.adoptionState)
  ) {
    throw authorityError('projection');
  }
  return projection;
}

function validateRevocation(revocation) {
  const replaced = revocation?.state === 'replaced';
  if (!hasExactlyKeys(revocation, replaced ? REPLACEMENT_REVOCATION_KEYS : REVOCATION_KEYS)) {
    throw authorityError('revocation');
  }
  if (
    revocation.schema !== 'aitm.coordinator-revocation/v1' ||
    !isOpaqueId(revocation.grantId) ||
    !Number.isInteger(revocation.epoch) ||
    revocation.epoch <= 0 ||
    !['replaced', 'revoked'].includes(revocation.state) ||
    (replaced && !isOpaqueId(revocation.replacementGrantId))
  ) {
    throw authorityError('revocation');
  }
  return revocation;
}

function activeAuthority(validatedGrant) {
  const authority = deepFreeze({
    status: 'active',
    grant: frozenCopy(validatedGrant.grant),
    scopeIssueIds: Object.freeze([...validatedGrant.scope]),
  });
  activeAuthorityResults.add(authority);
  const key = authorityEpochKey(authority.grant.grantId, authority.grant.epoch);
  const authorities = activeAuthorityResultsByEpoch.get(key) ?? new Set();
  authorities.add(authority);
  activeAuthorityResultsByEpoch.set(key, authorities);
  return authority;
}

function authorityEpochKey(grantId, epoch) {
  return `${grantId}:${epoch}`;
}

function isActiveAuthorityResult(authority) {
  return activeAuthorityResults.has(authority) && !invalidatedAuthorityResults.has(authority);
}

function invalidateAuthorityEpoch(grantId, epoch) {
  const key = authorityEpochKey(grantId, epoch);
  for (const authority of activeAuthorityResultsByEpoch.get(key) ?? []) {
    invalidatedAuthorityResults.add(authority);
  }
  activeAuthorityResultsByEpoch.delete(key);
}

function scopesOverlap(left, right) {
  return (
    left.grant.operations.some((operation) => right.grant.operations.includes(operation)) &&
    left.scope.some((issue) => right.scope.includes(issue))
  );
}

function isStrictSubset(candidate, parent) {
  return candidate.length < parent.length && candidate.every((value) => parent.includes(value));
}

function extractCapsules({ records, repository, issue }) {
  const resolved = resolveSupersession({ records, repository, issue });
  const grants = [];
  const revocations = [];
  for (const record of resolved.effectiveRecords) {
    const { envelope } = record;
    if (envelope.recordType === 'coordinator-grant') {
      if (envelope.payload?.epoch !== envelope.authority.epoch) throw authorityError('capsule');
      grants.push(envelope.payload);
    }
    if (envelope.recordType === 'coordinator-revocation') {
      revocations.push(envelope.payload);
    }
  }
  return { grants, revocations };
}

/** Resolve a durable coordinator authority set without selecting ambiguous authority. */
export function resolveCoordinatorAuthority({
  issueHierarchy,
  grants,
  revocations,
  records,
  repository,
  issue,
  coordinationProjection,
  now = new Date().toISOString(),
} = {}) {
  const parents = buildHierarchy(issueHierarchy);
  validateProjection(coordinationProjection);
  if (!isInstant(now)) throw authorityError('now');
  let durableGrants = grants;
  let durableRevocations = revocations;
  if (records !== undefined) {
    if (grants !== undefined || revocations !== undefined) throw authorityError('input');
    try {
      ({ grants: durableGrants, revocations: durableRevocations } = extractCapsules({
        records,
        repository,
        issue,
      }));
    } catch (error) {
      if (error instanceof TypeError && error.message === 'capsule-chain:fork') {
        return blocked('forked-capsule-history');
      }
      throw error;
    }
  }
  if (!Array.isArray(durableGrants) || !Array.isArray(durableRevocations))
    throw authorityError('input');
  const validatedGrants = durableGrants.map((grant) => validateGrant(grant, parents));
  const validatedRevocations = durableRevocations.map(validateRevocation);
  for (const revocation of validatedRevocations) {
    invalidateAuthorityEpoch(revocation.grantId, revocation.epoch);
  }
  if (new Set(validatedGrants.map(({ grant }) => grant.grantId)).size !== validatedGrants.length) {
    return blocked('duplicate-grant');
  }
  const projectionGrant = validatedGrants.find(
    ({ grant }) => grant.grantId === coordinationProjection.grantId
  );
  if (projectionGrant === undefined) return blocked('projection-mismatch');
  if (projectionGrant.grant.epoch !== coordinationProjection.epoch) return blocked('stale-epoch');
  const revocation = validatedRevocations.find(
    (candidate) =>
      candidate.grantId === projectionGrant.grant.grantId &&
      candidate.epoch === projectionGrant.grant.epoch
  );
  if (revocation !== undefined)
    return blocked(revocation.state === 'revoked' ? 'revoked' : 'stale-epoch');
  if (projectionGrant.grant.expiresAt !== null && projectionGrant.grant.expiresAt <= now) {
    return blocked('expired');
  }
  const active = validatedGrants.filter(
    (candidate) =>
      !validatedRevocations.some(
        (revocation) =>
          revocation.grantId === candidate.grant.grantId &&
          revocation.epoch === candidate.grant.epoch
      ) &&
      (candidate.grant.expiresAt === null || candidate.grant.expiresAt > now)
  );
  if (
    active.some(
      (candidate) => candidate !== projectionGrant && scopesOverlap(candidate, projectionGrant)
    )
  ) {
    return blocked('overlapping-grants');
  }
  if (coordinationProjection.adoptionState === 'required') return paused();
  return activeAuthority(projectionGrant);
}

/** Authorize one bounded coordinator operation from an already resolved authority. */
export function authorizeCoordinatorOperation({
  authority,
  grantId,
  epoch,
  coordinator,
  issue,
  operation,
  branch,
  integration = null,
} = {}) {
  if (!isPlainDataObject(authority) || !isActiveAuthorityResult(authority)) {
    return authorization(false, 'authority');
  }
  if (authority.status !== 'active') {
    const reason =
      isPlainDataObject(authority.diagnostic) && typeof authority.diagnostic.reason === 'string'
        ? authority.diagnostic.reason
        : 'authority';
    return authorization(false, reason);
  }
  const { grant, scopeIssueIds } = authority;
  if (
    !hasExactlyKeys(authority, ['grant', 'scopeIssueIds', 'status']) ||
    !isPlainDataObject(grant) ||
    !Array.isArray(scopeIssueIds) ||
    !scopeIssueIds.every(isIssue) ||
    !Array.isArray(grant.operations) ||
    !Array.isArray(grant.branchBoundary) ||
    !hasExactlyKeys(grant.integrationBoundary, INTEGRATION_KEYS) ||
    !Array.isArray(grant.integrationBoundary.sourceBranches) ||
    !Array.isArray(grant.integrationBoundary.destinationBranches)
  ) {
    return authorization(false, 'authority');
  }
  if (
    grantId !== grant.grantId ||
    epoch !== grant.epoch ||
    !isDeepStrictEqual(coordinator, grant.coordinator)
  ) {
    return authorization(false, 'identity');
  }
  if (!scopeIssueIds.includes(issue)) return authorization(false, 'scope');
  if (!grant.operations.includes(operation)) return authorization(false, 'operation');
  let normalizedBranch;
  try {
    normalizedBranch = normalizeBranch(branch);
  } catch {
    return authorization(false, 'branch');
  }
  const allowedBranches = grant.branchBoundary.map(normalizeBranch);
  if (!allowedBranches.includes(normalizedBranch)) return authorization(false, 'branch');
  if (operation !== 'integrate') return authorization(true);
  if (!hasExactlyKeys(integration, ['destinationBranch', 'sourceBranch'])) {
    return authorization(false, 'integration');
  }
  let sourceBranch;
  let destinationBranch;
  try {
    sourceBranch = normalizeBranch(integration.sourceBranch);
    destinationBranch = normalizeBranch(integration.destinationBranch);
  } catch {
    return authorization(false, 'integration');
  }
  if (
    normalizedBranch !== destinationBranch ||
    !grant.integrationBoundary.sourceBranches.map(normalizeBranch).includes(sourceBranch) ||
    !grant.integrationBoundary.destinationBranches.map(normalizeBranch).includes(destinationBranch)
  ) {
    return authorization(false, 'integration');
  }
  return authorization(true);
}

/** Produce a narrower, capsule-ready nested coordinator grant without persistence. */
export function grantNestedEpic({
  parentAuthority,
  issueHierarchy,
  grant,
  activeGrants = [],
} = {}) {
  const parents = buildHierarchy(issueHierarchy);
  if (
    !isPlainDataObject(parentAuthority) ||
    parentAuthority.status !== 'active' ||
    !isActiveAuthorityResult(parentAuthority)
  ) {
    throw authorityError('nested-scope');
  }
  let candidate;
  let parent;
  try {
    candidate = validateGrant(grant, parents);
    parent = validateGrant(parentAuthority.grant, parents);
  } catch {
    throw authorityError('nested-scope');
  }
  if (
    !isDescendant(
      candidate.grant.scope.scopeRootIssue,
      parent.grant.scope.scopeRootIssue,
      parents
    ) ||
    candidate.grant.parentGrantId !== parent.grant.grantId ||
    !isDeepStrictEqual(candidate.grant.issuer, parent.grant.coordinator) ||
    !isStrictSubset(candidate.scope, parent.scope) ||
    !isStrictSubset(candidate.grant.operations, parent.grant.operations) ||
    !isStrictSubset(candidate.branches, parent.branches) ||
    !isStrictSubset(candidate.sourceBranches, parent.sourceBranches) ||
    !isStrictSubset(candidate.destinationBranches, parent.destinationBranches)
  ) {
    throw authorityError('nested-scope');
  }
  if (!Array.isArray(activeGrants)) throw authorityError('nested-scope');
  if (
    activeGrants
      .map((activeGrant) => validateGrant(activeGrant, parents))
      .some((activeGrant) => scopesOverlap(activeGrant, candidate))
  ) {
    throw authorityError('nested-scope');
  }
  const authority = activeAuthority(candidate);
  return deepFreeze({
    grant: frozenCopy(candidate.grant),
    scopeIssueIds: Object.freeze([...candidate.scope]),
    authority,
  });
}

/** Close one exact epoch and produce a paused, capsule-ready replacement. */
export function replaceCoordinator({
  authority,
  expectedGrantId,
  expectedEpoch,
  replacementGrant,
} = {}) {
  if (
    !isPlainDataObject(authority) ||
    authority.status !== 'active' ||
    !isActiveAuthorityResult(authority)
  )
    throw authorityError('stale-epoch');
  const current = authority.grant;
  if (expectedGrantId !== current.grantId || expectedEpoch !== current.epoch) {
    throw authorityError('stale-epoch');
  }
  const parents = buildHierarchy(
    [
      ...new Set([
        current.scope.scopeRootIssue,
        ...current.scope.includedIssues,
        ...current.scope.excludedIssues,
      ]),
    ].map((issue) => ({
      issue,
      parentIssue: issue === current.scope.scopeRootIssue ? null : current.scope.scopeRootIssue,
    }))
  );
  const replacement = validateGrant(replacementGrant, parents);
  if (replacement.grant.epoch !== current.epoch + 1) throw authorityError('replacement-epoch');
  if (
    replacement.scope.some((issue) => !authority.scopeIssueIds.includes(issue)) ||
    replacement.grant.operations.some((operation) => !current.operations.includes(operation)) ||
    replacement.branches.some(
      (branch) => !current.branchBoundary.map(normalizeBranch).includes(branch)
    ) ||
    replacement.sourceBranches.some(
      (branch) => !current.integrationBoundary.sourceBranches.map(normalizeBranch).includes(branch)
    ) ||
    replacement.destinationBranches.some(
      (branch) =>
        !current.integrationBoundary.destinationBranches.map(normalizeBranch).includes(branch)
    ) ||
    replacement.grant.parentGrantId !== current.parentGrantId ||
    !isDeepStrictEqual(replacement.grant.issuer, current.coordinator)
  ) {
    throw authorityError('replacement');
  }
  const revocation = {
    schema: 'aitm.coordinator-revocation/v1',
    grantId: current.grantId,
    epoch: current.epoch,
    state: 'replaced',
    replacementGrantId: replacement.grant.grantId,
  };
  const coordinationProjection = {
    schema: 'aitm.coordination-projection/v1',
    grantId: replacement.grant.grantId,
    epoch: replacement.grant.epoch,
    adoptionState: 'required',
  };
  const result = deepFreeze({
    revocation,
    replacementGrant: frozenCopy(replacement.grant),
    coordinationProjection,
  });
  invalidateAuthorityEpoch(current.grantId, current.epoch);
  return result;
}
