// @story #1381 #939
// cspell:ignore NDEKTSV RRFFQ
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { blockedByGuard } from '../../../../task-tracker/lib/blocked-by-guard.mjs';
import {
  INCORPORATED_CLOSE_STEPS,
  authorizeIncorporatedClose,
  runIncorporatedClose,
} from '../../../../task-tracker/lib/incorporated-close.mjs';
import { authorizeIncidentEpicClose } from '../../../../task-tracker/lib/incident-epic-close.mjs';
import {
  TERMINAL_CLOSE_STEPS,
  readDeliveredCloseTransactions,
  upsertDeliveredCloseTransaction,
} from '../../../../task-tracker/lib/close-convergence.mjs';
import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
  renderDeliveryIntentComment,
  renderDeliveryReceiptComment,
} from '../../../../task-tracker/lib/delivery-records.mjs';
import { baseState, runClose } from '../../../helpers/close-convergence-wiring-helpers.mjs';
import {
  REUSED_BRANCH_REPOSITORY as REPOSITORY,
  REUSED_SHA_A as SHA_A,
  REUSED_SHA_B as SHA_B,
  createReusedBranchDeliveryHarness as createReusedBranchHarness,
  reusedBranchDeliveryBody as deliveryBody,
} from '../../../helpers/reused-branch-delivery-harness.mjs';
import {
  INCIDENT_SHARED_SHA,
  createApprovedIncidentFixture,
  createIncorporatedMutationHarness,
} from '../../../helpers/incident-convergence-harness.mjs';
const INTENT_IDS = [
  '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '01ARZ3NDEKTSV4RRFFQ69G5FAW',
  '01ARZ3NDEKTSV4RRFFQ69G5FAX',
  '01ARZ3NDEKTSV4RRFFQ69G5FAY',
];

function productionCloseOptions(harness, { body, standing }) {
  const events = [];
  const verificationDeps = harness.verificationDeps(1381);
  return {
    events,
    options: {
      issueNumber: 1381,
      repository: REPOSITORY,
      body,
      gateReviewToDone: false,
      force: true,
      trackEstimationOutcomes: true,
      useInjectedDeliveryGateInput: false,
      useInjectedDeliveryReceipt: false,
      useInjectedFreshDeliveryVerification: false,
      useInjectedReviewAuthorization: false,
      deliveryVerificationDeps: {
        ...verificationDeps,
        async fetchOriginTrunk(input) {
          events.push('verify-receipt');
          return verificationDeps.fetchOriginTrunk(input);
        },
      },
      loadCurrentSession() {
        events.push('read-session-policy');
        return { gates: { reviewToDone: !standing } };
      },
      loadRawProjectConfig() {
        events.push('read-project-policy');
        return {};
      },
      pexecOverride(command, args) {
        if (command === 'gh' && args[0] === 'pr') events.push('load-delivery-pr');
        if (command === 'gh' && args[0] === 'api') events.push('load-delivery-records');
        return harness.closePexec(1381, command, args);
      },
    },
  };
}

function terminalMutationLedger(calls) {
  return {
    drains: calls.drains,
    flushes: calls.flushes,
    timingRows: calls.timingRows.length,
    estimationOutcomes: calls.estimationOutcomes,
    lifecycleReconciles: calls.lifecycleReconciles,
    movesToDone: calls.movesToDone.length,
    terminalDispositions: calls.terminalDispositions,
    issueCloses: calls.issueCloses,
    labelWrites: calls.labelWrites,
    bindingReleases: calls.bindingReleases,
    bindingResumes: calls.bindingResumes,
    bodyMutations: calls.mutations,
    issueRecordCreates: calls.issueRecordCreates,
    providerActions: calls.providerActions,
    reopens: calls.reopens,
    logIssueTime: calls.logIssueTime,
  };
}

function markerRecord(comment) {
  const match = comment.body.match(/<!-- aitm-delivery-(?:intent|receipt) (.+) -->/);
  assert.ok(match);
  return JSON.parse(match[1]);
}

function deliveryInput(record) {
  const input = structuredClone(record);
  for (const key of ['schema', 'state', 'commitTitleSha256', 'commitMessageSha256', 'result']) {
    delete input[key];
  }
  return input;
}

