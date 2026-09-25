// @story #1787 #1799
// The journal owns publication and consumption for an already merged, governed PR.
import { createHash } from 'node:crypto';

import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import { parseAitmRecord } from './github-records/record-envelope.mjs';
import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
  renderDeliveryIntentComment,
  renderDeliveryReceiptComment,
} from './delivery-records.mjs';
import {
  ensureDeliveryWaiverBurn,
  ensureWaiverIntent,
  publishWaivedReceipt,
} from './delivery-waiver-consumption.mjs';
import {
  buildWaivedReceiptInput,
  validatePinnedWaiverEvidence,
} from './delivery-waiver-evidence.mjs';
import {
  DeliveryWaiverAuthorityError,
  resolveDeliveryWaiver,
  verifyStoredDeliveryWaiverAuthority,
} from './workflow-policy/delivery-waiver-authority.mjs';
import { buildDeliveryScope } from './workflow-policy/delivery-scope.mjs';
import { computeScopeIdentity } from './workflow-policy/scope-identity.mjs';
import { partitionWorkflowExceptions } from './workflow-policy/exception-partitions.mjs';
import { resolveDeliveryExceptionChain } from './workflow-policy/exception-record.mjs';

const digest = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const equal = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
const refusal = (category) => new DeliveryWaiverAuthorityError(category);

function storedRecords(comments, repository, issue) {
  if (!Array.isArray(comments)) throw refusal('delivery-waiver-ambiguity');
  return comments
    .filter(({ body }) => typeof body === 'string' && /<!--\s*aitm-record/i.test(body))
    .map((comment) => {
      try {
        return {
          ...parseAitmRecord({
            commentNodeId: String(comment.id),
            body: comment.body,
            expectedRepository: repository,
            expectedIssue: issue,
          }),
          body: comment.body,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
        };
      } catch {
        throw refusal('delivery-waiver-ambiguity');
      }
    });
}

function candidateScopes(
  records,
  { repository, issueNumber, prNumber, acceptedSha, baseRef, requirementId }
) {
  try {
    partitionWorkflowExceptions({ records, repository, issue: issueNumber });
  } catch {
    throw refusal('delivery-waiver-ambiguity');
  }
  const matches = new Map();
  for (const { envelope } of records) {
    const scope = envelope?.payload?.deliveryScope;
    if (
      scope?.exceptionKind !== 'delivery.invariant-waiver' ||
      scope.repository !== repository ||
      scope.issue !== issueNumber ||
      scope.pullRequest !== prNumber ||
      scope.acceptedHeadSha !== acceptedSha ||
      scope.baseRef !== baseRef ||
      scope.resolvedTrunkRef !== `origin/${baseRef}` ||
      scope.requirementId !== requirementId
    )
      continue;
    matches.set(buildDeliveryScope(scope).partitionKey, scope);
  }
  return [...matches.values()];
}

async function currentWaiver({ records, scope, issue, context, deps }) {
  const result = await (deps.resolveDeliveryWaiver ?? resolveDeliveryWaiver)({
    records,
    scope,
    scopeIdentity: computeScopeIdentity({
      repository: context.repository,
      issue: context.issueNumber,
      body: issue.body,
    }),
    now: deps.now(),
    runtime: { resolveTranscriptPath: deps.resolveTranscriptPath },
  });
  if (result.outcome !== 'waived') throw refusal('delivery-waiver-authority');
  return result;
}

/** Authenticate the full stored chain as it stood at the immutable burn time. */
export async function verifyHistoricalDeliveryWaiverAuthority({
  records,
  grant,
  burn,
  repository,
  issue,
  runtime,
} = {}) {
  try {
    partitionWorkflowExceptions({
      records,
      repository,
      issue,
    });
    const prefix = records.filter((record) => record.createdAt <= burn.authorizedAt);
    for (const record of prefix) {
      if (record.envelope?.payload?.scopeKind === 'delivery') {
        if (record.envelope.createdAt > record.createdAt || record.createdAt > burn.authorizedAt)
          throw new Error('timestamp');
        await (runtime.verifyStoredDeliveryWaiverAuthority ?? verifyStoredDeliveryWaiverAuthority)(
          record.envelope,
          { resolveTranscriptPath: runtime.resolveTranscriptPath }
        );
      }
    }
    const chain = resolveDeliveryExceptionChain({
      records: prefix,
      partitionKey: buildDeliveryScope(grant.payload.deliveryScope).partitionKey,
      repository,
      issue,
      scopeIdentity: grant.payload.scopeIdentity,
      now: burn.authorizedAt,
    });
    const pinned = prefix.find(({ envelope }) => envelope?.recordId === grant.recordId);
    if (
      chain.status !== 'active' ||
      chain.head.recordId !== grant.recordId ||
      chain.head.revision !== grant.payload.revision ||
      !equal(pinned?.envelope, grant)
    )
      throw new Error('chain');
  } catch (error) {
    if (error instanceof DeliveryWaiverAuthorityError) throw error;
    throw refusal('delivery-waiver-burn-mismatch');
  }
  return {
    outcome: 'waived',
    grant,
    waiverScopeDigest: grant.payload.waiverScopeDigest,
    waiverReasonDigest: digest(grant.payload.reason),
  };
}

