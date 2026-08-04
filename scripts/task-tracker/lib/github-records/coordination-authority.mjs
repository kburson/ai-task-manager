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
const MAX_DELEGATION_REPLACEMENT_DEPTH = 128;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const ADOPTION_SUBMISSION_TYPES = new Set([
  'execution-result',
  'verification-evidence',
  'review-result',
  'handoff',
]);
const authorityMetadata = new WeakMap();
const authorityGenerations = new Map();

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

function authorityEpochKey(grantId, epoch) {
  return `${grantId}:${epoch}`;
}

function advanceAuthorityGeneration(grantId, epoch) {
  const key = authorityEpochKey(grantId, epoch);
  const generation = (authorityGenerations.get(key) ?? 0) + 1;
  authorityGenerations.set(key, generation);
  return generation;
}

function advanceAuthorityGenerations(validatedGrants) {
  return new Map(
    validatedGrants.map(({ grant }) => [
      authorityEpochKey(grant.grantId, grant.epoch),
      advanceAuthorityGeneration(grant.grantId, grant.epoch),
    ])
  );
}

function activeAuthority(
  validatedGrant,
  generation,
  effectiveScope = validatedGrant.scope,
  durableContext = null
) {
  const authority = deepFreeze({
    status: 'active',
    grant: frozenCopy(validatedGrant.grant),
    scopeIssueIds: Object.freeze([...effectiveScope]),
  });
  authorityMetadata.set(authority, {
    key: authorityEpochKey(authority.grant.grantId, authority.grant.epoch),
    generation,
    adoptionOnly: false,
    durableContext,
  });
  return authority;
}

function mintActiveAuthority(validatedGrant) {
  return activeAuthority(
    validatedGrant,
    advanceAuthorityGeneration(validatedGrant.grant.grantId, validatedGrant.grant.epoch)
  );
}

function isActiveAuthorityResult(authority) {
  const metadata = authorityMetadata.get(authority);
  return metadata !== undefined && authorityGenerations.get(metadata.key) === metadata.generation;
}

function resolutionBlocked(validatedGrants, reason) {
  advanceAuthorityGenerations(validatedGrants);
  return blocked(reason);
}

function resolutionPaused(
  validatedGrants,
  validatedGrant,
  effectiveScope = validatedGrant.scope,
  adoptionContext = null
) {
  const generations = advanceAuthorityGenerations(validatedGrants);
  const authority = paused();
  authorityMetadata.set(authority, {
    key: authorityEpochKey(validatedGrant.grant.grantId, validatedGrant.grant.epoch),
    generation: generations.get(
      authorityEpochKey(validatedGrant.grant.grantId, validatedGrant.grant.epoch)
    ),
    adoptionOnly: true,
    grant: frozenCopy(validatedGrant.grant),
    scopeIssueIds: Object.freeze([...effectiveScope]),
    adoptionContext,
  });
  return authority;
}

