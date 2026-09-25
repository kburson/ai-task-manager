// @story #1787 #1798
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { canonicalRecordJson } from '../../../../task-tracker/lib/github-records/canonical-json.mjs';
import { buildDeliveryScope } from '../../../../task-tracker/lib/workflow-policy/delivery-scope.mjs';
import { createWorkflowExceptionEnvelope } from '../../../../task-tracker/lib/workflow-policy/exception-record.mjs';
import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
} from '../../../../task-tracker/lib/delivery-records.mjs';
import { buildWaivedReceiptInput } from '../../../../task-tracker/lib/delivery-waiver-evidence.mjs';
import { verifyDeliveredPullRequest } from '../../../../task-tracker/lib/delivery-verification.mjs';

const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const head = 'a'.repeat(40);
const merge = 'b'.repeat(40);
const id = (n) => `01M2H0000000000000000000${String(n).padStart(2, '0')}`;
const createdAt = '2026-09-24T12:01:00.000Z';
const mergedAt = '2026-09-25T12:03:00.000Z';
const requirementId = 'delivery.verification.merge-method';
const original = buildDeliveryIntent({
  intentId: id(1),
  supersedesIntentId: null,
  issueNumber: 1798,
  repository: 'kburson/ai-task-manager',
  prNumber: 1800,
  baseRef: 'trunk',
  headRef: 'feature/1798',
  expectedHeadSha: head,
  mergeMethod: 'squash',
  attributionTokens: ['#1798'],
  commitTitle: '[#1798] Deliver waiver',
  commitMessage: `PR #1800 source ${head}\n\nAttribution: [#1798]`,
  provider: 'codex',
  sessionId: 'session',
  clientCreatedAt: createdAt,
});
const scope = buildDeliveryScope({
  schema: 'aitm.delivery-exception-scope/v1',
  repository: original.repository,
  issue: original.issueNumber,
  exceptionKind: 'delivery.invariant-waiver',
  pullRequest: original.prNumber,
  acceptedHeadSha: head,
  baseRef: 'trunk',
  resolvedTrunkRef: 'origin/trunk',
  requirementId,
  deliveryOperationId: id(3),
}).scope;
const reason = 'Accept the observed merge method for this exact delivery.';
const grant = createWorkflowExceptionEnvelope({
  schema: 'aitm.workflow-exception/v2',
  repository: original.repository,
  issue: original.issueNumber,
  exceptionId: 'delivery-1798',
  revision: 1,
  scopeIdentity: digest('scope'),
  requirementIds: [requirementId],
  constraints: [],
  reason,
  authorization: {
    origin: 'codex-session-transcript',
    principal: 'operator',
    recordingActor: 'kpburson',
    reference: 'codex://sessions/session/messages/msg_1',
    statement: 'I approve this exact delivery waiver.',
    verificationLevel: 'host-verified-user-message',
  },
  expiresAt: '2026-09-26T00:00:00.000Z',
  operationId: digest('write'),
  createdAt: '2026-09-24T12:02:00.000Z',
  recordId: id(4),
  grantId: id(5),
  scopeKind: 'delivery',
  deliveryScope: scope,
  waiverScopeDigest: buildDeliveryScope(scope).waiverScopeDigest,
});
const waiver = Object.freeze({
  outcome: 'waived',
  grant,
  waiverScopeDigest: grant.payload.waiverScopeDigest,
  waiverReasonDigest: digest(reason),
});
const originalIntent = { record: original, createdAt };
const common = {
  deliveryDisposition: 'waived',
  waivedRequirementId: requirementId,
  waiverRecordId: grant.recordId,
  waiverRevision: 1,
  deliveryOperationId: scope.deliveryOperationId,
  waiverReasonDigest: waiver.waiverReasonDigest,
  waiverScopeDigest: waiver.waiverScopeDigest,
  observedFailureCategory: 'merge-method',
  waiverGrant: grant,
  providerMergeMethod: 'merge',
  observedMergeMethod: 'merge',
};
const {
  schema: _schema,
  state: _state,
  commitTitleSha256: _titleHash,
  commitMessageSha256: _messageHash,
  ...originalInput
} = original;
const pinnedIntent = buildDeliveryIntent({
  ...originalInput,
  intentId: id(2),
  supersedesIntentId: original.intentId,
  clientCreatedAt: '2026-09-25T12:01:00.000Z',
  originalIntentId: original.intentId,
  originalIntentCreatedAt: createdAt,
  originalIntentDigest: digest(canonicalRecordJson(original)),
  ...common,
});
const burn = {
  schema: 'aitm.delivery-waiver-consumption/v1',
  repository: original.repository,
  issue: original.issueNumber,
  deliveryOperationId: scope.deliveryOperationId,
  waiverRecordId: grant.recordId,
  waiverRevision: 1,
  waiverScopeDigest: waiver.waiverScopeDigest,
  waiverReasonDigest: waiver.waiverReasonDigest,
  acceptedHeadSha: head,
  intentId: pinnedIntent.intentId,
  mergeCommitSha: merge,
  authorizedAt: '2026-09-25T12:02:00.000Z',
  grantDigest: digest(canonicalRecordJson(grant)),
};
const burnOid = 'c'.repeat(40);
const storedFacts = {
  baseReceiptInput: {
    intentId: pinnedIntent.intentId,
    issueNumber: original.issueNumber,
    prNumber: original.prNumber,
    expectedHeadSha: head,
    mergeCommitSha: merge,
    baseRef: 'trunk',
    mergeMethod: 'squash',
    verifiedTrunkRef: 'origin/trunk',
    provider: 'codex',
    sessionId: 'session',
    verifiedAt: mergedAt,
  },
  providerMergeMethod: 'merge',
  observedMergeMethod: 'merge',
  observedFailureCategory: 'merge-method',
  waivedRequirementId: requirementId,
};
const receipt = buildDeliveryReceipt(
  buildWaivedReceiptInput({
    verifiedFacts: storedFacts,
    intent: pinnedIntent,
    grant,
    burn,
    burnOid,
  })
);