test('A to B reused-branch delivery closes historical A through production seams and retries read-only', async () => {
  const harness = createReusedBranchHarness();
  const pendingA = await harness.deliver(1381);
  assert.equal(pendingA.status, 'action-required');
  harness.merge(1381);
  const deliveredA = await harness.deliver(1381);
  assert.equal(deliveredA.status, 'delivered');

  harness.setCurrentHead(SHA_B);
  const pendingB = await harness.deliver(1385);
  assert.equal(pendingB.status, 'action-required');
  harness.merge(1385);
  const deliveredB = await harness.deliver(1385);
  assert.equal(deliveredB.status, 'delivered');
  assert.deepEqual(
    {
      providerActions: harness.effects.providerActions,
      intents: harness.effects.intents,
      receipts: harness.effects.receipts,
    },
    { providerActions: 2, intents: 2, receipts: 2 }
  );
  // #1512: each delivery resolves both final-task authorization and the
  // independent PR-code review gate from session/project policy.
  assert.equal(harness.effects.policyReads, 16);

  const gateInput = await harness.closeGateInput(1381);
  assert.equal(gateInput.acceptedSha, SHA_A);
  assert.equal(gateInput.observedLocalHeadSha, SHA_B);
  assert.equal(gateInput.pullRequest.number, 1400);
  assert.equal(gateInput.lineage.parentIssueNumber, null);

  const body = deliveryBody(SHA_A);
  const refusedConfig = productionCloseOptions(harness, { body, standing: false });
  const verificationCountBeforeRefusal = harness.effects.originFetches;
  const inactiveState = { ...baseState(1381), active: null, entryStartTs: null };
  let refusedState = null;
  const refused = await runClose({
    ...refusedConfig.options,
    closeSnapshot: { issueClosed: false, stateReason: null },
    initialState: inactiveState,
    captureFinalState: (value) => {
      refusedState = value;
    },
  });
  assert.equal(refused.exitCode, 1);
  assert.deepEqual(refusedConfig.events.slice(0, 2), [
    'read-session-policy',
    'read-project-policy',
  ]);
  assert.ok(
    refusedConfig.events.lastIndexOf('read-session-policy') >
      refusedConfig.events.indexOf('load-delivery-records')
  );
  assert.equal(harness.effects.originFetches, verificationCountBeforeRefusal);
  assert.equal(refused.body, body);
  assert.deepEqual(JSON.parse(refusedState), inactiveState);
  assert.deepEqual(terminalMutationLedger(refused.calls), {
    drains: 0,
    flushes: 0,
    timingRows: 0,
    estimationOutcomes: 0,
    lifecycleReconciles: 0,
    movesToDone: 0,
    terminalDispositions: 0,
    issueCloses: 0,
    labelWrites: 0,
    bindingReleases: 0,
    bindingResumes: 0,
    bodyMutations: 0,
    issueRecordCreates: 0,
    providerActions: 0,
    reopens: 0,
    logIssueTime: 0,
  });

  const closeConfig = productionCloseOptions(harness, { body, standing: true });
  let firstState = null;
  const outcomeFactoryCalls = [];
  const verificationCountBeforeClose = harness.effects.originFetches;
  const firstClose = await runClose({
    ...closeConfig.options,
    trackEstimationOutcomes: false,
    createEstimationOutcomeWriter: (options) => {
      outcomeFactoryCalls.push(options);
      return {
        ensure: async ({ issueNumber }) => {
          assert.equal(
            options.resolveVerificationSha({
              issueNumber,
              diff: { verificationSha: SHA_B, commitSha: SHA_A },
            }),
            SHA_A
          );
          return { status: 'existing' };
        },
      };
    },
    closeSnapshot: { issueClosed: false, stateReason: null },
    captureFinalState: (value) => {
      firstState = value;
    },
  });
  assert.equal(firstClose.exitCode, 0);
  assert.equal(outcomeFactoryCalls.length, 1);
  assert.ok(closeConfig.events.indexOf('load-delivery-pr') >= 0);
  assert.ok(
    closeConfig.events.indexOf('verify-receipt') >
      closeConfig.events.indexOf('load-delivery-records')
  );
  assert.equal(harness.effects.originFetches, verificationCountBeforeClose + 1);
  const [transaction] = readDeliveredCloseTransactions(firstClose.body);
  assert.deepEqual(transaction, {
    schema: 'aitm.delivered-close/v1',
    transactionId: transaction.transactionId,
    issueNumber: 1381,
    acceptedSha: SHA_A,
    reviewAuthority: 'gate-bypassed',
    completedSteps: [...TERMINAL_CLOSE_STEPS],
  });
  assert.equal(firstClose.calls.movesToDone[0].options.reviewAuthority, 'gate-bypassed');

  let retryState = null;
  const retry = await runClose({
    ...productionCloseOptions(harness, { body: firstClose.body, standing: false }).options,
    boardState: 'done',
    terminalDisposition: 'Delivered',
    bindingReleased: true,
    body: firstClose.body,
    initialState: JSON.parse(firstState),
    captureFinalState: (value) => {
      retryState = value;
    },
  });
  assert.equal(retry.exitCode, 0);
  assert.equal(retry.body, firstClose.body);
  assert.deepEqual(JSON.parse(retryState), JSON.parse(firstState));
  assert.deepEqual(terminalMutationLedger(retry.calls), {
    drains: 0,
    flushes: 0,
    timingRows: 0,
    estimationOutcomes: 0,
    lifecycleReconciles: 0,
    movesToDone: 0,
    terminalDispositions: 0,
    issueCloses: 0,
    labelWrites: 0,
    bindingReleases: 0,
    bindingResumes: 0,
    bodyMutations: 0,
    issueRecordCreates: 0,
    providerActions: 0,
    reopens: 0,
    logIssueTime: 0,
  });
});