function resolutionActive(
  validatedGrants,
  validatedGrant,
  effectiveScope = validatedGrant.scope,
  durableContext = null
) {
  const generations = advanceAuthorityGenerations(validatedGrants);
  return activeAuthority(
    validatedGrant,
    generations.get(authorityEpochKey(validatedGrant.grant.grantId, validatedGrant.grant.epoch)),
    effectiveScope,
    durableContext
  );
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

function isSubset(candidate, parent) {
  return candidate.every((value) => parent.includes(value));
}

function validInitialDelegationEdge(parent, child, parents) {
  const parentAuthorityGrantId = parent.envelope?.authority.grantId;
  return (
    child.grant.epoch === parent.grant.epoch &&
    child.grant.parentGrantId === parent.grant.grantId &&
    isDeepStrictEqual(child.grant.issuer, parent.grant.coordinator) &&
    hasEnvelopeAuthority(
      child,
      parent.grant.coordinator,
      parent.grant.epoch,
      parentAuthorityGrantId
    ) &&
    isDescendant(child.grant.scope.scopeRootIssue, parent.grant.scope.scopeRootIssue, parents) &&
    isStrictSubset(child.scope, parent.scope) &&
    isStrictSubset(child.grant.operations, parent.grant.operations) &&
    isStrictSubset(child.branches, parent.branches) &&
    isStrictSubset(child.sourceBranches, parent.sourceBranches) &&
    isStrictSubset(child.destinationBranches, parent.destinationBranches)
  );
}

function validDelegationEdge(parent, child, parents, predecessorsBySuccessorId) {
  const visitedGrantIds = new Set();
  let current = child;
  let depth = 0;
  while (true) {
    if (visitedGrantIds.has(current.grant.grantId)) return 'delegation-cycle';
    visitedGrantIds.add(current.grant.grantId);
    const predecessor = predecessorsBySuccessorId.get(current.grant.grantId);
    if (predecessor === undefined) {
      return validInitialDelegationEdge(parent, current, parents) ? null : 'invalid-delegation';
    }
    if (current.grant.parentGrantId !== parent.grant.grantId) return 'invalid-delegation';
    depth += 1;
    if (depth > MAX_DELEGATION_REPLACEMENT_DEPTH) return 'delegation-depth';
    current = predecessor;
  }
}

function buildDelegationGraph(validatedGrants, validatedRevocations, parents) {
  const grantsById = new Map(validatedGrants.map((entry) => [entry.grant.grantId, entry]));
  const predecessorsBySuccessorId = new Map();
  for (const { revocation } of validatedRevocations) {
    if (revocation.state !== 'replaced') continue;
    const predecessor = grantsById.get(revocation.grantId);
    if (predecessor === undefined || predecessorsBySuccessorId.has(revocation.replacementGrantId)) {
      return { reason: 'invalid-delegation' };
    }
    predecessorsBySuccessorId.set(revocation.replacementGrantId, predecessor);
  }
  for (const child of validatedGrants) {
    const parentGrantId = child.grant.parentGrantId;
    if (parentGrantId === null) continue;
    const parent = grantsById.get(parentGrantId);
    if (parent === undefined) return { reason: 'invalid-delegation' };
    const reason = validDelegationEdge(parent, child, parents, predecessorsBySuccessorId);
    if (reason !== null) return { reason };
  }
  return { grantsById };
}

function isDelegationAncestor(ancestor, descendant, grantsById) {
  let current = descendant;
  while (current.grant.parentGrantId !== null) {
    const parent = grantsById.get(current.grant.parentGrantId);
    if (parent === undefined) return false;
    if (parent === ancestor) return true;
    current = parent;
  }
  return false;
}

function effectiveScope(entry, activeChildrenByParentId) {
  const delegated = new Set(
    (activeChildrenByParentId.get(entry.grant.grantId) ?? []).flatMap((child) => child.scope)
  );
  return entry.scope.filter((issue) => !delegated.has(issue));
}

function hasEnvelopeAuthority(entry, coordinator, epoch, grantId = undefined) {
  if (entry.envelope === null) return true;
  return (
    entry.envelope.authority.actor === coordinator.actor &&
    entry.envelope.authority.epoch === epoch &&
    (grantId === undefined || entry.envelope.authority.grantId === grantId)
  );
}

function transitionAuthorityGrantId(grantEntry) {
  return grantEntry.envelope?.authority.grantId;
}

function validReplacementEdge(oldGrant, replacementGrant, revocationEntry) {
  const revocation = revocationEntry.revocation;
  const old = oldGrant.grant;
  const replacement = replacementGrant.grant;
  const priorAuthorityGrantId = transitionAuthorityGrantId(oldGrant);
  return (
    old.epoch === revocation.epoch &&
    replacement.epoch === old.epoch + 1 &&
    isDeepStrictEqual(replacement.issuer, old.coordinator) &&
    replacement.parentGrantId === old.parentGrantId &&
    isSubset(replacementGrant.scope, oldGrant.scope) &&
    isSubset(replacement.operations, old.operations) &&
    isSubset(replacementGrant.branches, oldGrant.branches) &&
    isSubset(replacementGrant.sourceBranches, oldGrant.sourceBranches) &&
    isSubset(replacementGrant.destinationBranches, oldGrant.destinationBranches) &&
    (old.parentGrantId !== null || hasEnvelopeAuthority(oldGrant, old.coordinator, old.epoch)) &&
    hasEnvelopeAuthority(revocationEntry, old.coordinator, old.epoch, priorAuthorityGrantId) &&
    hasEnvelopeAuthority(replacementGrant, old.coordinator, old.epoch, priorAuthorityGrantId)
  );
}

function replacementPredecessorKey(revocation) {
  return JSON.stringify([revocation.grantId, revocation.epoch]);
}

function hasReplacementCycle(successorByPredecessorId) {
  const colors = new Map();
  for (const start of successorByPredecessorId.keys()) {
    if (colors.get(start) === 'black') continue;
    const path = [];
    let current = start;
    while (current !== undefined) {
      const color = colors.get(current);
      if (color === 'gray') return true;
      if (color === 'black') break;
      colors.set(current, 'gray');
      path.push(current);
      current = successorByPredecessorId.get(current);
    }
    for (const grantId of path) colors.set(grantId, 'black');
  }
  return false;
}

function hasValidReplacementHistory(validatedGrants, validatedRevocations) {
  const grantsById = new Map(validatedGrants.map((entry) => [entry.grant.grantId, entry]));
  const successorByPredecessorId = new Map();
  const replacementPredecessors = new Set();
  const replacementSuccessors = new Set();
  for (const entry of validatedRevocations) {
    const revocation = entry.revocation;
    if (revocation.state !== 'replaced') continue;
    const oldGrant = grantsById.get(revocation.grantId);
    const replacementGrant = grantsById.get(revocation.replacementGrantId);
    if (
      oldGrant === undefined ||
      replacementGrant === undefined ||
      replacementPredecessors.has(replacementPredecessorKey(revocation)) ||
      replacementSuccessors.has(revocation.replacementGrantId) ||
      !validReplacementEdge(oldGrant, replacementGrant, entry)
    ) {
      return false;
    }
    replacementPredecessors.add(replacementPredecessorKey(revocation));
    replacementSuccessors.add(revocation.replacementGrantId);
    successorByPredecessorId.set(revocation.grantId, revocation.replacementGrantId);
  }
  return !hasReplacementCycle(successorByPredecessorId);
}

function extractCapsules({ records, repository, issue }) {
  const resolved = resolveSupersession({ records, repository, issue });
  const grants = [];
  const revocations = [];
  for (const record of resolved.effectiveRecords) {
    const { envelope } = record;
    if (envelope.recordType === 'coordinator-grant') {
      grants.push({ grant: envelope.payload, envelope });
    }
    if (envelope.recordType === 'coordinator-revocation') {
      revocations.push({ revocation: envelope.payload, envelope });
    }
  }
  const predecessorIds = new Set(
    resolved.records
      .map(({ envelope }) => envelope.predecessor)
      .filter((recordId) => recordId !== null)
  );
  const headRecord = resolved.records.find(
    ({ envelope }) => !predecessorIds.has(envelope.recordId)
  );
  return { grants, revocations, resolved, headRecord: headRecord ?? null };
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
  const hasDurableContext = repository !== undefined || issue !== undefined;
  if (
    hasDurableContext &&
    (typeof repository !== 'string' || !REPOSITORY_RE.test(repository) || !isIssue(issue))
  ) {
    throw authorityError('context');
  }
  const durableContext = hasDurableContext ? deepFreeze({ repository, issue }) : null;
  let durableGrants;
  let durableRevocations;
  let durableResolution;
  let durableHeadRecord;
  if (records !== undefined) {
    if (grants !== undefined || revocations !== undefined) throw authorityError('input');
    try {
      ({
        grants: durableGrants,
        revocations: durableRevocations,
        resolved: durableResolution,
        headRecord: durableHeadRecord,
      } = extractCapsules({ records, repository, issue }));
    } catch (error) {
      if (error instanceof TypeError && error.message === 'capsule-chain:fork') {
        return blocked('forked-capsule-history');
      }
      throw error;
    }
  } else {
    durableGrants = grants?.map((grant) => ({ grant, envelope: null }));
    durableRevocations = revocations?.map((revocation) => ({ revocation, envelope: null }));
  }
  if (!Array.isArray(durableGrants) || !Array.isArray(durableRevocations))
    throw authorityError('input');
  const validatedGrants = durableGrants.map(({ grant, envelope }) => ({
    ...validateGrant(grant, parents),
    envelope,
  }));
  const validatedRevocations = durableRevocations.map(({ revocation, envelope }) => ({
    revocation: validateRevocation(revocation),
    envelope,
  }));
  if (new Set(validatedGrants.map(({ grant }) => grant.grantId)).size !== validatedGrants.length) {
    return resolutionBlocked(validatedGrants, 'duplicate-grant');
  }
  if (!hasValidReplacementHistory(validatedGrants, validatedRevocations)) {
    return resolutionBlocked(validatedGrants, 'invalid-replacement');
  }
  const delegation = buildDelegationGraph(validatedGrants, validatedRevocations, parents);
  if (delegation.reason !== undefined) return resolutionBlocked(validatedGrants, delegation.reason);
  const projectionGrant = validatedGrants.find(
    ({ grant }) => grant.grantId === coordinationProjection.grantId
  );
  if (projectionGrant === undefined)
    return resolutionBlocked(validatedGrants, 'projection-mismatch');
  if (projectionGrant.grant.epoch !== coordinationProjection.epoch)
    return resolutionBlocked(validatedGrants, 'stale-epoch');
  const revocationEntry = validatedRevocations.find(
    (candidate) =>
      candidate.revocation.grantId === projectionGrant.grant.grantId &&
      candidate.revocation.epoch === projectionGrant.grant.epoch
  );
  if (revocationEntry !== undefined)
    return resolutionBlocked(
      validatedGrants,
      revocationEntry.revocation.state === 'revoked' ? 'revoked' : 'stale-epoch'
    );
  if (projectionGrant.grant.expiresAt !== null && projectionGrant.grant.expiresAt <= now) {
    return resolutionBlocked(validatedGrants, 'expired');
  }
  const active = validatedGrants.filter(
    (candidate) =>
      !validatedRevocations.some(
        ({ revocation }) =>
          revocation.grantId === candidate.grant.grantId &&
          revocation.epoch === candidate.grant.epoch
      ) &&
      (candidate.grant.expiresAt === null || candidate.grant.expiresAt > now)
  );
  const activeGrantIds = new Set(active.map(({ grant }) => grant.grantId));
  if (
    active.some(
      (candidate) =>
        candidate.grant.parentGrantId !== null && !activeGrantIds.has(candidate.grant.parentGrantId)
    )
  ) {
    return resolutionBlocked(validatedGrants, 'invalid-delegation');
  }
  const activeChildrenByParentId = new Map();
  for (const candidate of active) {
    if (candidate.grant.parentGrantId === null) continue;
    const children = activeChildrenByParentId.get(candidate.grant.parentGrantId) ?? [];
    children.push(candidate);
    activeChildrenByParentId.set(candidate.grant.parentGrantId, children);
  }
  if (
    active.some(
      (candidate) =>
        candidate !== projectionGrant &&
        scopesOverlap(candidate, projectionGrant) &&
        !isDelegationAncestor(candidate, projectionGrant, delegation.grantsById) &&
        !isDelegationAncestor(projectionGrant, candidate, delegation.grantsById)
    )
  ) {
    return resolutionBlocked(validatedGrants, 'overlapping-grants');
  }
  if (coordinationProjection.adoptionState === 'required') {
    const replacementRevocation = validatedRevocations.find(
      ({ revocation }) =>
        revocation.state === 'replaced' &&
        revocation.replacementGrantId === projectionGrant.grant.grantId
    );
    const predecessorGrant = validatedGrants.find(
      ({ grant }) =>
        grant.grantId === replacementRevocation?.revocation.grantId &&
        grant.epoch === replacementRevocation?.revocation.epoch
    );
    const replacementRevocationRecordId = replacementRevocation?.envelope?.recordId;
    const replacementGrantRecordId = projectionGrant.envelope?.recordId;
    const effectiveRecordPositions = new Map(
      durableResolution?.effectiveRecords.map((record, index) => [record.envelope.recordId, index])
    );
    const revocationPosition = effectiveRecordPositions.get(replacementRevocationRecordId);
    const replacementPosition = effectiveRecordPositions.get(replacementGrantRecordId);
    const orderedBoundary =
      revocationPosition !== undefined &&
      replacementPosition !== undefined &&
      revocationPosition < replacementPosition;
    const eligibleAssignmentsById = new Map();
    const effectiveSubmissionsById = new Map();
    const historicallyDisposedSubmissionIds = new Set();
    const replacementDisposedSubmissionIds = new Set();
    if (orderedBoundary) {
      for (const [index, record] of durableResolution.effectiveRecords.entries()) {
        if (record.envelope.recordType === 'work-assignment' && index < revocationPosition) {
          eligibleAssignmentsById.set(record.envelope.recordId, {
            position: index,
            record: frozenCopy(record),
          });
        }
        if (ADOPTION_SUBMISSION_TYPES.has(record.envelope.recordType)) {
          effectiveSubmissionsById.set(record.envelope.recordId, {
            position: index,
            record: frozenCopy(record),
          });
        }
      }
      for (const [index, record] of durableResolution.effectiveRecords.entries()) {
        if (record.envelope.recordType !== 'record-disposition') continue;
        const payload = record.envelope.payload;
        const assignment = eligibleAssignmentsById.get(payload?.assignmentRecordId);
        const submission = effectiveSubmissionsById.get(payload?.submissionRecordId);
        const replacementClaim =
          payload?.schema === 'aitm.record-disposition/v1' &&
          payload.grantId === projectionGrant.grant.grantId &&
          payload.epoch === projectionGrant.grant.epoch &&
          isDeepStrictEqual(payload.decidedBy, projectionGrant.grant.coordinator) &&
          record.envelope.authority.grantId === projectionGrant.grant.grantId &&
          record.envelope.authority.epoch === projectionGrant.grant.epoch &&
          record.envelope.authority.actor === projectionGrant.grant.coordinator.actor;
        if (replacementClaim && submission !== undefined) {
          replacementDisposedSubmissionIds.add(payload.submissionRecordId);
        }
        if (index >= revocationPosition) continue;
        if (
          assignment !== undefined &&
          submission !== undefined &&
          assignment.position < submission.position &&
          submission.position < index &&
          payload?.schema === 'aitm.record-disposition/v1' &&
          (payload.decision === 'accepted' || payload.decision === 'rejected') &&
          payload.assignmentCommentNodeId === assignment.record.commentNodeId &&
          payload.submissionCommentNodeId === submission.record.commentNodeId &&
          payload.grantId === predecessorGrant?.grant.grantId &&
          payload.epoch === predecessorGrant?.grant.epoch &&
          isDeepStrictEqual(payload.decidedBy, predecessorGrant?.grant.coordinator) &&
          record.envelope.authority.grantId === predecessorGrant?.grant.grantId &&
          record.envelope.authority.epoch === predecessorGrant?.grant.epoch &&
          record.envelope.authority.actor === predecessorGrant?.grant.coordinator.actor
        ) {
          historicallyDisposedSubmissionIds.add(payload.submissionRecordId);
        }
      }
    }
    const adoptionContext =
      durableResolution === undefined ||
      predecessorGrant === undefined ||
      durableHeadRecord === null ||
      !orderedBoundary
        ? null
        : {
            repository,
            issue,
            predecessorGrant: frozenCopy(predecessorGrant.grant),
            predecessorScopeIssueIds: Object.freeze([...predecessorGrant.scope]),
            predecessorBranches: Object.freeze([...predecessorGrant.branches]),
            pausedHeadRecord: frozenCopy(durableHeadRecord),
            replacementRevocationRecordId,
            replacementGrantRecordId,
            eligibleAssignmentsById,
            effectiveSubmissionsById,
            historicallyDisposedSubmissionIds,
            replacementDisposedSubmissionIds,
          };
    return resolutionPaused(
      validatedGrants,
      projectionGrant,
      effectiveScope(projectionGrant, activeChildrenByParentId),
      adoptionContext
    );
  }
  return resolutionActive(
    validatedGrants,
    projectionGrant,
    effectiveScope(projectionGrant, activeChildrenByParentId),
    durableContext
  );
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
  repository,
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
  const metadata = authorityMetadata.get(authority);
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
  if (
    repository !== undefined &&
    (metadata?.durableContext === null ||
      metadata?.durableContext === undefined ||
      repository !== metadata.durableContext.repository ||
      issue !== metadata.durableContext.issue)
  ) {
    return authorization(false, 'repository');
  }
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

/** Authorize only replacement disposition/adoption while normal authority remains paused. */
export function authorizeCoordinatorAdoption({
  authority,
  issue,
  operation,
  branch,
  repository,
  grantId,
  epoch,
  coordinator,
  assignment,
  submission,
  records,
} = {}) {
  const metadata = authorityMetadata.get(authority);
  if (
    !isPlainDataObject(authority) ||
    !metadata?.adoptionOnly ||
    authorityGenerations.get(metadata.key) !== metadata.generation ||
    !hasExactlyKeys(authority, ['diagnostic', 'status']) ||
    authority.status !== 'paused' ||
    !hasExactlyKeys(authority.diagnostic, ['reason']) ||
    authority.diagnostic.reason !== 'adoption-required' ||
    metadata.adoptionContext === null
  ) {
    return authorization(false, 'authority');
  }
  if (
    !['dispose-submission', 'adopt-submissions'].includes(operation) ||
    !metadata.grant.operations.includes(operation)
  ) {
    return authorization(false, 'operation');
  }
  const context = metadata.adoptionContext;
  if (repository !== context.repository) return authorization(false, 'repository');
  if (issue !== context.issue || !metadata.scopeIssueIds.includes(issue)) {
    return authorization(false, 'scope');
  }
  if (operation === 'dispose-submission') {
    const predecessor = context.predecessorGrant;
    if (
      grantId !== predecessor.grantId ||
      epoch !== predecessor.epoch ||
      !isDeepStrictEqual(coordinator, predecessor.coordinator) ||
      !context.predecessorScopeIssueIds.includes(issue)
    ) {
      return authorization(false, 'identity');
    }
    let normalizedBranch;
    try {
      normalizedBranch = normalizeBranch(branch);
    } catch {
      return authorization(false, 'branch');
    }
    if (
      !metadata.grant.branchBoundary.map(normalizeBranch).includes(normalizedBranch) ||
      !context.predecessorBranches.includes(normalizedBranch)
    ) {
      return authorization(false, 'branch');
    }
    const durableAssignment = context.eligibleAssignmentsById.get(assignment?.envelope?.recordId);
    const durableSubmission = context.effectiveSubmissionsById.get(submission?.envelope?.recordId);
    if (
      durableAssignment === undefined ||
      durableSubmission === undefined ||
      context.historicallyDisposedSubmissionIds.has(submission?.envelope?.recordId) ||
      context.replacementDisposedSubmissionIds.has(submission?.envelope?.recordId) ||
      !isDeepStrictEqual(durableAssignment.record, assignment) ||
      !isDeepStrictEqual(durableSubmission.record, submission) ||
      durableSubmission.position <= durableAssignment.position
    ) {
      return authorization(false, 'record');
    }
  } else {
    if (!Array.isArray(records)) return authorization(false, 'record');
    const suppliedById = new Map(records.map((record) => [record?.envelope?.recordId, record]));
    const pausedHeadRecordId = context.pausedHeadRecord.envelope.recordId;
    if (!isDeepStrictEqual(suppliedById.get(pausedHeadRecordId), context.pausedHeadRecord)) {
      return authorization(false, 'record');
    }
  }
  return deepFreeze({
    authorized: true,
    grantId: metadata.grant.grantId,
    epoch: metadata.grant.epoch,
    coordinator: frozenCopy(metadata.grant.coordinator),
    scopeIssueIds: Object.freeze([...metadata.scopeIssueIds]),
    branchBoundary: Object.freeze(metadata.grant.branchBoundary.map(normalizeBranch)),
    pausedHeadRecordId: context.pausedHeadRecord.envelope.recordId,
    replacementRevocationRecordId: context.replacementRevocationRecordId,
    replacementGrantRecordId: context.replacementGrantRecordId,
    predecessorGrantId: context.predecessorGrant.grantId,
    predecessorEpoch: context.predecessorGrant.epoch,
    predecessorCoordinator: frozenCopy(context.predecessorGrant.coordinator),
  });
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
    !isStrictSubset(candidate.scope, parentAuthority.scopeIssueIds) ||
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
  const authority = mintActiveAuthority(candidate);
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
  advanceAuthorityGeneration(current.grantId, current.epoch);
  return result;
}