function input(intent = original) {
  return {
    acceptedSha: head,
    acceptedReviewSha: head,
    attributingCommits: async () => [],
    fetchOriginTrunk: async () => {},
    inspectMergeCommit: async () => ({
      parents: ['d'.repeat(40), head],
      commitTitle: intent.commitTitle,
      commitMessage: intent.commitMessage,
    }),
    intent,
    intentCreatedAt: createdAt,
    isAncestor: async () => true,
    localHeadSha: head,
    pullRequest: {
      number: original.prNumber,
      merged: true,
      state: 'MERGED',
      baseRefName: 'trunk',
      headRefOid: head,
      mergeMethod: 'merge',
      mergeCommitSha: merge,
      mergedAt,
      headRefDeleted: false,
    },
    recovery: false,
    testReceiptSha: head,
  };
}

const freshEvidence = { originalIntent, waiver };
const pinnedEvidence = { originalIntent, grant, burn, burnOid, receipt };

test('fresh exact waiver verifies all live predicates and returns provisional facts only', async () => {
  const verified = await verifyDeliveredPullRequest({
    ...input(),
    genericWaiverEvidence: freshEvidence,
  });
  assert.equal(verified.deliveryDisposition, 'waived');
  assert.equal(verified.receiptInput, null);
  assert.equal(verified.verifiedFacts.providerMergeMethod, 'merge');
  assert.equal(verified.verifiedFacts.observedMergeMethod, 'merge');
  assert.equal(verified.verifiedFacts.waivedRequirementId, requirementId);
  assert.throws(() => buildDeliveryReceipt(verified.verifiedFacts), /receipt-input-keys/);
});