test('interrupted A delivery recovers its receipt after the branch advances without provider action', async () => {
  const harness = createReusedBranchHarness();
  assert.equal((await harness.deliver(1381)).status, 'action-required');
  harness.merge(1381);
  harness.setCurrentHead(SHA_B);
  const recovered = await harness.deliver(1381);
  assert.equal(recovered.status, 'delivered');
  assert.equal(recovered.mode, 'historical-recovery');
  assert.equal(recovered.action, null);
  assert.deepEqual(
    {
      providerActions: harness.effects.providerActions,
      intents: harness.effects.intents,
      receipts: harness.effects.receipts,
    },
    { providerActions: 1, intents: 1, receipts: 1 }
  );
  const retry = await harness.deliver(1381);
  assert.equal(retry.status, 'already-delivered');
  assert.equal(harness.effects.providerActions, 1);
  assert.equal(harness.effects.receipts, 1);

  const disabled = createReusedBranchHarness();
  disabled.setFullAutoStanding(false);
  await assert.rejects(disabled.deliver(1381), /delivery-preflight:approval-evidence/);
  assert.equal(disabled.effects.policyReads, 2);
  assert.equal(disabled.effects.intents, 0);
});

test('reused-branch composition fails closed on ambiguous PR and corrupt record histories', async () => {
  const reversed = createReusedBranchHarness({ reversePullRequests: true });
  assert.equal((await reversed.deliver(1381)).status, 'action-required');
  assert.equal(
    markerRecord(
      reversed.comments.get(1381).find(({ body }) => body.includes('aitm-delivery-intent'))
    ).prNumber,
    1400
  );

  const missing = createReusedBranchHarness();
  missing.pullRequests.delete(1400);
  await assert.rejects(missing.deliver(1381), /delivery-preflight:pull-request-count/);
  assert.equal(missing.effects.intents, 0);

  const duplicate = createReusedBranchHarness();
  duplicate.pullRequests.set(1401, {
    ...structuredClone(duplicate.pullRequests.get(1400)),
    number: 1401,
  });
  await assert.rejects(duplicate.deliver(1381), /delivery-preflight:pull-request-count/);
  assert.equal(duplicate.effects.intents, 0);

  const malformed = createReusedBranchHarness();
  malformed.comments.get(1381).push({
    id: 'malformed-intent',
    createdAt: '2026-08-28T00:01:00.000Z',
    body: '<!-- aitm-delivery-intent {not-json} -->',
  });
  await assert.rejects(malformed.deliver(1381), /delivery-records:malformed-marker/);
  assert.equal(malformed.effects.intents, 0);

  const forked = createReusedBranchHarness();
  await forked.deliver(1381);
  const originalIntent = forked.comments.get(1381)[0];
  const forkIntent = buildDeliveryIntent({
    ...deliveryInput(markerRecord(originalIntent)),
    intentId: INTENT_IDS[3],
    supersedesIntentId: null,
  });
  forked.comments.get(1381).push({
    id: 'forked-intent',
    createdAt: '2026-08-28T00:02:30.000Z',
    body: renderDeliveryIntentComment(forkIntent),
  });
  await assert.rejects(forked.deliver(1381), /delivery-records:multiple-live-intents/);
  assert.equal(forked.effects.providerActions, 1);

  const repeated = createReusedBranchHarness();
  await repeated.deliver(1381);
  repeated.merge(1381);
  await repeated.deliver(1381);
  const receipt = repeated.comments
    .get(1381)
    .find(({ body }) => body.startsWith('<!-- aitm-delivery-receipt '));
  repeated.comments.get(1381).push({
    ...receipt,
    id: 'duplicate-receipt',
    createdAt: '2026-08-28T00:59:00.000Z',
  });
  await assert.rejects(repeated.deliver(1381), /delivery-records:duplicate-receipt/);
  assert.equal(repeated.effects.receipts, 1);

  const divergent = createReusedBranchHarness();
  await divergent.deliver(1381);
  divergent.merge(1381);
  await divergent.deliver(1381);
  const receiptComment = divergent.comments
    .get(1381)
    .find(({ body }) => body.startsWith('<!-- aitm-delivery-receipt '));
  const divergentReceipt = buildDeliveryReceipt({
    ...deliveryInput(markerRecord(receiptComment)),
    mergeCommitSha: '9'.repeat(40),
  });
  divergent.comments.get(1381).push({
    id: 'divergent-receipt',
    createdAt: '2026-08-28T00:59:00.000Z',
    body: renderDeliveryReceiptComment(divergentReceipt),
  });
  await assert.rejects(divergent.deliver(1381), /delivery-records:receipt-conflict/);
  assert.equal(divergent.effects.receipts, 1);
});

