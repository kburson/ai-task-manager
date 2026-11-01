// @story #2039 #2059
// Pure validation only. Public staging routes do not acquire proof authority here.
import { validateReviewedDelta } from '../reviewed-scope/record.mjs';
import { scanScope, resolveScopeTarget } from '../reviewed-scope/targets.mjs';
import { stripBodyVersion } from '../versioned-issue-write.mjs';
import { validateNativePlanApprovalDelta } from '../plan-approval-staging.mjs';
import {
  INVARIANT_MARKER_PATTERNS,
  findLostMarkers,
  findUnexpectedSectionLoss,
  findCheckboxesTickedWithoutProof,
  findNewMalformedVerifiedCmds,
  findNewlyIntroducedExecutionProof,
  findStructurallyIncompleteIntroducedProof,
  findLostOrMovedExecutionProof,
  validateMarkerAdvances,
} from '../body-invariants.mjs';

const text = (value) => typeof value === 'string' && value.isWellFormed();
const decomposition = new Set(['aitm-decomposition-assessment', 'aitm-decomposition-publication']);
function refuse(reason, cause) {
  throw Object.assign(new Error(`Story composite refused: ${reason}`, { cause }), {
    code: 'STORY_MUTATION_INVALID',
    reason,
  });
}
function exact(value, keys, required = keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse('arguments');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).some(
      (key) => !keys.includes(key) || !Object.hasOwn(descriptors[key], 'value')
    ) ||
    required.some((key) => !Object.hasOwn(descriptors, key))
  )
    refuse('arguments');
  return Object.fromEntries(
    Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value])
  );
}
function markerValues(body, re) {
  return [...body.matchAll(new RegExp('<!--[\\s\\S]*?-->', 'g'))]
    .map((match) => match[0])
    .filter((marker) => {
      return new RegExp(re.source, re.flags.replace('g', '')).test(marker);
    });
}
function common(base, candidate) {
  if (findLostMarkers(base, candidate).length) refuse('marker-loss');
  if (findUnexpectedSectionLoss(base, candidate)) refuse('section-loss');
  if (findLostOrMovedExecutionProof(base, candidate).length) refuse('proof-loss-or-move');
  if (findStructurallyIncompleteIntroducedProof(base, candidate).length) refuse('incomplete-proof');
  if (findNewlyIntroducedExecutionProof(base, candidate).length) refuse('execution-proof');
  if (findNewMalformedVerifiedCmds(base, candidate).length) refuse('verifier-declaration');
  const versions = /<!--\s*aitm-body-version(?:\s*:|\s+version=)/i;
  if (
    JSON.stringify(markerValues(base, versions)) !==
    JSON.stringify(markerValues(candidate, versions))
  )
    refuse('legacy-version');
}
function authority(input) {
  if (input === undefined || input === null) return null;
  const value = exact(
    input,
    [
      'reviewedEvidenceCapability',
      'decompositionMutationCapability',
      'nativePlanApprovalCapability',
      'issueNumber',
      'repo',
    ],
    []
  );
  if (Object.hasOwn(value, 'nativePlanApprovalCapability')) {
    if (Object.keys(value).length !== 1 || !value.nativePlanApprovalCapability)
      refuse('capability');
    return value;
  }
  if (Object.hasOwn(value, 'reviewedEvidenceCapability')) {
    if (Object.keys(value).length !== 1 || !value.reviewedEvidenceCapability) refuse('capability');
    return value;
  }
  if (
    Object.keys(value).sort().join(',') !== 'decompositionMutationCapability,issueNumber,repo' ||
    !value.decompositionMutationCapability ||
    !Number.isSafeInteger(value.issueNumber) ||
    value.issueNumber <= 0 ||
    !text(value.repo) ||
    !/^[^/\s]+\/[^/\s]+$/.test(value.repo)
  )
    refuse('capability');
  return value;
}
function markers(base, candidate, capability) {
  const allowed = [];
  for (const marker of INVARIANT_MARKER_PATTERNS) {
    if (
      JSON.stringify(markerValues(base, marker.re)) ===
      JSON.stringify(markerValues(candidate, marker.re))
    )
      continue;
    if (decomposition.has(marker.name) && capability?.decompositionMutationCapability) {
      allowed.push(marker.name);
      continue;
    }
    refuse('protected-marker');
  }
  if (capability?.decompositionMutationCapability && !allowed.length) refuse('unused-capability');
  validateMarkerAdvances(base, candidate, { ...capability, allowMarkerAdvance: allowed });
}
// Native authority reports a coordinate in stripBodyVersion(candidate).
// Resolve its unique target identity against the original strings; never rewrite
// raw whitespace or legacy marker bytes to make coordinate systems coincide.
function rawReviewedTarget(base, candidate, nativeLine) {
  const normalized = scanScope(stripBodyVersion(candidate)).targets.find(
    (entry) => entry.lineIndex === nativeLine
  );
  if (!normalized) refuse('reviewed-scope-target');
  const before = resolveScopeTarget(base, normalized.label);
  const after = resolveScopeTarget(candidate, normalized.label);
  return { before: before.raw, after: after.raw, lineIndex: after.lineIndex };
}
function local(operation) {
  const { base, candidate, capability } = operation;
  common(base, candidate);
  if (capability?.nativePlanApprovalCapability) {
    validateNativePlanApprovalDelta(capability.nativePlanApprovalCapability, { base, candidate });
    return null;
  }
  const reviewedLine = validateReviewedDelta(
    base,
    candidate,
    capability?.reviewedEvidenceCapability
  );
  if (capability?.reviewedEvidenceCapability && !Number.isInteger(reviewedLine))
    refuse('capability');
  const target = capability?.reviewedEvidenceCapability
    ? rawReviewedTarget(base, candidate, reviewedLine)
    : null;
  if (
    findCheckboxesTickedWithoutProof(base, candidate, { includeNew: true }).some(
      (line) => line.lineIndex !== target?.lineIndex
    )
  )
    refuse('unverified-ticks');
  markers(base, candidate, capability);
  return target;
}
function replaceLine(body, from, to) {
  const lines = body.split('\n');
  const indexes = lines.flatMap((line, index) => (line === from ? [index] : []));
  if (indexes.length !== 1) refuse('reviewed-scope-changed');
  lines[indexes[0]] = to;
  return lines.join('\n');
}
function undoDecomposition(body, operation) {
  let result = body;
  for (const marker of INVARIANT_MARKER_PATTERNS.filter((entry) => decomposition.has(entry.name))) {
    const current = markerValues(result, marker.re);
    const expected = markerValues(operation.candidate, marker.re);
    const previous = markerValues(operation.base, marker.re);
    if (
      JSON.stringify(current) !== JSON.stringify(expected) ||
      current.length > 1 ||
      previous.length > 1
    )
      refuse('capability-scope-changed');
    if (current.length) result = result.replace(current[0], previous[0] || '');
    else if (previous.length) refuse('marker-loss');
  }
  return result;
}
/**
 * Ordered exact {base,candidate,capability?} operations retain native references.
 * Execution stampers have no opaque grant; new execution proof remains refused.
 * Decomposition authority still requires its native active context and lock.
 * This pure validator cannot refresh or prolong a capability's lifetime.
 */
