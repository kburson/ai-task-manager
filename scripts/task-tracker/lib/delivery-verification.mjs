// @story #939
// Independent live verification for governed pull-request delivery.

import { createHash } from 'node:crypto';

import { validateProviderAction } from './delivery-provider-action.mjs';
import { buildDeliveryIntent } from './delivery-records.mjs';
import { ISSUE_ID_GLOBAL_RE, ISSUE_PREFIX_RE } from './commit-attribution-format.mjs';

const SHA_RE = /^[0-9a-f]{40}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MERGE_METHODS = new Set(['merge', 'squash', 'rebase']);
const VERIFICATION_INPUT_KEYS = [
  'acceptedSha',
  'acceptedReviewSha',
  'attributingCommits',
  'fetchOriginTrunk',
  'inspectMergeCommit',
  'intent',
  'intentCreatedAt',
  'isAncestor',
  'localHeadSha',
  'pullRequest',
  'recovery',
  'testReceiptSha',
];
const EXTERNAL_VERIFICATION_INPUT_KEYS = VERIFICATION_INPUT_KEYS.filter(
  (key) => !['intent', 'intentCreatedAt', 'recovery'].includes(key)
).concat('intentInput');
const EXTERNAL_INTENT_INPUT_KEYS = [
  'attributionTokens',
  'baseRef',
  'clientCreatedAt',
  'expectedHeadSha',
  'headRef',
  'intentId',
  'issueNumber',
  'mergeMethod',
  'prNumber',
  'provider',
  'repository',
  'sessionId',
  'supersedesIntentId',
];
const EVIDENCE_INPUT_KEYS = [
  'branchDisposition',
  'ciRunUrl',
  'closeResult',
  'commitMessage',
  'commitMessageSha256',
  'commitTitle',
  'commitTitleSha256',
  'issueNumber',
  'mergeMethod',
  'mergeSha',
  'prNumber',
  'providerAction',
  'receiptCommentId',
  'repository',
  'sourceSha',
];

function verificationError(category, cause) {
  return new TypeError(
    `delivery-verification:${category}`,
    cause === undefined ? undefined : { cause }
  );
}