test('historical recovery refuses unreadable trunk, unreachable merge, and altered authorized bytes', async () => {
  for (const [fault, expected] of [
    ['fetch', /delivery-verification:fetch-origin-trunk/],
    ['unreachable', /delivery-verification:trunk-reachability/],
    ['mergeBytes', /delivery-verification:merge-commit-bytes/],
  ]) {
    const harness = createReusedBranchHarness();
    await harness.deliver(1381);
    harness.merge(1381);
    harness.setCurrentHead(SHA_B);
    harness.faults[fault] = true;
    await assert.rejects(harness.deliver(1381), expected);
    assert.equal(harness.effects.providerActions, 1);
    assert.equal(harness.effects.receipts, 0);
  }
});

async function historicalCloseFixture() {
  const harness = createReusedBranchHarness();
  await harness.deliver(1381);
  harness.merge(1381);
  await harness.deliver(1381);
  harness.setCurrentHead(SHA_B);
  return { harness, gateInput: await harness.closeGateInput(1381) };
}

test('composed close refuses stale lifecycle, approval, PR, merge, method, and attribution evidence', async () => {
  for (const body of [
    deliveryBody(SHA_A, { testSha: SHA_B }),
    deliveryBody(SHA_A, { reviewSha: SHA_B }),
  ]) {
    const { harness } = await historicalCloseFixture();
    const run = await runClose({
      ...productionCloseOptions(harness, { body, standing: true }).options,
      closeSnapshot: { issueClosed: false, stateReason: null },
    });
    assert.equal(run.exitCode, 1);
    assert.equal(run.body, body);
    assert.equal(run.calls.mutations, 0);
  }

  const staleApproval = await historicalCloseFixture();
  const staleBody = deliveryBody(SHA_A, { approvalSha: SHA_B });
  const stale = await runClose({
    ...productionCloseOptions(staleApproval.harness, {
      body: staleBody,
      standing: true,
    }).options,
    closeSnapshot: { issueClosed: false, stateReason: null },
  });
  assert.equal(stale.exitCode, 1);
  assert.equal(stale.body, staleBody);
  assert.equal(stale.calls.mutations, 0);

  for (const [name, mutate] of [
    [
      'pr',
      (harness) => {
        harness.pullRequests.get(1400).number = 9999;
      },
    ],
    [
      'merge',
      (harness) => {
        harness.pullRequests.get(1400).mergeCommitSha = '9'.repeat(40);
      },
    ],
    [
      'method',
      (harness) => {
        harness.faults.mergeMethod = true;
      },
    ],
    [
      'attribution',
      (harness) => {
        harness.faults.attribution = true;
      },
    ],
  ]) {
    const fixture = await historicalCloseFixture();
    mutate(fixture.harness);
    const run = await runClose({
      ...productionCloseOptions(fixture.harness, {
        body: deliveryBody(SHA_A),
        standing: true,
      }).options,
      closeSnapshot: { issueClosed: false, stateReason: null },
    });
    assert.equal(run.exitCode, 1, name);
    assert.equal(run.body, deliveryBody(SHA_A), name);
    assert.equal(run.calls.mutations, 0, name);
  }
});