export function validateStagedComposite(input) {
  try {
    const { base, candidate, operations } = exact(input, ['base', 'candidate', 'operations']);
    if (!text(base) || !text(candidate) || !Array.isArray(operations)) refuse('arguments');
    const retained = operations.map((entry) => {
      const operation = exact(entry, ['base', 'candidate', 'capability'], ['base', 'candidate']);
      if (!text(operation.base) || !text(operation.candidate)) refuse('arguments');
      return { ...operation, capability: authority(operation.capability) };
    });
    let current = base;
    for (const operation of retained) {
      if (operation.base !== current) refuse('operation-chain');
      operation.reviewedTarget = local(operation);
      current = operation.candidate;
    }
    if (current !== candidate) refuse('candidate-mismatch');
    common(base, candidate);
    // Undo only exact deltas revalidated by their original native authority.
    // No union of per-operation permission flags authorizes the composite.
    let projected = candidate;
    for (const operation of retained.toReversed()) {
      if (operation.capability?.nativePlanApprovalCapability) {
        if (projected !== operation.candidate) refuse('native-approval-delta');
        validateNativePlanApprovalDelta(operation.capability.nativePlanApprovalCapability, {
          base: operation.base,
          candidate: projected,
        });
        projected = operation.base;
      } else if (operation.capability?.reviewedEvidenceCapability) {
        const { before, after } = operation.reviewedTarget;
        const restored = replaceLine(projected, after, before);
        validateReviewedDelta(restored, projected, operation.capability.reviewedEvidenceCapability);
        projected = restored;
      } else if (operation.capability?.decompositionMutationCapability) {
        const restored = undoDecomposition(projected, operation);
        markers(restored, projected, operation.capability);
        projected = restored;
      }
    }
    validateReviewedDelta(base, projected);
    if (findCheckboxesTickedWithoutProof(base, projected, { includeNew: true }).length)
      refuse('unverified-ticks');
    markers(base, projected, null);
    return true;
  } catch (error) {
    if (error?.code === 'STORY_MUTATION_INVALID') throw error;
    refuse('native-invariant', error);
  }
}