test('pinned waiver reproduces stored receipt input without current grant lookup', async () => {
  const verified = await verifyDeliveredPullRequest({
    ...input(pinnedIntent),
    genericWaiverEvidence: pinnedEvidence,
  });
  assert.equal(verified.deliveryDisposition, 'waived');
  assert.deepEqual(buildDeliveryReceipt(verified.receiptInput), receipt);
});

test('generic waiver refuses mismatched schemas and fabricated mode flags as input-contract', async () => {
  for (const changed of [
    { intent: { ...original, schema: 'aitm.delivery-intent/v9' } },
    { intent: pinnedIntent },
    { genericWaiverEvidence: { ...freshEvidence, mode: 'pinned' } },
    { waivedEvidence: {} },
    { mode: 'fresh' },
  ]) {
    const candidate = { ...input(), genericWaiverEvidence: freshEvidence, ...changed };
    if (changed.intent === pinnedIntent) delete candidate.genericWaiverEvidence;
    await assert.rejects(
      () => verifyDeliveredPullRequest(candidate),
      (error) => {
        assert.equal(error.requirementId, 'delivery.verification.input-contract');
        return true;
      }
    );
  }
});

test('a second failed predicate refuses the provisional waiver', async () => {
  const candidate = input();
  candidate.isAncestor = async () => false;
  await assert.rejects(
    () => verifyDeliveredPullRequest({ ...candidate, genericWaiverEvidence: freshEvidence }),
    (error) => {
      assert.equal(error.category, 'trunk-reachability');
      return true;
    }
  );
});

test('provider and Git disagreement is a hard evidence refusal', async () => {
  const candidate = input();
  candidate.pullRequest.mergeMethod = 'squash';
  await assert.rejects(
    () => verifyDeliveredPullRequest({ ...candidate, genericWaiverEvidence: freshEvidence }),
    (error) => {
      assert.equal(error.requirementId, 'delivery.verification.merge-method-evidence');
      return true;
    }
  );
});

test('malformed provider method and unknown topology remain hard refusals', async () => {
  for (const changed of [
    { pullRequest: { ...input().pullRequest, mergeMethod: 'octopus' } },
    {
      inspectMergeCommit: async () => ({
        parents: [head, 'd'.repeat(40)],
        commitTitle: original.commitTitle,
        commitMessage: original.commitMessage,
      }),
    },
  ]) {
    await assert.rejects(
      () =>
        verifyDeliveredPullRequest({
          ...input(),
          genericWaiverEvidence: freshEvidence,
          ...changed,
        }),
      (error) => {
        assert.equal(error.requirementId, 'delivery.verification.merge-method-evidence');
        return true;
      }
    );
  }
});

test('pinned provider field may disappear while receipt retains authorized observation', async () => {
  const candidate = input(pinnedIntent);
  candidate.pullRequest.mergeMethod = null;
  const verified = await verifyDeliveredPullRequest({
    ...candidate,
    genericWaiverEvidence: pinnedEvidence,
  });
  assert.equal(verified.verifiedFacts.providerMergeMethod, 'merge');
  assert.deepEqual(buildDeliveryReceipt(verified.receiptInput), receipt);
});

test('pinned topology changes and conflicting new provider observations refuse', async () => {
  const changedTopology = input(pinnedIntent);
  changedTopology.inspectMergeCommit = async () => ({
    parents: ['d'.repeat(40)],
    commitTitle: pinnedIntent.commitTitle,
    commitMessage: pinnedIntent.commitMessage,
  });
  await assert.rejects(() =>
    verifyDeliveredPullRequest({
      ...changedTopology,
      genericWaiverEvidence: pinnedEvidence,
    })
  );
  const changedProvider = input(pinnedIntent);
  changedProvider.pullRequest.mergeMethod = 'rebase';
  await assert.rejects(
    () =>
      verifyDeliveredPullRequest({
        ...changedProvider,
        genericWaiverEvidence: pinnedEvidence,
      }),
    (error) => {
      assert.equal(error.requirementId, 'delivery.verification.merge-method-evidence');
      return true;
    }
  );
});