async function historicalWaiver({ records, grant, burn, context, deps }) {
  return verifyHistoricalDeliveryWaiverAuthority({
    records,
    grant,
    burn,
    repository: context.repository,
    issue: context.issueNumber,
    runtime: {
      resolveTranscriptPath: deps.resolveTranscriptPath,
      verifyStoredDeliveryWaiverAuthority: deps.verifyStoredDeliveryWaiverAuthority,
    },
  });
}

function intentCandidate(original, intent, context) {
  const intentBody = renderDeliveryIntentComment(intent);
  return {
    repository: context.repository,
    issue: context.issueNumber,
    deliveryOperationId: intent.deliveryOperationId,
    originalIntentId: original.record.intentId,
    originalIntentDigest: digest(canonicalRecordJson(original.record)),
    intentId: intent.intentId,
    intentBody,
    intentDigest: digest(intentBody),
  };
}

function successor(original, waiver, observations, newId) {
  const source = original.record;
  const facts = observations.verifiedFacts;
  const {
    schema: _schema,
    state: _state,
    commitTitleSha256: _titleHash,
    commitMessageSha256: _messageHash,
    ...authorized
  } = source;
  return buildDeliveryIntent({
    ...authorized,
    intentId: newId,
    supersedesIntentId: source.intentId,
    deliveryDisposition: 'waived',
    waivedRequirementId: facts.waivedRequirementId,
    waiverRecordId: waiver.grant.recordId,
    waiverRevision: waiver.grant.payload.revision,
    deliveryOperationId: waiver.grant.payload.deliveryScope.deliveryOperationId,
    waiverReasonDigest: waiver.waiverReasonDigest,
    waiverScopeDigest: waiver.waiverScopeDigest,
    observedFailureCategory: facts.observedFailureCategory,
    waiverGrant: waiver.grant,
    providerMergeMethod: facts.providerMergeMethod,
    observedMergeMethod: facts.observedMergeMethod,
    originalIntentId: source.intentId,
    originalIntentCreatedAt: original.createdAt,
    originalIntentDigest: digest(canonicalRecordJson(source)),
  });
}

