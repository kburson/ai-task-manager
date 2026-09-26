// @story #1787 #1797
import { createHash } from 'node:crypto';
import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import { renderDeliveryIntentComment, renderDeliveryReceiptComment } from './delivery-records.mjs';
import { validateDeliveryWaiverBurn } from './delivery-waiver-journal.mjs';
import { validateWorkflowExceptionEnvelope } from './workflow-policy/exception-record.mjs';

const digest = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const same = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
const AUTHORIZED_FIELDS = [
  'issueNumber',
  'repository',
  'prNumber',
  'expectedHeadSha',
  'attributionTokens',
  'baseRef',
  'commitMessage',
  'commitMessageSha256',
  'commitTitle',
  'commitTitleSha256',
  'headRef',
  'mergeMethod',
];
const refuse = (reason) => {
  throw new TypeError(`delivery-waiver-evidence:${reason}`);
};
const freeze = (value) => {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
};

/** Pure historical consistency check. No current grant lookup or current clock is consulted. */
export function validatePinnedWaiverEvidence({
  intent,
  receipt,
  grant,
  burn,
  originalIntent,
} = {}) {
  // Task 9/10 must validate the historical grant/revocation chain through
  // burn.authorizedAt. A single pinned grant cannot reveal a separate revocation.
  const original = originalIntent?.record;
  try {
    renderDeliveryIntentComment(original);
    renderDeliveryIntentComment(intent);
    renderDeliveryReceiptComment(receipt);
    validateWorkflowExceptionEnvelope(grant);
    validateDeliveryWaiverBurn(burn);
  } catch {
    refuse('invalid-record');
  }
  const scope = grant.payload.deliveryScope;
  if (
    typeof originalIntent?.createdAt !== 'string' ||
    Number.isNaN(Date.parse(originalIntent.createdAt)) ||
    new Date(originalIntent.createdAt).toISOString() !== originalIntent.createdAt ||
    original.schema !== 'aitm.delivery-intent/v1' ||
    intent.schema !== 'aitm.delivery-intent/v3' ||
    receipt.schema !== 'aitm.delivery-receipt/v4' ||
    original.intentId !== intent.originalIntentId ||
    intent.supersedesIntentId !== original.intentId ||
    intent.originalIntentDigest !== digest(canonicalRecordJson(original)) ||
    intent.originalIntentCreatedAt !== originalIntent.createdAt ||
    AUTHORIZED_FIELDS.some((key) => !same(intent[key], original[key])) ||
    receipt.mergeMethod !== intent.mergeMethod ||
    receipt.provider !== intent.provider ||
    receipt.sessionId !== intent.sessionId ||
    grant.recordId !== intent.waiverRecordId ||
    !same(grant, intent.waiverGrant) ||
    !same(grant, receipt.waiverGrant) ||
    grant.payload.status !== 'active' ||
    scope.repository !== original.repository ||
    scope.issue !== original.issueNumber ||
    scope.pullRequest !== original.prNumber ||
    scope.acceptedHeadSha !== original.expectedHeadSha ||
    scope.baseRef !== original.baseRef ||
    scope.resolvedTrunkRef !== receipt.verifiedTrunkRef ||
    scope.requirementId !== intent.waivedRequirementId ||
    scope.deliveryOperationId !== intent.deliveryOperationId ||
    burn.authorizedAt < intent.originalIntentCreatedAt ||
    burn.authorizedAt < grant.createdAt ||
    burn.authorizedAt >= grant.payload.expiresAt ||
    !same(burn, receipt.burn) ||
    receipt.burnDigest !== digest(canonicalRecordJson(burn)) ||
    intent.intentId !== receipt.intentId ||
    burn.intentId !== intent.intentId ||
    burn.grantDigest !== digest(canonicalRecordJson(grant))
  )
    refuse('pinned-correlation');
  return freeze(structuredClone({ intent, receipt, grant, burn, originalIntent }));
}

/** Form a terminal input only from a confirmed immutable burn and independently verified facts. */
export function buildWaivedReceiptInput({ verifiedFacts, intent, grant, burn, burnOid } = {}) {
  // Task 9/10 callers must obtain burnOid from the confirmed journal operation's
  // first burned event, then compare it on recovery. This pure module cannot
  // authenticate an OID against a remote ref or the later moving journal tip.
  // Callers must also prove the grant was not revoked before authorization.
  try {
    renderDeliveryIntentComment(intent);
    validateWorkflowExceptionEnvelope(grant);
    validateDeliveryWaiverBurn(burn);
  } catch {
    refuse('invalid-evidence');
  }
  const base = verifiedFacts?.baseReceiptInput;
  if (
    intent.schema !== 'aitm.delivery-intent/v3' ||
    typeof burnOid !== 'string' ||
    !/^[0-9a-f]{40}$/.test(burnOid) ||
    !base ||
    typeof base !== 'object' ||
    base.intentId !== intent.intentId ||
    base.issueNumber !== intent.issueNumber ||
    base.prNumber !== intent.prNumber ||
    base.expectedHeadSha !== intent.expectedHeadSha ||
    base.baseRef !== intent.baseRef ||
    base.mergeMethod !== intent.mergeMethod ||
    base.verifiedTrunkRef !== `origin/${intent.baseRef}` ||
    base.provider !== intent.provider ||
    base.sessionId !== intent.sessionId ||
    base.mergeCommitSha !== burn.mergeCommitSha ||
    verifiedFacts.waivedRequirementId !== intent.waivedRequirementId ||
    verifiedFacts.observedFailureCategory !== intent.observedFailureCategory ||
    verifiedFacts.providerMergeMethod !== intent.providerMergeMethod ||
    verifiedFacts.observedMergeMethod !== intent.observedMergeMethod ||
    !same(grant, intent.waiverGrant) ||
    burn.intentId !== intent.intentId ||
    burn.repository !== intent.repository ||
    burn.issue !== intent.issueNumber ||
    burn.deliveryOperationId !== intent.deliveryOperationId ||
    burn.waiverRecordId !== intent.waiverRecordId ||
    burn.waiverRevision !== intent.waiverRevision ||
    burn.waiverScopeDigest !== intent.waiverScopeDigest ||
    burn.waiverReasonDigest !== intent.waiverReasonDigest ||
    burn.acceptedHeadSha !== intent.expectedHeadSha ||
    burn.grantDigest !== digest(canonicalRecordJson(grant)) ||
    burn.authorizedAt < intent.originalIntentCreatedAt ||
    burn.authorizedAt < grant.createdAt ||
    burn.authorizedAt >= grant.payload.expiresAt
  )
    refuse('confirmed-burn-mismatch');
  const authorization = grant.payload.approvalEvidence;
  return freeze(
    structuredClone({
      ...base,
      deliveryDisposition: intent.deliveryDisposition,
      waivedRequirementId: intent.waivedRequirementId,
      waiverRecordId: intent.waiverRecordId,
      waiverRevision: intent.waiverRevision,
      deliveryOperationId: intent.deliveryOperationId,
      waiverReasonDigest: intent.waiverReasonDigest,
      waiverScopeDigest: intent.waiverScopeDigest,
      observedFailureCategory: intent.observedFailureCategory,
      waiverGrant: grant,
      providerMergeMethod: intent.providerMergeMethod,
      observedMergeMethod: intent.observedMergeMethod,
      burn,
      burnDigest: digest(canonicalRecordJson(burn)),
      burnOid,
      authorityReference: authorization.reference,
      authorizingPrincipal: authorization.principal,
      recordingActor: authorization.recordingActor,
      humanReason: grant.payload.reason,
    })
  );
}