test('partial Delivered terminal transaction resumes only its exact suffix under durable authority', async () => {
  const { harness } = await historicalCloseFixture();
  const first = await runClose({
    ...productionCloseOptions(harness, {
      body: deliveryBody(SHA_A),
      standing: true,
    }).options,
    closeSnapshot: { issueClosed: false, stateReason: null },
  });
  const [complete] = readDeliveredCloseTransactions(first.body);
  const completedSteps = TERMINAL_CLOSE_STEPS.slice(0, 4);
  const partialBody = upsertDeliveredCloseTransaction(deliveryBody(SHA_A), {
    ...complete,
    completedSteps,
  });
  const config = productionCloseOptions(harness, {
    body: partialBody,
    standing: false,
  });
  const resumed = await runClose({
    ...config.options,
    boardState: 'done',
    closeSnapshot: { issueClosed: false, stateReason: null },
    body: partialBody,
  });
  assert.equal(resumed.exitCode, 0);
  assert.equal(config.events.includes('verify-receipt'), true);
  assert.deepEqual(terminalMutationLedger(resumed.calls), {
    drains: 0,
    flushes: 0,
    timingRows: 0,
    estimationOutcomes: 0,
    lifecycleReconciles: 0,
    movesToDone: 0,
    terminalDispositions: 1,
    issueCloses: 1,
    labelWrites: 1,
    bindingReleases: 1,
    bindingResumes: 0,
    bodyMutations: 4,
    issueRecordCreates: 0,
    providerActions: 0,
    reopens: 0,
    logIssueTime: 0,
  });
  const [finished] = readDeliveredCloseTransactions(resumed.body);
  assert.deepEqual(finished.completedSteps, [...TERMINAL_CLOSE_STEPS]);
  assert.equal(finished.reviewAuthority, 'gate-bypassed');
  assert.equal(finished.acceptedSha, SHA_A);
});

test('close rejects malformed provider timestamps before receipt or terminal mutation', async () => {
  const harness = createReusedBranchHarness();
  await harness.deliver(1381);
  harness.merge(1381);
  await harness.deliver(1381);
  harness.pullRequests.get(1400).mergedAt = 'not-a-provider-instant';
  await assert.rejects(harness.closeGateInput(1381), /close-delivery-pr-merged-at/);
});