function evidenceError(category) {
  return new TypeError(`delivery-real-pr-evidence:${category}`);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, keys) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function isCanonicalInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function mergeCommitSha(pullRequest) {
  if (typeof pullRequest?.mergeCommitSha === 'string') return pullRequest.mergeCommitSha;
  if (typeof pullRequest?.mergeCommit?.oid === 'string') return pullRequest.mergeCommit.oid;
  return null;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertAuthorityShas(input, intent) {
  const authorities = [
    input.pullRequest?.headRefOid,
    intent?.expectedHeadSha,
    input.acceptedSha,
    input.testReceiptSha,
    input.acceptedReviewSha,
  ];
  if (authorities.some((sha) => typeof sha !== 'string' || !SHA_RE.test(sha))) {
    throw verificationError('authority-sha');
  }
  if (new Set(authorities).size !== 1) throw verificationError('authority-sha-mismatch');
  if (typeof input.localHeadSha !== 'string' || !SHA_RE.test(input.localHeadSha)) {
    throw verificationError('authority-sha');
  }
  if (input.localHeadSha !== input.acceptedSha && input.recovery !== true) {
    throw verificationError('authority-sha-mismatch');
  }
}

function assertMergedPullRequest(pullRequest, intent) {
  if (!isPlainObject(pullRequest) || !isPlainObject(intent)) {
    throw verificationError('input');
  }
  const merged =
    pullRequest.merged === true || String(pullRequest.state || '').toUpperCase() === 'MERGED';
  if (!merged) throw verificationError('pull-request-not-merged');
  if (pullRequest.number !== intent.prNumber) throw verificationError('pr-number');
  if (pullRequest.baseRefName !== intent.baseRef) throw verificationError('base-ref');
  if (pullRequest.headRefOid !== intent.expectedHeadSha) {
    throw verificationError('expected-head-sha');
  }
  let mergeMethodObservation = null;
  if (pullRequest.mergeMethod !== null && pullRequest.mergeMethod !== undefined) {
    if (
      typeof pullRequest.mergeMethod !== 'string' ||
      !MERGE_METHODS.has(pullRequest.mergeMethod)
    ) {
      throw verificationError('merge-method-observation');
    }
    mergeMethodObservation = pullRequest.mergeMethod;
    if (mergeMethodObservation !== intent.mergeMethod) {
      throw verificationError('merge-method');
    }
  }
  const sha = mergeCommitSha(pullRequest);
  if (typeof sha !== 'string' || !SHA_RE.test(sha)) {
    throw verificationError('merge-commit-sha');
  }
  if (!isCanonicalInstant(pullRequest.mergedAt)) throw verificationError('merged-at');
  return { mergeCommitSha: sha, mergedAt: pullRequest.mergedAt, mergeMethodObservation };
}

function classifyMergeMethod(inspection, expectedHeadSha, mergeSha) {
  const inspectionKeys = Object.keys(inspection || {}).sort();
  const baseKeys = ['commitMessage', 'commitTitle', 'parents'];
  const treeKeys = ['commitMessage', 'commitTitle', 'parents', 'tree'];
  if (
    (!hasExactKeys(inspection, baseKeys) && !hasExactKeys(inspection, treeKeys)) ||
    !Array.isArray(inspection.parents) ||
    inspection.parents.some((parent) => typeof parent !== 'string' || !SHA_RE.test(parent)) ||
    typeof inspection.commitTitle !== 'string' ||
    typeof inspection.commitMessage !== 'string' ||
    (inspectionKeys.includes('tree') && !SHA_RE.test(inspection.tree))
  ) {
    throw verificationError('merge-method-evidence');
  }
  if (inspection.parents.length === 2 && inspection.parents[1] === expectedHeadSha) {
    return 'merge';
  }
  if (inspection.parents.length === 1 && mergeSha !== expectedHeadSha) {
    return 'rewritten-one-parent';
  }
  return 'unknown';
}

function inspectedCommitMessage(inspection) {
  return inspection.commitMessage.length > 0
    ? `${inspection.commitTitle}\n\n${inspection.commitMessage}`
    : inspection.commitTitle;
}

function provesSingleSourceSquash({ pullRequest, inspection, expectedHeadSha, mergeSha }) {
  const evidence = pullRequest?.sourceCommitEvidence;
  const inventory = pullRequest?.sourceCommits;
  if (
    pullRequest?.sourceCommitsComplete !== true ||
    pullRequest?.sourceCommitsHeadSha !== expectedHeadSha ||
    !Array.isArray(inventory) ||
    inventory.length !== 1 ||
    inventory[0]?.oid !== expectedHeadSha ||
    !Array.isArray(evidence) ||
    evidence.length !== 1 ||
    !hasExactKeys(evidence[0], ['message', 'oid', 'parents', 'tree'])
  ) {
    return false;
  }
  const source = evidence[0];
  return (
    source.oid === expectedHeadSha &&
    mergeSha !== expectedHeadSha &&
    typeof source.message === 'string' &&
    source.message.length > 0 &&
    Array.isArray(source.parents) &&
    source.parents.length === 1 &&
    SHA_RE.test(source.parents[0]) &&
    SHA_RE.test(source.tree) &&
    Array.isArray(inspection.parents) &&
    inspection.parents.length === 1 &&
    source.parents[0] === inspection.parents[0] &&
    source.tree === inspection.tree &&
    source.message !== inspectedCommitMessage(inspection)
  );
}

// #1490 — prove an externally performed MULTI-COMMIT squash.
//
// `provesSingleSourceSquash` only proves a squash when the pull request held
// exactly one non-merge source commit, so every multi-commit pull request merged
// through the GitHub UI collapsed to `unknown` and could never obtain a receipt.
// GitHub exposes no authoritative historical merge method (no field on the merged
// pull request records it), so the method must be proven from topology.
//
// Conjunctive — every condition must hold, and missing or malformed evidence
// returns false rather than throwing:
//
//   1. the merge commit has exactly one parent;
//   2. the merge SHA differs from the accepted SHA;
//   3. the merge tree equals the accepted head's tree;
//   4. the merge parent is an ancestor of the accepted SHA;
//   5. the source inventory is complete, non-empty, and bound to the accepted SHA.
//
// Condition 4 is what separates squash from rebase. A rebase replays each source
// commit onto the base, so the merge SHA is the LAST replayed commit and its
// parent is a freshly created rewrite that never existed on the source branch —
// it cannot be an ancestor of the accepted head. Condition 1 excludes an ordinary
// merge, condition 2 a fast-forward, and condition 3 any squash that dropped or
// reverted accepted content (a revert necessarily moves the tree).
//
// Individually insufficient and deliberately never relied on alone: repository
// merge settings, commit title/message, one-parent topology, tree equality, and
// accepted-SHA reachability.
//
// Known imprecision: a SINGLE-commit rebase is topologically identical to a
// single-commit squash — one commit, same tree, parent is the base tip — and no
// available evidence separates them. The outcomes are semantically identical, so
// such a merge is reported as a squash.
async function provesMultiSourceSquash({
  pullRequest,
  inspection,
  expectedHeadSha,
  mergeSha,
  isAncestor,
}) {
  const inventory = pullRequest?.sourceCommits;
  const evidence = pullRequest?.sourceCommitEvidence;
  if (
    pullRequest?.sourceCommitsComplete !== true ||
    pullRequest?.sourceCommitsHeadSha !== expectedHeadSha ||
    !Array.isArray(inventory) ||
    // Strictly MULTI-source. A single-commit pull request stays the exclusive
    // domain of `provesSingleSourceSquash`, whose stricter source-parent and
    // source-message invariants are correct there and must not be relaxed: for a
    // one-commit PR the source commit's parent IS the base tip, so a mismatch is
    // real evidence of tampering. Those invariants do NOT generalize — in a
    // multi-commit PR the head's parent is the previous branch commit and
    // legitimately differs from the merge parent — which is why this proof
    // substitutes tree equality plus parent ancestry instead.
    inventory.length < 2 ||
    !Array.isArray(evidence) ||
    evidence.length < 2 ||
    mergeSha === expectedHeadSha ||
    !Array.isArray(inspection?.parents) ||
    inspection.parents.length !== 1 ||
    !SHA_RE.test(inspection.parents[0]) ||
    typeof inspection.tree !== 'string' ||
    !SHA_RE.test(inspection.tree)
  ) {
    return false;
  }
  // The accepted head's tree comes from the source evidence entry the inventory
  // is already bound to; no additional fetch is required.
  const acceptedSource = evidence.find((entry) => entry?.oid === expectedHeadSha);
  if (!isPlainObject(acceptedSource) || !SHA_RE.test(acceptedSource.tree || '')) return false;
  if (acceptedSource.tree !== inspection.tree) return false;
  let ancestor;
  try {
    ancestor = await isAncestor({ ancestor: inspection.parents[0], descendant: expectedHeadSha });
  } catch {
    return false;
  }
  return ancestor === true;
}

function provesExactLegacyEscapedAttribution({ intent, inspection, provenSingleSourceSquash }) {
  const topLevelToken = `#${intent.issueNumber}`;
  return (
    provenSingleSourceSquash === true &&
    intent.provider === 'external' &&
    intent.attributionTokens.length === 1 &&
    intent.attributionTokens[0] === topLevelToken &&
    inspection.commitTitle === `[${topLevelToken}] Governed PR delivery` &&
    inspection.commitMessage ===
      `Source: ${intent.expectedHeadSha}\\nHosted fast CI passed.\\n` +
        'Local governed sandbox including slow tests passed.'
  );
}

// #1490 — semantic attribution for an externally merged multi-source squash that
// carries GitHub's DEFAULT squash body.
//
// The canonical `Attribution:` trailer is emitted by the governed provider action
// as part of its authorized-byte contract. External recovery runs with
// `requireAuthorizedBytes: false` and rebuilds the intent from inspected bytes, so
// a merge performed in the GitHub UI can never carry that trailer.
//
// This proof does NOT accept "the title leads with the top-level token" on its own,
// which would be safe only for a singleton token set and would silently weaken
// multi-issue delivery. It requires the merge title to lead with the exact
// top-level token AND the token SET observed across the complete inspected title
// and body to equal `intent.attributionTokens` exactly. Repeated occurrences are
// fine; a missing authorized token or an extra unauthorized one refuses.
//
// Tokens are read with the repository's shared attribution primitives
// (`commit-attribution-format.mjs`) rather than a private regex, so this stays
// bound to the documented `\[#(\d+)\]` message-based attribution contract. A
// parenthesised `(#1489)` pull-request reference is not a bracket token and is
// therefore correctly ignored.
function provesDefaultSquashBodyAttribution({ intent, inspection }) {
  const leading = ISSUE_PREFIX_RE.exec(inspection.commitTitle || '');
  if (leading === null || leading[1] !== String(intent.issueNumber)) return false;
  const observed = new Set(
    [...`${inspection.commitTitle}\n${inspection.commitMessage}`.matchAll(ISSUE_ID_GLOBAL_RE)].map(
      (match) => `#${match[1]}`
    )
  );
  const expected = new Set(intent.attributionTokens);
  expected.add(`#${intent.issueNumber}`);
  if (observed.size !== expected.size) return false;
  for (const token of expected) {
    if (!observed.has(token)) return false;
  }
  return true;
}

function assertMergeCommitAttribution(inspection, intent, provenSingleSourceSquash, options = {}) {
  const topLevelToken = `#${intent.issueNumber}`;
  const messageTokens = [
    topLevelToken,
    ...intent.attributionTokens.filter((token) => token !== topLevelToken),
  ];
  const expectedLine = `Attribution: ${messageTokens.map((token) => `[${token}]`).join(' ')}`;
  const lines = inspection.commitMessage.split('\n');
  const attributionLines = lines.filter((line) => line.startsWith('Attribution:'));
  if (attributionLines.length === 1 && lines.at(-1) === expectedLine) return;
  if (provesExactLegacyEscapedAttribution({ intent, inspection, provenSingleSourceSquash })) return;
  // #1490 — the default-body proof applies ONLY when no `Attribution:` line exists
  // at all. A malformed, duplicated, reordered, or nonterminal trailer is a body
  // that claims canonical attribution and must be judged by the canonical rule
  // alone; it must never fall through to the semantic proof.
  if (
    attributionLines.length === 0 &&
    options.provenMultiSourceSquash === true &&
    intent.provider === 'external' &&
    provesDefaultSquashBodyAttribution({ intent, inspection })
  ) {
    return;
  }
  throw verificationError('attribution');
}

function assertVerificationFunctions(input) {
  if (
    typeof input.fetchOriginTrunk !== 'function' ||
    typeof input.isAncestor !== 'function' ||
    typeof input.inspectMergeCommit !== 'function' ||
    typeof input.attributingCommits !== 'function'
  ) {
    throw verificationError('input');
  }
}

async function verifyLiveDelivery(input, intent, { requireAuthorizedBytes, recovery }) {
  assertAuthorityShas(input, intent);
  const { pullRequest } = input;
  const merged = assertMergedPullRequest(pullRequest, intent);
  if (intent.provider !== 'external') {
    if (!isCanonicalInstant(input.intentCreatedAt)) throw verificationError('intent-created-at');
    if (Date.parse(merged.mergedAt) < Date.parse(input.intentCreatedAt)) {
      throw verificationError('merge-before-intent');
    }
  }

  try {
    await input.fetchOriginTrunk({ remote: 'origin', branch: intent.baseRef });
  } catch (error) {
    throw verificationError('fetch-origin-trunk', error);
  }
  const verifiedTrunkRef = `origin/${intent.baseRef}`;
  let reachable;
  try {
    reachable = await input.isAncestor({
      ancestor: merged.mergeCommitSha,
      descendant: verifiedTrunkRef,
    });
  } catch (error) {
    throw verificationError('trunk-reachability', error);
  }
  if (reachable !== true) throw verificationError('trunk-reachability');

  let inspection;
  try {
    inspection = await input.inspectMergeCommit({
      mergeCommitSha: merged.mergeCommitSha,
      expectedHeadSha: intent.expectedHeadSha,
      ...(requireAuthorizedBytes
        ? {
            authorizedCommitTitle: intent.commitTitle,
            authorizedCommitMessage: intent.commitMessage,
          }
        : {}),
    });
  } catch (error) {
    throw verificationError('merge-method-evidence', error);
  }
  let observedMergeMethod = classifyMergeMethod(
    inspection,
    intent.expectedHeadSha,
    merged.mergeCommitSha
  );
  const provenSingleSourceSquash =
    observedMergeMethod === 'rewritten-one-parent' &&
    intent.provider === 'external' &&
    intent.mergeMethod === 'squash' &&
    provesSingleSourceSquash({
      pullRequest,
      inspection,
      expectedHeadSha: intent.expectedHeadSha,
      mergeSha: merged.mergeCommitSha,
    });
  // #1490 — only consulted when every cheaper path has already declined, so the
  // existing single-source, authorized-bytes, and observation paths keep exactly
  // their present behavior.
  const provenMultiSourceSquash =
    observedMergeMethod === 'rewritten-one-parent' &&
    provenSingleSourceSquash === false &&
    intent.provider === 'external' &&
    intent.mergeMethod === 'squash' &&
    (await provesMultiSourceSquash({
      pullRequest,
      inspection,
      expectedHeadSha: intent.expectedHeadSha,
      mergeSha: merged.mergeCommitSha,
      isAncestor: input.isAncestor,
    }));
  if (observedMergeMethod === 'rewritten-one-parent') {
    observedMergeMethod =
      (requireAuthorizedBytes && intent.mergeMethod === 'squash') ||
      (!requireAuthorizedBytes && merged.mergeMethodObservation === 'squash') ||
      provenSingleSourceSquash ||
      provenMultiSourceSquash
        ? 'squash'
        : 'unknown';
  }
  if (observedMergeMethod === 'unknown') throw verificationError('merge-method-unknown');
  if (observedMergeMethod !== intent.mergeMethod) throw verificationError('merge-method');
  if (
    requireAuthorizedBytes &&
    (inspection.commitTitle !== intent.commitTitle ||
      inspection.commitMessage !== intent.commitMessage)
  ) {
    throw verificationError('merge-commit-bytes');
  }

  const verifiedIntent = requireAuthorizedBytes
    ? intent
    : buildDeliveryIntent({
        ...intent,
        commitTitle: inspection.commitTitle,
        commitMessage: inspection.commitMessage,
      });
  assertMergeCommitAttribution(inspection, verifiedIntent, provenSingleSourceSquash, {
    provenMultiSourceSquash,
  });

  if (typeof pullRequest.headRefDeleted !== 'boolean') {
    throw verificationError('branch-disposition');
  }

  return deepFreeze({
    intent: verifiedIntent,
    receiptInput: {
      intentId: verifiedIntent.intentId,
      issueNumber: verifiedIntent.issueNumber,
      prNumber: verifiedIntent.prNumber,
      expectedHeadSha: verifiedIntent.expectedHeadSha,
      mergeCommitSha: merged.mergeCommitSha,
      baseRef: verifiedIntent.baseRef,
      mergeMethod: verifiedIntent.mergeMethod,
      verifiedTrunkRef,
      provider: verifiedIntent.provider,
      sessionId: verifiedIntent.sessionId,
      verifiedAt: merged.mergedAt,
    },
    recovery,
    branchDisposition: pullRequest.headRefDeleted ? 'deleted' : 'retained',
  });
}

export async function verifyDeliveredPullRequest(input = {}) {
  if (!hasExactKeys(input, VERIFICATION_INPUT_KEYS)) throw verificationError('input-keys');
  assertVerificationFunctions(input);
  if (typeof input.recovery !== 'boolean') throw verificationError('input');
  return verifyLiveDelivery(input, input.intent, {
    requireAuthorizedBytes: true,
    recovery: input.recovery,
  });
}

export async function verifyExternalDeliveredPullRequest(input = {}) {
  if (!hasExactKeys(input, EXTERNAL_VERIFICATION_INPUT_KEYS)) {
    throw verificationError('input-keys');
  }
  assertVerificationFunctions(input);
  if (
    !hasExactKeys(input.intentInput, EXTERNAL_INTENT_INPUT_KEYS) ||
    input.intentInput.provider !== 'external' ||
    input.intentInput.supersedesIntentId !== null
  ) {
    throw verificationError('input');
  }
  return verifyLiveDelivery(input, input.intentInput, {
    requireAuthorizedBytes: false,
    recovery: true,
  });
}

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

export function buildDeliveryRealPrEvidence(input = {}) {
  if (!hasExactKeys(input, EVIDENCE_INPUT_KEYS)) throw evidenceError('input-keys');
  if (!REPOSITORY_RE.test(input.repository)) throw evidenceError('repository');
  if (!Number.isSafeInteger(input.issueNumber) || input.issueNumber <= 0) {
    throw evidenceError('issue-number');
  }
  if (!Number.isSafeInteger(input.prNumber) || input.prNumber <= 0) {
    throw evidenceError('pr-number');
  }
  if (!SHA_RE.test(input.sourceSha)) throw evidenceError('source-sha');
  if (!SHA_RE.test(input.mergeSha)) throw evidenceError('merge-sha');
  if (!MERGE_METHODS.has(input.mergeMethod)) throw evidenceError('merge-method');
  if (typeof input.commitTitle !== 'string' || input.commitTitle.length === 0) {
    throw evidenceError('commit-title');
  }
  if (typeof input.commitMessage !== 'string' || input.commitMessage.length === 0) {
    throw evidenceError('commit-message');
  }
  if (
    !HASH_RE.test(input.commitTitleSha256) ||
    sha256(input.commitTitle) !== input.commitTitleSha256
  ) {
    throw evidenceError('commit-title-hash');
  }
  if (
    !HASH_RE.test(input.commitMessageSha256) ||
    sha256(input.commitMessage) !== input.commitMessageSha256
  ) {
    throw evidenceError('commit-message-hash');
  }
  try {
    validateProviderAction(input.providerAction);
  } catch (error) {
    throw evidenceError('provider-action', error);
  }
  if (
    input.providerAction.repository !== input.repository ||
    input.providerAction.issueNumber !== input.issueNumber ||
    input.providerAction.prNumber !== input.prNumber ||
    input.providerAction.expectedHeadSha !== input.sourceSha ||
    input.providerAction.mergeMethod !== input.mergeMethod ||
    input.providerAction.commitTitle !== input.commitTitle ||
    input.providerAction.commitMessage !== input.commitMessage
  ) {
    throw evidenceError('provider-action-correlation');
  }
  if (typeof input.receiptCommentId !== 'string' || input.receiptCommentId.length === 0) {
    throw evidenceError('receipt-comment-id');
  }
  if (!validHttpsUrl(input.ciRunUrl)) throw evidenceError('ci-run-url');
  if (!['retained', 'deleted'].includes(input.branchDisposition)) {
    throw evidenceError('branch-disposition');
  }
  if (input.closeResult !== 'closed') throw evidenceError('close-result');
  return deepFreeze(
    structuredClone({
      schema: 'aitm.delivery-real-pr-evidence/v1',
      ...input,
    })
  );
}