test('pinned evidence requires a complete real burn and cannot use a fake OID', async () => {
  for (const evidence of [
    { ...pinnedEvidence, burn: null },
    { ...pinnedEvidence, burnOid: null },
    { ...pinnedEvidence, receipt: { ...receipt, burnOid: 'd'.repeat(40) } },
  ]) {
    await assert.rejects(() =>
      verifyDeliveredPullRequest({
        ...input(pinnedIntent),
        genericWaiverEvidence: evidence,
      })
    );
  }
});

test('fresh waiver preserves an absent provider method as null', async () => {
  const candidate = input();
  candidate.pullRequest.mergeMethod = null;
  const verified = await verifyDeliveredPullRequest({
    ...candidate,
    genericWaiverEvidence: freshEvidence,
  });
  assert.equal(verified.verifiedFacts.providerMergeMethod, null);
  assert.equal(verified.verifiedFacts.observedMergeMethod, 'merge');
});

test('confirmed v3 candidate can be reverified provisionally before a burn', async () => {
  const verified = await verifyDeliveredPullRequest({
    ...input(pinnedIntent),
    genericWaiverEvidence: freshEvidence,
  });
  assert.equal(verified.receiptInput, null);
  assert.equal(verified.verifiedFacts.baseReceiptInput.intentId, pinnedIntent.intentId);
});

test('unrelated trunk advancement remains valid when the merge stays reachable', async () => {
  const candidate = input(pinnedIntent);
  candidate.isAncestor = async ({ descendant }) => descendant === 'origin/trunk';
  const verified = await verifyDeliveredPullRequest({
    ...candidate,
    genericWaiverEvidence: pinnedEvidence,
  });
  assert.deepEqual(buildDeliveryReceipt(verified.receiptInput), receipt);
});

test('fresh waiver refuses a contradictory original intent timestamp', async () => {
  await assert.rejects(
    () =>
      verifyDeliveredPullRequest({
        ...input(),
        intentCreatedAt: '2026-09-24T11:01:00.000Z',
        genericWaiverEvidence: freshEvidence,
      }),
    (error) => {
      assert.equal(error.requirementId, 'delivery.verification.waiver-authority');
      return true;
    }
  );
});

test('pinned null provider observation remains null when metadata later appears', async () => {
  const noProviderIntent = buildDeliveryIntent({
    ...originalInput,
    intentId: id(2),
    supersedesIntentId: original.intentId,
    clientCreatedAt: '2026-09-25T12:01:00.000Z',
    originalIntentId: original.intentId,
    originalIntentCreatedAt: createdAt,
    originalIntentDigest: digest(canonicalRecordJson(original)),
    ...common,
    providerMergeMethod: null,
  });
  const noProviderFacts = { ...storedFacts, providerMergeMethod: null };
  const noProviderReceipt = buildDeliveryReceipt(
    buildWaivedReceiptInput({
      verifiedFacts: noProviderFacts,
      intent: noProviderIntent,
      grant,
      burn,
      burnOid,
    })
  );
  const verified = await verifyDeliveredPullRequest({
    ...input(noProviderIntent),
    genericWaiverEvidence: {
      originalIntent,
      grant,
      burn,
      burnOid,
      receipt: noProviderReceipt,
    },
  });
  assert.equal(verified.verifiedFacts.providerMergeMethod, null);
  assert.deepEqual(buildDeliveryReceipt(verified.receiptInput), noProviderReceipt);
});

test('typed current-grant ambiguity retains its hard ID and indeterminate outcome', async () => {
  const { DeliveryWaiverAuthorityError } =
    await import('../../../../task-tracker/lib/workflow-policy/delivery-waiver-authority.mjs');
  await assert.rejects(
    () =>
      verifyDeliveredPullRequest({
        ...input(),
        genericWaiverEvidence: new DeliveryWaiverAuthorityError('delivery-waiver-ambiguity'),
      }),
    (error) => {
      assert.equal(error.requirementId, 'delivery.verification.waiver-authority');
      assert.equal(error.outcome, 'indeterminate');
      return true;
    }
  );
});

