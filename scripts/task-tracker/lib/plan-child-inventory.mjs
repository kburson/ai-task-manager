// @story #2069
// JSON projection of native child descriptors. Repository + issue number is the
// genuine child identity; the mapped native row does not carry an opaque node ID.
import { createHash } from 'node:crypto';
import { canonicalRecordJson as json } from './github-records/canonical-json.mjs';
const states = new Set([
  'backlog',
  'refine',
  'ready-for-plan',
  'plan',
  'develop',
  'test',
  'review',
  'done',
]);
function refuse(reason = 'invalid') {
  throw new Error('plan-candidate:native-child-inventory-' + reason);
}
export function projectNativePlanChildren(children) {
  if (!Array.isArray(children) || children.length > 1000) refuse();
  const seen = new Set();
  return children.map((child) => {
    const rank = child?.rank ?? child?.sequence;
    if (
      !child ||
      !Number.isSafeInteger(child.number) ||
      child.number <= 0 ||
      seen.has(child.number) ||
      typeof rank !== 'number' ||
      !Number.isFinite(rank) ||
      rank < 0 ||
      !Array.isArray(child.blockedBy) ||
      child.blockedBy.some(
        (number) => !Number.isSafeInteger(number) || number <= 0 || number === child.number
      ) ||
      new Set(child.blockedBy).size !== child.blockedBy.length ||
      typeof child.title !== 'string' ||
      typeof child.body !== 'string' ||
      !states.has(child.state) ||
      !['open', 'closed'].includes(child.issueState) ||
      (child.boardState != null && child.boardState !== '' && !states.has(child.boardState)) ||
      typeof child.hasCurrentRefinement !== 'boolean' ||
      (child.refinementDigest != null && !/^[a-f0-9]{64}$/.test(child.refinementDigest)) ||
      (child.childEvidenceError != null && typeof child.childEvidenceError !== 'string') ||
      (child.closeReason != null && typeof child.closeReason !== 'string') ||
      (child.recoveryPhase != null && typeof child.recoveryPhase !== 'string')
    )
      refuse();
    seen.add(child.number);
    // Preserve native sequence and all WBS/orchestration evidence. Transient
    // dependencyStates Maps are not wire data and are not consumed here.
    return {
      number: child.number,
      title: child.title,
      body: child.body,
      rank,
      blockedBy: [...child.blockedBy].sort((a, b) => a - b),
      state: child.state,
      boardState: child.boardState ?? null,
      issueState: child.issueState,
      closeReason: child.closeReason ?? null,
      recoveryPhase: child.recoveryPhase ?? null,
      hasCurrentRefinement: child.hasCurrentRefinement,
      refinementDigest: child.refinementDigest ?? null,
      childEvidenceError: child.childEvidenceError ?? null,
    };
  });
}
export function readRetainedNativePlanChildren({ inventory, identity, publishedBody }) {
  if (inventory == null) refuse('required');
  const value = JSON.parse(json(inventory));
  if (
    Object.keys(value).sort().join(',') !== 'children,complete,identity,issueDigest,schema' ||
    value.schema !== 'aitm.native-plan-children/v1' ||
    value.complete !== true ||
    json(value.identity) !== json(identity) ||
    value.issueDigest !== createHash('sha256').update(publishedBody).digest('hex')
  )
    refuse();
  const children = projectNativePlanChildren(value.children);
  if (children.some((child) => child.number === identity.issueNumber)) refuse();
  return children;
}