/** Complete an exact generic waiver without reissuing the provider merge. */
export async function runDeliveryWaiverTransaction({
  context,
  originalIntent,
  records,
  deps,
} = {}) {
  if (
    !context ||
    !originalIntent?.record ||
    !deps?.readFresh ||
    !deps?.verifyWaived ||
    !deps?.comments
  ) {
    throw refusal('delivery-waiver-authority');
  }
  const issue = context.issueNumber;
  const repository = context.repository;
  const runId = deps.createRunId();
  let live = context.liveIntent;
  let receipt = context.matchingReceipt?.record ?? null;
  let comments = records;
  let workflow = storedRecords(comments, repository, issue);
  const journal = deps.journal;
  let operation = null;
  let waiver;
  let observations;
  if (live?.record?.schema === 'aitm.delivery-intent/v3') {
    if (!journal) throw refusal('delivery-waiver-ambiguity');
    const snapshots = await journal.read();
    operation = snapshots.operations.get(live.record.deliveryOperationId);
    if (
      !operation ||
      operation.intentPublication.intentId !== live.record.intentId ||
      snapshots.originalIntentOwners.get(originalIntent.record.intentId) !==
        live.record.deliveryOperationId
    ) {
      throw refusal('delivery-waiver-burn-mismatch');
    }
    if (operation.burn) {
      waiver = await historicalWaiver({
        records: workflow,
        grant: live.record.waiverGrant,
        burn: operation.burn,
        context,
        deps,
      });
    } else {
      const fresh = await deps.readFresh(live);
      comments = fresh.comments;
      workflow = storedRecords(comments, repository, issue);
      waiver = await currentWaiver({
        records: workflow,
        scope: live.record.waiverGrant.payload.deliveryScope,
        issue: fresh.issue,
        context,
        deps,
      });
      if (!equal(waiver.grant, live.record.waiverGrant)) throw refusal('delivery-waiver-replay');
    }
  } else {
    const scopes = candidateScopes(workflow, {
      ...context,
      acceptedSha: originalIntent.record.expectedHeadSha,
      baseRef: originalIntent.record.baseRef,
      requirementId: context.failure.requirementId,
    });
    if (scopes.length === 0) throw context.failure;
    if (scopes.length !== 1) throw refusal('delivery-waiver-ambiguity');
    if (!journal || typeof deps.resolveTranscriptPath !== 'function')
      throw refusal('delivery-waiver-ambiguity');
    waiver = await currentWaiver({
      records: workflow,
      scope: scopes[0],
      issue: context.issue,
      context,
      deps,
    });
    observations = await deps.verifyWaived({
      intent: originalIntent.record,
      originalIntent,
      waiver,
      pullRequest: context.pullRequest,
    });
    const beforeReservation = await deps.readFresh(live, { allowScopeRefresh: true });
    const reservationRecords = storedRecords(beforeReservation.comments, repository, issue);
    const freshScopes = candidateScopes(reservationRecords, {
      ...context,
      acceptedSha: originalIntent.record.expectedHeadSha,
      baseRef: originalIntent.record.baseRef,
      requirementId: context.failure.requirementId,
    });
    if (freshScopes.length !== 1 || !equal(freshScopes[0], scopes[0])) {
      throw refusal('delivery-waiver-replay');
    }
    const reservationWaiver = await currentWaiver({
      records: reservationRecords,
      scope: freshScopes[0],
      issue: beforeReservation.issue,
      context,
      deps,
    });
    waiver = reservationWaiver;
    observations = await deps.verifyWaived({
      intent: originalIntent.record,
      originalIntent,
      waiver: reservationWaiver,
      pullRequest: beforeReservation.pullRequest,
    });
    live = { record: successor(originalIntent, waiver, observations, deps.createIntentId()) };
  }
  if (!journal) throw refusal('delivery-waiver-ambiguity');
  const intent = live.record;
  const candidate = intentCandidate(originalIntent, intent, context);
  await ensureWaiverIntent({ candidate, journal, comments: deps.comments, runId });
  const confirmed = await deps.readFresh(live);
  const observedReceipt = confirmed.projection.matchingReceipt?.record ?? null;
  if (
    !equal(confirmed.projection.liveIntent?.record, intent) ||
    (receipt !== null && !equal(observedReceipt, receipt)) ||
    (receipt === null &&
      observedReceipt !== null &&
      (observedReceipt.schema !== 'aitm.delivery-receipt/v4' ||
        observedReceipt.intentId !== intent.intentId ||
        observedReceipt.deliveryOperationId !== intent.deliveryOperationId))
  ) {
    throw refusal('delivery-waiver-replay');
  }
  receipt = observedReceipt;
  comments = confirmed.comments;
  workflow = storedRecords(comments, repository, issue);
  operation = (await journal.read()).operations.get(intent.deliveryOperationId);
  if (!operation || operation.intentPublication.intentId !== intent.intentId)
    throw refusal('delivery-waiver-burn-mismatch');
  if (receipt !== null && !operation.burn) throw refusal('delivery-waiver-burn-mismatch');
  let burnResult;
  if (operation.burn) {
    waiver = await historicalWaiver({
      records: workflow,
      grant: intent.waiverGrant,
      burn: operation.burn,
      context,
      deps,
    });
    burnResult = await ensureDeliveryWaiverBurn({
      candidate: operation.burn,
      journal,
      expectedBurnOid: operation.burnOid,
    });
    if (receipt !== null) {
      validatePinnedWaiverEvidence({
        intent,
        receipt,
        grant: waiver.grant,
        burn: burnResult.burn,
        originalIntent,
      });
      const pinned = await deps.verifyPinned({
        intent,
        originalIntent,
        grant: waiver.grant,
        burn: burnResult.burn,
        burnOid: burnResult.burnOid,
        receipt,
        pullRequest: confirmed.pullRequest,
      });
      if (!equal(buildDeliveryReceipt(pinned.receiptInput), receipt)) {
        throw refusal('delivery-waiver-burn-mismatch');
      }
      const receiptBody = renderDeliveryReceiptComment(receipt);
      await publishWaivedReceipt({
        burn: burnResult.burn,
        burnOid: burnResult.burnOid,
        receiptBody,
        receiptDigest: digest(receiptBody),
        journal,
        comments: deps.comments,
        runId,
      });
      return {
        status: 'already-delivered',
        mode: context.mode,
        intent,
        receipt,
        action: null,
        recovery: context.recovery,
        branchDisposition: pinned.branchDisposition,
      };
    }
    observations = await deps.verifyWaived({
      intent,
      originalIntent,
      waiver,
      pullRequest: confirmed.pullRequest,
    });
  } else {
    // Re-read and verify every live predicate inside the burn callback, after the
    // confirmed intent readback and immediately before the journal CAS.
    const authorizedAt = deps.now();
    const burn = {
      schema: 'aitm.delivery-waiver-consumption/v1',
      repository,
      issue,
      deliveryOperationId: intent.deliveryOperationId,
      waiverRecordId: intent.waiverRecordId,
      waiverRevision: intent.waiverRevision,
      waiverScopeDigest: intent.waiverScopeDigest,
      waiverReasonDigest: intent.waiverReasonDigest,
      acceptedHeadSha: intent.expectedHeadSha,
      intentId: intent.intentId,
      mergeCommitSha: context.pullRequest.mergeCommitSha ?? context.pullRequest.mergeCommit?.oid,
      authorizedAt,
      grantDigest: digest(canonicalRecordJson(intent.waiverGrant)),
    };
    burnResult = await ensureDeliveryWaiverBurn({
      candidate: burn,
      journal,
      verifyInitialBurn: async () => {
        const boundary = await deps.readFresh(live);
        const boundaryRecords = storedRecords(boundary.comments, repository, issue);
        const boundaryWaiver = await currentWaiver({
          records: boundaryRecords,
          scope: intent.waiverGrant.payload.deliveryScope,
          issue: boundary.issue,
          context,
          deps,
        });
        if (
          !equal(boundaryWaiver.grant, intent.waiverGrant) ||
          !equal(boundary.projection.liveIntent?.record, intent)
        )
          throw refusal('delivery-waiver-replay');
        const verification = await deps.verifyWaived({
          intent,
          originalIntent,
          waiver: boundaryWaiver,
          pullRequest: boundary.pullRequest,
        });
        observations = verification;
        waiver = boundaryWaiver;
        return { authorizedAt, waiver, verification };
      },
    });
    if (burnResult.status === 'existing') {
      waiver = await historicalWaiver({
        records: workflow,
        grant: intent.waiverGrant,
        burn: burnResult.burn,
        context,
        deps,
      });
      observations = await deps.verifyWaived({
        intent,
        originalIntent,
        waiver,
        pullRequest: confirmed.pullRequest,
      });
    }
  }
  const receiptInput = buildWaivedReceiptInput({
    verifiedFacts: observations.verifiedFacts,
    intent,
    grant: waiver.grant,
    burn: burnResult.burn,
    burnOid: burnResult.burnOid,
  });
  const expectedReceipt = buildDeliveryReceipt(receiptInput);
  if (receipt && !equal(receipt, expectedReceipt)) throw refusal('delivery-waiver-burn-mismatch');
  validatePinnedWaiverEvidence({
    intent,
    receipt: expectedReceipt,
    grant: waiver.grant,
    burn: burnResult.burn,
    originalIntent,
  });
  await deps.verifyPinned({
    intent,
    originalIntent,
    grant: waiver.grant,
    burn: burnResult.burn,
    burnOid: burnResult.burnOid,
    receipt: expectedReceipt,
    pullRequest: confirmed.pullRequest,
  });
  const receiptBody = renderDeliveryReceiptComment(expectedReceipt);
  await publishWaivedReceipt({
    burn: burnResult.burn,
    burnOid: burnResult.burnOid,
    receiptBody,
    receiptDigest: digest(receiptBody),
    journal,
    comments: deps.comments,
    runId,
  });
  return {
    status: receipt ? 'already-delivered' : 'delivered',
    mode: context.mode,
    intent,
    receipt: expectedReceipt,
    action: null,
    recovery: context.recovery,
    branchDisposition: observations.branchDisposition,
  };
}