function freshFor(selectedRequirementId) {
  const selectedScope = buildDeliveryScope({
    ...scope,
    requirementId: selectedRequirementId,
    deliveryOperationId: id(8),
  }).scope;
  const selectedGrant = createWorkflowExceptionEnvelope({
    schema: 'aitm.workflow-exception/v2',
    repository: original.repository,
    issue: original.issueNumber,
    exceptionId: 'delivery-1798-alternate',
    revision: 1,
    scopeIdentity: digest('alternate-scope'),
    requirementIds: [selectedRequirementId],
    constraints: [],
    reason,
    authorization: {
      origin: 'codex-session-transcript',
      principal: 'operator',
      recordingActor: 'kpburson',
      reference: 'codex://sessions/session/messages/msg_2',
      statement: 'I approve this exact delivery waiver.',
      verificationLevel: 'host-verified-user-message',
    },
    expiresAt: '2026-09-26T00:00:00.000Z',
    operationId: digest('alternate-write'),
    createdAt: '2026-09-24T12:02:00.000Z',
    recordId: id(9),
    grantId: id(10),
    scopeKind: 'delivery',
    deliveryScope: selectedScope,
    waiverScopeDigest: buildDeliveryScope(selectedScope).waiverScopeDigest,
  });
  return {
    originalIntent,
    waiver: {
      outcome: 'waived',
      grant: selectedGrant,
      waiverScopeDigest: selectedGrant.payload.waiverScopeDigest,
      waiverReasonDigest: digest(reason),
    },
  };
}

function observedSquash() {
  const candidate = input();
  candidate.pullRequest.mergeMethod = 'squash';
  candidate.inspectMergeCommit = async () => ({
    parents: ['d'.repeat(40)],
    commitTitle: original.commitTitle,
    commitMessage: original.commitMessage,
  });
  return candidate;
}

test('valid local head divergence can use accepted-head waiver with accepted PR/Test/Review head intact', async () => {
  const candidate = observedSquash();
  candidate.localHeadSha = 'e'.repeat(40);
  const verified = await verifyDeliveredPullRequest({
    ...candidate,
    genericWaiverEvidence: freshFor('delivery.verification.accepted-head'),
  });
  assert.equal(verified.verifiedFacts.waivedRequirementId, 'delivery.verification.accepted-head');
  assert.equal(verified.verifiedFacts.baseReceiptInput.expectedHeadSha, head);
});

test('valid merge-before-original-intent chronology can use one intent-integrity waiver', async () => {
  const candidate = observedSquash();
  candidate.pullRequest.mergedAt = '2026-09-24T12:00:00.000Z';
  const verified = await verifyDeliveredPullRequest({
    ...candidate,
    genericWaiverEvidence: freshFor('delivery.verification.intent-integrity'),
  });
  assert.equal(verified.verifiedFacts.observedFailureCategory, 'merge-before-intent');
});

test('observed commit bytes divergence can use one commit-attribution waiver', async () => {
  const candidate = observedSquash();
  candidate.inspectMergeCommit = async () => ({
    parents: ['d'.repeat(40)],
    commitTitle: '[#1798] Changed merge title',
    commitMessage: original.commitMessage,
  });
  const verified = await verifyDeliveredPullRequest({
    ...candidate,
    genericWaiverEvidence: freshFor('delivery.verification.commit-attribution'),
  });
  assert.equal(verified.verifiedFacts.observedFailureCategory, 'merge-commit-bytes');
});