test('#1382 and #1383 project one approved ledger but produce distinct terminal record chains', async () => {
  const fixture = createApprovedIncidentFixture();
  const authorize = (issueNumber, deliveryReceiptStatus = 'absent') =>
    authorizeIncorporatedClose({
      repository: REPOSITORY,
      issueNumber,
      convergenceIssue: 1381,
      records: fixture.records,
      live: {
        issueNumber,
        issueState: 'OPEN',
        issueStateReason: '',
        closeTransactionPresent: false,
        acceptedEvidenceValid: true,
        acceptedSha: INCIDENT_SHARED_SHA,
        reviewAuthorizationValid: true,
        reviewAuthorization: { mode: 'full-auto', source: 'session' },
        pullRequest: {
          number: 1410,
          headRefOid: INCIDENT_SHARED_SHA,
          mergeCommitSha: 'd'.repeat(40),
        },
        sourceOnTrunk: true,
        trunkSha: 'e'.repeat(40),
        deliveryReceiptStatus,
        blockerCarriers: { labelCleared: true, fieldCleared: true, bodyCleared: true },
      },
    });
  assert.throws(() => authorize(1382, 'present'), /incorporated-close:delivery-receipt-exists/);

  const results = [];
  for (const issueNumber of [1382, 1383]) {
    const authorization = authorize(issueNumber);
    const mutation = createIncorporatedMutationHarness();
    const result = await runIncorporatedClose({ authorization, deps: mutation.deps });
    const incorporated = mutation.records.find(
      ({ envelope }) => envelope.recordType === 'delivery-incident-incorporated'
    );
    const terminal = mutation.records.filter(
      ({ envelope }) => envelope.recordType === 'delivery-incident-incorporated-close'
    );
    assert.equal(result.status, 'incorporated');
    assert.deepEqual(result.mutatedSteps, [...INCORPORATED_CLOSE_STEPS]);
    assert.equal(incorporated.envelope.payload.issueNumber, issueNumber);
    assert.equal(incorporated.envelope.payload.acceptedSha, INCIDENT_SHARED_SHA);
    assert.equal(terminal.length, INCORPORATED_CLOSE_STEPS.length);
    assert.deepEqual(terminal.at(-1).envelope.payload.completedSteps, [
      ...INCORPORATED_CLOSE_STEPS,
    ]);
    results.push({ authorization, incorporated, terminal });
  }
  assert.notEqual(
    results[0].incorporated.envelope.recordId,
    results[1].incorporated.envelope.recordId
  );
  assert.notDeepEqual(
    results[0].authorization.incorporatedPayload,
    results[1].authorization.incorporatedPayload
  );
  assert.notEqual(
    results[0].terminal.at(-1).envelope.recordId,
    results[1].terminal.at(-1).envelope.recordId
  );
});

test('amendment gates keep Phase B ledger authority after #1381 Done and block chain or #939 drift', async () => {
  const blockerOpen = await blockedByGuard.run({
    body: '<!-- aitm-blocked-by refs="#1381" -->',
    fetchBlockerState: async () => 'review',
  });
  assert.equal(blockerOpen.ok, false);
  assert.match(blockerOpen.reason, /#1381 \(review\)/);
  assert.deepEqual(
    await blockedByGuard.run({
      body: '<!-- aitm-blocked-by refs="#1381" -->',
      fetchBlockerState: async () => 'done',
    }),
    { ok: true }
  );

  const required = [1380, 1382, 1383, 1384];
  const fixture = createApprovedIncidentFixture({ incorporatedIssues: required });
  assert.equal(fixture.convergenceIssueState, 'Done');
  assert.equal(fixture.nativeParentIssueNumber, null);
  assert.equal(fixture.authority.convergenceIssue, 1381);
  const terminal = Object.fromEntries(
    required.map((issueNumber) => [
      issueNumber,
      {
        issueState: 'CLOSED',
        issueStateReason: 'COMPLETED',
        boardState: 'Done',
        disposition: 'Incorporated',
      },
    ])
  );
  const pending = structuredClone(terminal);
  pending[1384] = { issueState: 'OPEN', boardState: 'Review', disposition: '' };
  assert.throws(
    () =>
      authorizeIncidentEpicClose({
        repository: REPOSITORY,
        incidentIssue: 939,
        ownerRecords: fixture.ownerRecords,
        records: fixture.records,
        liveOutcomes: pending,
      }),
    /incident-epic-close:pending:1384/
  );
  const result = authorizeIncidentEpicClose({
    repository: REPOSITORY,
    incidentIssue: 939,
    ownerRecords: fixture.ownerRecords,
    records: fixture.records,
    liveOutcomes: terminal,
  });
  assert.equal(result.convergenceIssue, 1381);
  assert.deepEqual(result.requiredIssues, required);

  assert.throws(
    () =>
      authorizeIncidentEpicClose({
        repository: REPOSITORY,
        incidentIssue: 939,
        ownerRecords: fixture.ownerRecords,
        records: fixture.ownerRecords,
        liveOutcomes: terminal,
      }),
    /delivery-incident:/
  );
  const stale = structuredClone(fixture.records);
  const staleOwner = stale.find(
    ({ envelope }) => envelope.recordType === 'delivery-incident-ledger-owner'
  );
  staleOwner.envelope.payload.ledgerDigest = `sha256:${'9'.repeat(64)}`;
  assert.throws(
    () =>
      authorizeIncidentEpicClose({
        repository: REPOSITORY,
        incidentIssue: 939,
        ownerRecords: [staleOwner],
        records: stale,
        liveOutcomes: terminal,
      }),
    /(?:delivery-incident|aitm-record):/
  );
});