for (const [label, requirementId, change, category] of [
  [
    'conflicting accepted authorities',
    'delivery.verification.accepted-head',
    (candidate) => {
      candidate.testReceiptSha = 'e'.repeat(40);
    },
    'authority-sha-mismatch',
  ],
  [
    'unmerged PR',
    'delivery.verification.pr-merged',
    (candidate) => {
      candidate.pullRequest.merged = false;
      candidate.pullRequest.state = 'OPEN';
    },
    'pull-request-not-merged',
  ],
  [
    'wrong PR target',
    'delivery.verification.pr-scope',
    (candidate) => {
      candidate.pullRequest.baseRefName = 'main';
    },
    'base-ref',
  ],
  [
    'unreachable merge',
    'delivery.verification.trunk-reachability',
    (candidate) => {
      candidate.isAncestor = async () => false;
    },
    'trunk-reachability',
  ],
  [
    'unknown branch disposition',
    'delivery.verification.branch-disposition',
    (candidate) => {
      delete candidate.pullRequest.headRefDeleted;
    },
    'branch-disposition',
  ],
]) {
  test(`${label} stays hard despite a matching catalog-eligible grant`, async () => {
    const candidate = observedSquash();
    change(candidate);
    await assert.rejects(
      () =>
        verifyDeliveredPullRequest({
          ...candidate,
          genericWaiverEvidence: freshFor(requirementId),
        }),
      (error) => {
        assert.equal(error.category, category);
        return true;
      }
    );
  });
}

test('two distinct eligible failures refuse before any provisional receipt', async () => {
  const candidate = input();
  candidate.inspectMergeCommit = async () => ({
    parents: ['d'.repeat(40), head],
    commitTitle: '[#1798] Changed merge title',
    commitMessage: original.commitMessage,
  });
  await assert.rejects(
    () =>
      verifyDeliveredPullRequest({
        ...candidate,
        genericWaiverEvidence: freshEvidence,
      }),
    (error) => {
      assert.equal(error.category, 'merge-commit-bytes');
      return true;
    }
  );
});

test('commit-attribution waiver never accepts a conflicting issue claim', async () => {
  const candidate = observedSquash();
  candidate.inspectMergeCommit = async () => ({
    parents: ['d'.repeat(40)],
    commitTitle: original.commitTitle,
    commitMessage: 'Attribution: [#999]',
  });
  await assert.rejects(
    () =>
      verifyDeliveredPullRequest({
        ...candidate,
        genericWaiverEvidence: freshFor('delivery.verification.commit-attribution'),
      }),
    (error) => {
      assert.equal(error.category, 'attribution');
      return true;
    }
  );
});

test('single missing final attribution can use the exact commit-attribution waiver', async () => {
  const noTrailer = buildDeliveryIntent({
    ...originalInput,
    commitMessage: `PR #1800 source ${head}\n\n[#1798]`,
  });
  const candidate = observedSquash();
  candidate.intent = noTrailer;
  candidate.inspectMergeCommit = async () => ({
    parents: ['d'.repeat(40)],
    commitTitle: noTrailer.commitTitle,
    commitMessage: noTrailer.commitMessage,
  });
  const verified = await verifyDeliveredPullRequest({
    ...candidate,
    genericWaiverEvidence: {
      ...freshFor('delivery.verification.commit-attribution'),
      originalIntent: { record: noTrailer, createdAt },
    },
  });
  assert.equal(verified.verifiedFacts.observedFailureCategory, 'attribution');
  assert.equal(verified.receiptInput, null);
});

test('missing final attribution and changed bytes count as one waived requirement ID', async () => {
  const candidate = observedSquash();
  candidate.inspectMergeCommit = async () => ({
    parents: ['d'.repeat(40)],
    commitTitle: original.commitTitle,
    commitMessage: `PR #1800 source ${head}`,
  });
  const verified = await verifyDeliveredPullRequest({
    ...candidate,
    genericWaiverEvidence: freshFor('delivery.verification.commit-attribution'),
  });
  assert.equal(
    verified.verifiedFacts.waivedRequirementId,
    'delivery.verification.commit-attribution'
  );
  assert.equal(verified.verifiedFacts.observedFailureCategory, 'merge-commit-bytes');
  assert.equal(verified.receiptInput, null);
});

test('pinned v3/v4 missing-trailer waiver reconstructs an exact warning-free receipt', async () => {
  const noTrailer = buildDeliveryIntent({
    ...originalInput,
    commitMessage: `PR #1800 source ${head}\n\n[#1798]`,
  });
  const selectedGrant = freshFor('delivery.verification.commit-attribution').waiver.grant;
  const selectedScope = selectedGrant.payload.deliveryScope;
  const {
    schema: _s,
    state: _st,
    commitTitleSha256: _th,
    commitMessageSha256: _mh,
    ...noTrailerInput
  } = noTrailer;
  const waivedIntent = buildDeliveryIntent({
    ...noTrailerInput,
    intentId: id(11),
    supersedesIntentId: noTrailer.intentId,
    clientCreatedAt: '2026-09-25T12:01:00.000Z',
    originalIntentId: noTrailer.intentId,
    originalIntentCreatedAt: createdAt,
    originalIntentDigest: digest(canonicalRecordJson(noTrailer)),
    deliveryDisposition: 'waived',
    waivedRequirementId: 'delivery.verification.commit-attribution',
    waiverRecordId: selectedGrant.recordId,
    waiverRevision: 1,
    deliveryOperationId: selectedScope.deliveryOperationId,
    waiverReasonDigest: digest(reason),
    waiverScopeDigest: selectedGrant.payload.waiverScopeDigest,
    observedFailureCategory: 'attribution',
    waiverGrant: selectedGrant,
    providerMergeMethod: 'squash',
    observedMergeMethod: 'squash',
  });
  const selectedBurn = {
    schema: 'aitm.delivery-waiver-consumption/v1',
    repository: noTrailer.repository,
    issue: noTrailer.issueNumber,
    deliveryOperationId: selectedScope.deliveryOperationId,
    waiverRecordId: selectedGrant.recordId,
    waiverRevision: 1,
    waiverScopeDigest: selectedGrant.payload.waiverScopeDigest,
    waiverReasonDigest: digest(reason),
    acceptedHeadSha: head,
    intentId: waivedIntent.intentId,
    mergeCommitSha: merge,
    authorizedAt: '2026-09-25T12:02:00.000Z',
    grantDigest: digest(canonicalRecordJson(selectedGrant)),
  };
  const expectedFacts = {
    baseReceiptInput: {
      intentId: waivedIntent.intentId,
      issueNumber: noTrailer.issueNumber,
      prNumber: noTrailer.prNumber,
      expectedHeadSha: head,
      mergeCommitSha: merge,
      baseRef: 'trunk',
      mergeMethod: 'squash',
      verifiedTrunkRef: 'origin/trunk',
      provider: 'codex',
      sessionId: 'session',
      verifiedAt: mergedAt,
    },
    providerMergeMethod: 'squash',
    observedMergeMethod: 'squash',
    observedFailureCategory: 'attribution',
    waivedRequirementId: 'delivery.verification.commit-attribution',
  };
  const expectedReceipt = buildDeliveryReceipt(
    buildWaivedReceiptInput({
      verifiedFacts: expectedFacts,
      intent: waivedIntent,
      grant: selectedGrant,
      burn: selectedBurn,
      burnOid,
    })
  );
  const candidate = observedSquash();
  candidate.intent = waivedIntent;
  candidate.inspectMergeCommit = async () => ({
    parents: ['d'.repeat(40)],
    commitTitle: noTrailer.commitTitle,
    commitMessage: noTrailer.commitMessage,
  });
  const verified = await verifyDeliveredPullRequest({
    ...candidate,
    genericWaiverEvidence: {
      originalIntent: { record: noTrailer, createdAt },
      grant: selectedGrant,
      burn: selectedBurn,
      burnOid,
      receipt: expectedReceipt,
    },
  });
  assert.equal(verified.verifiedFacts.observedFailureCategory, 'attribution');
  assert.equal(Object.hasOwn(verified.receiptInput, 'metadataWarnings'), false);
  assert.deepEqual(buildDeliveryReceipt(verified.receiptInput), expectedReceipt);
});
