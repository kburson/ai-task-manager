// @story #1787 #1799
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { parsedDeliveryRecords, runDeliver } from '../../../task-tracker/verbs/deliver.mjs';
import {
  requireDeliveryReceipt,
  verifyCloseDeliveryReceipt,
} from '../../../task-tracker/lib/close-delivery-receipt.mjs';
import { projectDeliveryRecords } from '../../../task-tracker/lib/delivery-records.mjs';
import { createWorkflowExceptionEnvelope } from '../../../task-tracker/lib/workflow-policy/exception-record.mjs';
import { buildDeliveryScope } from '../../../task-tracker/lib/workflow-policy/delivery-scope.mjs';
import { computeScopeIdentity } from '../../../task-tracker/lib/workflow-policy/scope-identity.mjs';
import { renderAitmRecord } from '../../../task-tracker/lib/github-records/record-envelope.mjs';
import { createMemoryJournal } from '../../unit/task-tracker/lib/delivery-waiver-consumption-fixtures.mjs';
import { HEAD, makeHarness, cfg } from '../../unit/task-tracker/verbs/deliver-test-harness.mjs';
import { runClose } from '../../helpers/close-convergence-wiring-helpers.mjs';
import { reusedBranchDeliveryBody } from '../../helpers/reused-branch-delivery-harness.mjs';
import { formatCloseDeliveryDisclosure } from '../../../task-tracker/verbs/close.mjs';

const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const issueNumber = 1784;
const prNumber = 1785;
const operationId = '01M2H000000000000000000001';
const body = [
  '## User Story',
  'As an operator, I can deliver a merged PR.',
  '',
  '## Scope',
  'One governed delivery.',
  '',
  '## Acceptance Criteria',
  '- [ ] The receipt is truthful.',
].join('\n');

function fixture() {
  const harness = makeHarness({
    issueNumber,
    prNumber,
    issueBody: body,
    branch: 'feature/child/1784',
    commitSubjects: ['[#1784] Deliver governed story'],
    historyMergeMethod: 'merge',
    prMergeMethod: 'merge',
    sessionId: 'session-1784',
    now: '2026-08-22T14:02:00.000Z',
    waiverServerTimes: { intent: '2026-08-22T14:02:01.000Z', receipt: '2026-08-22T14:02:02.000Z' },
  });
  const journal = createMemoryJournal({ repository: cfg().repo, issue: issueNumber });
  const input = () => ({
    issueNumber,
    cfg: cfg(),
    state: { active: '#1784', entryStartTs: '2026-08-22T13:00:00.000Z' },
    deps: harness.deps,
  });
  return { harness, journal, input };
}

async function prepare(f) {
  const pending = await runDeliver(f.input());
  assert.equal(pending.status, 'action-required');
  f.harness.data.prState = 'MERGED';
  return pending;
}

function addGrant(
  f,
  {
    selectedOperationId = operationId,
    exceptionId = 'delivery-1784',
    recordId = '01M2H000000000000000000004',
    grantId = '01M2H000000000000000000005',
  } = {}
) {
  const scope = buildDeliveryScope({
    schema: 'aitm.delivery-exception-scope/v1',
    repository: cfg().repo,
    issue: issueNumber,
    exceptionKind: 'delivery.invariant-waiver',
    pullRequest: prNumber,
    acceptedHeadSha: HEAD,
    baseRef: 'trunk',
    resolvedTrunkRef: 'origin/trunk',
    requirementId: 'delivery.verification.merge-method',
    deliveryOperationId: selectedOperationId,
  });
  const grant = createWorkflowExceptionEnvelope({
    schema: 'aitm.workflow-exception/v2',
    repository: cfg().repo,
    issue: issueNumber,
    exceptionId,
    revision: 1,
    status: 'active',
    scopeIdentity: computeScopeIdentity({ repository: cfg().repo, issue: issueNumber, body }),
    requirementIds: [scope.scope.requirementId],
    constraints: [],
    reason: 'Accept the verified merge method divergence for this exact delivery.',
    authorization: {
      origin: 'codex-session-transcript',
      principal: 'operator',
      recordingActor: 'kpburson',
      reference: 'codex://sessions/session/messages/message',
      statement: 'I approve this exact delivery waiver.',
      verificationLevel: 'host-verified-user-message',
    },
    expiresAt: '2026-08-23T00:00:00.000Z',
    operationId: digest('record-write'),
    createdAt: '2026-08-22T14:00:30.000Z',
    recordId,
    grantId,
    scopeKind: 'delivery',
    deliveryScope: scope.scope,
    waiverScopeDigest: scope.waiverScopeDigest,
  });
  f.harness.data.comments.push({
    id: `grant-${selectedOperationId}`,
    body: renderAitmRecord({ envelope: grant }),
    createdAt: grant.createdAt,
    updatedAt: grant.createdAt,
  });
  f.harness.deps.createDeliveryWaiverJournal = () => f.journal;
  f.harness.deps.resolveTranscriptPath = () => '/fixture/transcript';
  f.harness.data.activeGrant = grant;
  f.harness.deps.resolveDeliveryWaiver = async ({ scope: current, scopeIdentity, now }) => {
    const active = f.harness.data.activeGrant;
    if (
      now >= active.payload.expiresAt ||
      current.deliveryOperationId !== selectedOperationId ||
      scopeIdentity !== active.payload.scopeIdentity
    ) {
      return { outcome: 'missing', grant: null };
    }
    return {
      outcome: 'waived',
      grant: active,
      waiverScopeDigest: active.payload.waiverScopeDigest,
      waiverReasonDigest: digest(active.payload.reason),
    };
  };
  f.harness.deps.verifyStoredDeliveryWaiverAuthority = async () => ({ verified: true });
  return grant;
}

test('no grant preserves the original merged method refusal without terminal writes', async () => {
  const f = fixture();
  await prepare(f);
  await assert.rejects(() => runDeliver(f.input()), /delivery-verification:merge-method/);
  assert.equal(f.harness.calls.createIssueComment, 1);
  assert.equal(f.journal.writes, 0);
});

test('exact grant produces one v3 intent, immutable burn, one v4 receipt, and idempotent retry', async () => {
  const f = fixture();
  await prepare(f);
  addGrant(f);
  const first = await runDeliver(f.input());
  assert.equal(first.status, 'delivered');
  assert.equal(first.action, null);
  assert.equal(first.intent.schema, 'aitm.delivery-intent/v3');
  assert.equal(first.receipt.schema, 'aitm.delivery-receipt/v4');
  assert.equal(first.receipt.result, 'waived');
  const operation = (await f.journal.read()).operations.get(operationId);
  assert.equal(operation.state, 'completed');
  assert.equal(operation.burnOid, first.receipt.burnOid);
  const posts = f.harness.calls.createIssueComment;
  const retry = await runDeliver(f.input());
  assert.equal(retry.action, null);
  assert.equal(
    [first, retry].filter(({ action }) => action?.mechanism === 'provider-action').length,
    0
  );
  assert.deepEqual(retry.receipt, first.receipt);
  assert.equal(f.harness.calls.createIssueComment, posts);
  assert.equal(f.harness.calls.terminalBoard, 0);
});

test('#1784/#1785 reaches the close receipt gate with merge method visibly waived', async () => {
  const f = fixture();
  await prepare(f);
  const grant = addGrant(f);
  const delivered = await runDeliver(f.input());
  const records = projectDeliveryRecords(
    parsedDeliveryRecords(f.harness.data.comments, {
      repository: cfg().repo,
      issueNumber,
      prNumber,
    })
  );
  const fetched = await f.harness.deps.fetchPullRequest({ prNumber });
  const pullRequest = { ...fetched, mergeCommitSha: fetched.mergeCommit.oid };
  const gateInput = {
    issueNumber,
    repository: cfg().repo,
    lineage: f.harness.data.lineage,
    branch: f.harness.data.branch,
    acceptedSha: HEAD,
    observedLocalHeadSha: HEAD,
    headRelation: 'current',
    pullRequests: [pullRequest],
    pullRequest,
    records,
  };
  const receiptGate = requireDeliveryReceipt(gateInput);
  assert.equal(receiptGate.receipt.result, 'waived');
  assert.equal(receiptGate.receipt.waivedRequirementId, 'delivery.verification.merge-method');
  const closed = await verifyCloseDeliveryReceipt({
    gateInput,
    receiptGate,
    testReceiptSha: HEAD,
    acceptedReviewSha: HEAD,
    deps: {
      attributingCommits: f.harness.deps.attributingCommits,
      fetchOriginTrunk: f.harness.deps.fetchOriginTrunk,
      inspectMergeCommit: f.harness.deps.inspectMergeCommit,
      isAncestor: f.harness.deps.isAncestor,
      readWaiverJournal: () => f.journal.read(),
      listWaiverRecords: async () => [{ envelope: grant, createdAt: grant.createdAt }],
      verifyStoredDeliveryWaiverAuthority: async () => ({ verified: true }),
      resolveDeliveryWaiver: () => {
        throw new Error('close queried current grant');
      },
    },
  });
  assert.equal(closed.receipt.result, 'waived');
  assert.deepEqual(closed.receipt, delivered.receipt);
  assert.equal(closed.receipt.waivedRequirementId, 'delivery.verification.merge-method');
  assert.equal(closed.receipt.deliveryDisposition, 'waived');
  assert.doesNotMatch(JSON.stringify(closed.receipt), /"deliveryDisposition":"passed"/);
  assert.match(formatCloseDeliveryDisclosure(closed.receipt), /merge-method waived/);
  const close = await runClose({
    issueNumber,
    repository: cfg().repo,
    body: reusedBranchDeliveryBody(HEAD),
    acceptedSha: HEAD,
    gateReviewToDone: false,
    force: true,
    closeSnapshot: { issueClosed: false, stateReason: null },
    deliveryGateInput: gateInput,
    useInjectedDeliveryReceipt: false,
    useInjectedFreshDeliveryVerification: false,
    deliveryVerificationDeps: {
      attributingCommits: f.harness.deps.attributingCommits,
      fetchOriginTrunk: f.harness.deps.fetchOriginTrunk,
      inspectMergeCommit: f.harness.deps.inspectMergeCommit,
      isAncestor: f.harness.deps.isAncestor,
      readCloseWaiverJournal: () => f.journal.read(),
      listCloseWaiverRecords: async () => [{ envelope: grant, createdAt: grant.createdAt }],
      resolveCloseTranscriptPath: () => '/fixture/transcript',
    },
    contextOverrides: {
      verifyCloseDeliveryReceipt: ({
        gateInput: current,
        receiptGate,
        testReceiptSha,
        acceptedReviewSha,
      }) =>
        verifyCloseDeliveryReceipt({
          gateInput: current,
          receiptGate,
          testReceiptSha,
          acceptedReviewSha,
          deps: {
            attributingCommits: f.harness.deps.attributingCommits,
            fetchOriginTrunk: f.harness.deps.fetchOriginTrunk,
            inspectMergeCommit: f.harness.deps.inspectMergeCommit,
            isAncestor: f.harness.deps.isAncestor,
            readWaiverJournal: () => f.journal.read(),
            listWaiverRecords: async () => [{ envelope: grant, createdAt: grant.createdAt }],
            verifyStoredDeliveryWaiverAuthority: async () => ({ verified: true }),
          },
        }),
    },
  });
  assert.equal(close.exitCode, 0);
  assert.equal(close.calls.movesToDone.length, 1);
  assert.equal(close.calls.issueCloses, 1);
});

test('grant expiry after v3 intent readback refuses the burn and leaves no receipt', async () => {
  const f = fixture();
  await prepare(f);
  addGrant(f);
  const readComments = f.harness.deps.listIssueComments;
  f.harness.deps.listIssueComments = async (input) => {
    const result = await readComments(input);
    if (result.some(({ body: item }) => item.includes('aitm.delivery-intent/v3'))) {
      f.harness.data.now = '2026-08-23T00:00:01.000Z';
    }
    return result;
  };

  await assert.rejects(() => runDeliver(f.input()), /delivery-waiver-authority/);
  const operation = (await f.journal.read()).operations.get(operationId);
  assert.equal(operation.state, 'intent-confirmed');
  assert.equal(operation.burn, null);
  assert.equal(
    f.harness.data.comments.filter(({ body: item }) =>
      item.startsWith('<!-- aitm-delivery-receipt ')
    ).length,
    0
  );
});

test('revocation observed at the effect boundary leaves the confirmed intent unburned', async () => {
  const f = fixture();
  await prepare(f);
  addGrant(f);
  const originalResolve = f.harness.deps.resolveDeliveryWaiver;
  let resolutions = 0;
  f.harness.deps.resolveDeliveryWaiver = async (input) => {
    resolutions++;
    return resolutions <= 2 ? originalResolve(input) : { outcome: 'missing', grant: null };
  };
  await assert.rejects(() => runDeliver(f.input()), /delivery-waiver-authority/);
  assert.equal((await f.journal.read()).operations.get(operationId).state, 'intent-confirmed');
  assert.equal(
    f.harness.data.comments.filter(({ body: item }) =>
      item.startsWith('<!-- aitm-delivery-receipt ')
    ).length,
    0
  );
});

test('two independent verification failures refuse before intent reservation', async () => {
  const f = fixture();
  await prepare(f);
  addGrant(f);
  const inspect = f.harness.deps.inspectMergeCommit;
  f.harness.deps.inspectMergeCommit = async (input) => ({
    ...(await inspect(input)),
    commitMessage: 'unauthorized merge bytes',
  });
  await assert.rejects(() => runDeliver(f.input()), /merge-commit-bytes/);
  assert.equal(f.journal.writes, 0);
  assert.equal(
    f.harness.data.comments.filter(({ body: item }) =>
      item.startsWith('<!-- aitm-delivery-receipt ')
    ).length,
    0
  );
});

test('scope drift before intent reservation prevents any journal write', async () => {
  const f = fixture();
  await prepare(f);
  addGrant(f);
  const fetch = f.harness.deps.fetchIssue;
  let reads = 0;
  f.harness.deps.fetchIssue = async (input) => {
    reads++;
    if (reads === 3)
      f.harness.data.issueBody = body.replace(
        'One governed delivery.',
        'A changed delivery scope.'
      );
    return fetch(input);
  };
  await assert.rejects(() => runDeliver(f.input()), /delivery-waiver-authority/);
  assert.equal(f.journal.writes, 0);
});

test('fresh approval after pre-reservation issue re-scoping selects the revised grant', async () => {
  const f = fixture();
  await prepare(f);
  const prior = addGrant(f);
  const fetch = f.harness.deps.fetchIssue;
  let reads = 0;
  f.harness.deps.fetchIssue = async (input) => {
    reads++;
    if (reads === 3) {
      f.harness.data.issueBody = body.replace(
        'One governed delivery.',
        'An approved refined delivery scope.'
      );
      const revised = createWorkflowExceptionEnvelope({
        schema: 'aitm.workflow-exception/v2',
        repository: cfg().repo,
        issue: issueNumber,
        exceptionId: 'delivery-1784',
        revision: 2,
        status: 'active',
        scopeIdentity: computeScopeIdentity({
          repository: cfg().repo,
          issue: issueNumber,
          body: f.harness.data.issueBody,
        }),
        requirementIds: prior.payload.requirementIds,
        constraints: [],
        reason: prior.payload.reason,
        authorization: {
          ...prior.payload.approvalEvidence,
          reference: 'codex://sessions/session/messages/new-approval',
        },
        expiresAt: prior.payload.expiresAt,
        operationId: digest('revised-write'),
        predecessor: prior.recordId,
        supersedes: prior.recordId,
        createdAt: '2026-08-22T14:01:30.000Z',
        recordId: '01M2H000000000000000000006',
        grantId: '01M2H000000000000000000007',
        scopeKind: 'delivery',
        deliveryScope: prior.payload.deliveryScope,
        waiverScopeDigest: prior.payload.waiverScopeDigest,
      });
      f.harness.data.comments.push({
        id: 'revised-grant-1784',
        body: renderAitmRecord({ envelope: revised }),
        createdAt: revised.createdAt,
        updatedAt: revised.createdAt,
      });
      f.harness.data.activeGrant = revised;
    }
    return fetch(input);
  };
  const completed = await runDeliver(f.input());
  assert.equal(completed.intent.waiverRevision, 2);
  assert.equal(completed.receipt.waiverRecordId, '01M2H000000000000000000006');
  assert.equal((await f.journal.read()).operations.get(operationId).state, 'completed');
});

test('scope drift after v3 readback leaves approval unburned and no receipt', async () => {
  const f = fixture();
  await prepare(f);
  addGrant(f);
  const create = f.harness.deps.createIssueComment;
  f.harness.deps.createIssueComment = async (input) => {
    const result = await create(input);
    if (input.body.startsWith('<!-- aitm-delivery-intent ')) {
      f.harness.data.issueBody = body.replace(
        'One governed delivery.',
        'A changed delivery scope.'
      );
    }
    return result;
  };
  await assert.rejects(() => runDeliver(f.input()), /authority-drift/);
  assert.equal((await f.journal.read()).operations.get(operationId).state, 'intent-confirmed');
  assert.equal(
    f.harness.data.comments.filter(({ body: item }) =>
      item.startsWith('<!-- aitm-delivery-receipt ')
    ).length,
    0
  );
});

test('confirmed burn and receipt remain replayable after the grant expires', async () => {
  const f = fixture();
  await prepare(f);
  addGrant(f);
  const first = await runDeliver(f.input());
  f.harness.data.now = '2026-08-24T00:00:00.000Z';
  const retry = await runDeliver(f.input());
  assert.equal(retry.status, 'already-delivered');
  assert.deepEqual(retry.receipt, first.receipt);
});

test('advanced local HEAD still replays the pinned v4 receipt without publication', async () => {
  const f = fixture();
  await prepare(f);
  addGrant(f);
  const first = await runDeliver(f.input());
  const posts = f.harness.calls.createIssueComment;
  f.harness.data.prHead = HEAD;
  f.harness.data.head = 'b'.repeat(40);
  const retry = await runDeliver(f.input());
  assert.equal(retry.status, 'already-delivered');
  assert.equal(retry.mode, 'historical-recovery');
  assert.deepEqual(retry.receipt, first.receipt);
  assert.equal(f.harness.calls.createIssueComment, posts);
});

test('advanced local HEAD resumes an exact confirmed burn before receipt publication', async () => {
  const f = fixture();
  await prepare(f);
  addGrant(f);
  const inspect = f.harness.deps.inspectMergeCommit;
  let inspections = 0;
  f.harness.deps.inspectMergeCommit = async (input) => {
    inspections++;
    if (inspections === 5) throw new Error('verification interrupted after burn');
    return inspect(input);
  };
  await assert.rejects(() => runDeliver(f.input()), /merge-method-evidence/);
  assert.equal((await f.journal.read()).operations.get(operationId).state, 'burned');
  f.harness.deps.inspectMergeCommit = inspect;
  f.harness.data.prHead = HEAD;
  f.harness.data.head = 'b'.repeat(40);
  const completed = await runDeliver(f.input());
  assert.equal(completed.status, 'delivered');
  assert.equal(completed.receipt.result, 'waived');
  assert.equal((await f.journal.read()).operations.get(operationId).state, 'completed');
});

test('completed receipt uses pinned provider observation when retry read omits it', async () => {
  const f = fixture();
  await prepare(f);
  addGrant(f);
  const first = await runDeliver(f.input());
  f.harness.data.prMergeMethod = null;
  const retry = await runDeliver(f.input());
  assert.equal(retry.status, 'already-delivered');
  assert.deepEqual(retry.receipt, first.receipt);
});

test('revocation recorded after the burn leaves the historical receipt verifiable', async () => {
  const f = fixture();
  await prepare(f);
  const grant = addGrant(f);
  const first = await runDeliver(f.input());
  const revoked = createWorkflowExceptionEnvelope({
    schema: 'aitm.workflow-exception/v2',
    repository: cfg().repo,
    issue: issueNumber,
    exceptionId: 'delivery-1784',
    revision: 2,
    status: 'revoked',
    scopeIdentity: grant.payload.scopeIdentity,
    requirementIds: grant.payload.requirementIds,
    constraints: [],
    reason: 'Revoke this delivery waiver after the confirmed delivery receipt.',
    authorization: grant.payload.approvalEvidence,
    expiresAt: grant.payload.expiresAt,
    operationId: digest('revoke-write'),
    predecessor: grant.recordId,
    supersedes: grant.recordId,
    createdAt: '2026-08-22T14:03:00.000Z',
    recordId: '01M2H000000000000000000006',
    grantId: '01M2H000000000000000000007',
    scopeKind: 'delivery',
    deliveryScope: grant.payload.deliveryScope,
    waiverScopeDigest: grant.payload.waiverScopeDigest,
  });
  f.harness.data.comments.push({
    id: 'revocation-1784',
    body: renderAitmRecord({ envelope: revoked }),
    createdAt: revoked.createdAt,
    updatedAt: revoked.createdAt,
  });
  f.harness.data.now = '2026-08-22T14:04:00.000Z';
  const retry = await runDeliver(f.input());
  assert.equal(retry.status, 'already-delivered');
  assert.deepEqual(retry.receipt, first.receipt);
});

test('unresolved receipt publication burns approval and never posts on retry', async () => {
  const f = fixture();
  await prepare(f);
  addGrant(f);
  const create = f.harness.deps.createIssueComment;
  let refusedPosts = 0;
  f.harness.deps.createIssueComment = async (input) => {
    if (input.body.startsWith('<!-- aitm-delivery-receipt ')) {
      refusedPosts++;
      throw new Error('transport uncertainty');
    }
    return create(input);
  };
  await assert.rejects(
    () => runDeliver(f.input()),
    (error) => error.category === 'delivery-waiver-ambiguity' && error.outcome === 'indeterminate'
  );
  assert.equal((await f.journal.read()).operations.get(operationId).state, 'receipt-requesting');
  await assert.rejects(() => runDeliver(f.input()), /delivery-waiver-ambiguity/);
  assert.equal(refusedPosts, 1);
});

test('two concurrent deliver contenders project one v3 successor and one burn', async () => {
  const f = fixture();
  await prepare(f);
  addGrant(f);
  const append = f.journal.compareAndAppend.bind(f.journal);
  let casQueue = Promise.resolve();
  f.journal.compareAndAppend = (input) => {
    const next = casQueue.then(() => append(input));
    casQueue = next.catch(() => {});
    return next;
  };
  const originalResolve = f.harness.deps.resolveDeliveryWaiver;
  let waiting = [];
  f.harness.deps.resolveDeliveryWaiver = async (input) => {
    if (waiting !== null) {
      const slot = new Promise((resolve) => waiting.push(resolve));
      if (waiting.length === 2) {
        const release = waiting;
        waiting = null;
        release.forEach((resolve) => resolve());
      }
      await slot;
    }
    return originalResolve(input);
  };
  const outcomes = await Promise.allSettled([runDeliver(f.input()), runDeliver(f.input())]);
  assert.equal(
    outcomes.filter(({ status }) => status === 'fulfilled').length,
    1,
    outcomes.map(({ status, reason }) => `${status}:${reason?.message}`).join(', ')
  );
  assert.match(
    outcomes.find(({ status }) => status === 'rejected').reason.message,
    /delivery-waiver-replay/
  );
  const projection = projectDeliveryRecords(
    parsedDeliveryRecords(f.harness.data.comments, {
      repository: cfg().repo,
      issueNumber,
      prNumber,
    })
  );
  assert.equal(
    projection.intents.filter(({ record }) => record.schema === 'aitm.delivery-intent/v3').length,
    1
  );
  assert.equal(
    projection.receipts.filter(({ record }) => record.schema === 'aitm.delivery-receipt/v4').length,
    1
  );
  assert.equal((await f.journal.read()).operations.get(operationId).state, 'completed');
});

test('lost v3 intent response is resolved from exact comment readback', async () => {
  const f = fixture();
  await prepare(f);
  addGrant(f);
  const create = f.harness.deps.createIssueComment;
  let lost = false;
  f.harness.deps.createIssueComment = async (input) => {
    const result = await create(input);
    if (!lost && input.body.startsWith('<!-- aitm-delivery-intent ')) {
      lost = true;
      throw new Error('response lost after accepted write');
    }
    return result;
  };
  const first = await runDeliver(f.input());
  assert.equal(first.receipt.result, 'waived');
  assert.equal(lost, true);
  assert.equal((await f.journal.read()).operations.get(operationId).state, 'completed');
});

test('another host completing v4 between intent confirmation and readback is adopted exactly', async () => {
  const f = fixture();
  await prepare(f);
  addGrant(f);
  const append = f.journal.compareAndAppend.bind(f.journal);
  let releaseFirst;
  const released = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  let confirmedFirst;
  const confirmation = new Promise((resolve) => {
    confirmedFirst = resolve;
  });
  let intercepted = false;
  f.journal.compareAndAppend = async (input) => {
    const result = await append(input);
    if (!intercepted && input.entry.state === 'intent-confirmed') {
      intercepted = true;
      confirmedFirst();
      await released;
    }
    return result;
  };
  const firstRun = runDeliver(f.input());
  await confirmation;
  const second = await runDeliver(f.input());
  assert.equal(second.receipt.result, 'waived');
  const posts = f.harness.calls.createIssueComment;
  releaseFirst();
  const first = await firstRun;
  assert.equal(first.status, 'already-delivered');
  assert.deepEqual(first.receipt, second.receipt);
  assert.equal(f.harness.calls.createIssueComment, posts);
});

test('two authorized operations naming one predecessor refuse before either reserves it', async () => {
  const f = fixture();
  await prepare(f);
  const grant = addGrant(f);
  const secondScope = buildDeliveryScope({
    ...grant.payload.deliveryScope,
    deliveryOperationId: '01M2H000000000000000000008',
  });
  const second = createWorkflowExceptionEnvelope({
    schema: 'aitm.workflow-exception/v2',
    repository: cfg().repo,
    issue: issueNumber,
    exceptionId: 'delivery-1784-second',
    revision: 1,
    status: 'active',
    scopeIdentity: grant.payload.scopeIdentity,
    requirementIds: grant.payload.requirementIds,
    constraints: [],
    reason: 'Accept the same divergence under a second operation.',
    authorization: grant.payload.approvalEvidence,
    expiresAt: grant.payload.expiresAt,
    operationId: digest('second-write'),
    createdAt: '2026-08-22T14:00:31.000Z',
    recordId: '01M2H000000000000000000009',
    grantId: '01M2H000000000000000000010',
    scopeKind: 'delivery',
    deliveryScope: secondScope.scope,
    waiverScopeDigest: secondScope.waiverScopeDigest,
  });
  f.harness.data.comments.push({
    id: 'grant-1784-second',
    body: renderAitmRecord({ envelope: second }),
    createdAt: second.createdAt,
    updatedAt: second.createdAt,
  });
  await assert.rejects(() => runDeliver(f.input()), /delivery-waiver-ambiguity/);
  assert.equal(f.journal.writes, 0);
  assert.equal(
    f.harness.data.comments.filter(({ body: item }) =>
      item.startsWith('<!-- aitm-delivery-intent ')
    ).length,
    1
  );
});

test('stale per-host grant views for distinct operations still reserve one predecessor', async () => {
  const a = fixture();
  await prepare(a);
  addGrant(a);
  const b = fixture();
  b.harness.data.comments = structuredClone(
    a.harness.data.comments.filter(({ body: item }) =>
      item.startsWith('<!-- aitm-delivery-intent ')
    )
  );
  b.harness.data.prState = 'MERGED';
  const otherOperation = '01M2H000000000000000000008';
  addGrant(b, {
    selectedOperationId: otherOperation,
    exceptionId: 'delivery-1784-other',
    recordId: '01M2H000000000000000000009',
    grantId: '01M2H000000000000000000010',
  });
  b.harness.deps.createDeliveryWaiverJournal = () => a.journal;
  b.harness.deps.createIntentId = () => '01ARZ3NDEKTSV4RRFFQ69G5FAX';
  const append = a.journal.compareAndAppend.bind(a.journal);
  let queue = Promise.resolve();
  a.journal.compareAndAppend = (input) => {
    const next = queue.then(() => append(input));
    queue = next.catch(() => {});
    return next;
  };
  let waiting = [];
  for (const f of [a, b]) {
    const resolveGrant = f.harness.deps.resolveDeliveryWaiver;
    f.harness.deps.resolveDeliveryWaiver = async (input) => {
      if (waiting !== null) {
        const slot = new Promise((resolve) => waiting.push(resolve));
        if (waiting.length === 2) {
          const release = waiting;
          waiting = null;
          release.forEach((resolve) => resolve());
        }
        await slot;
      }
      return resolveGrant(input);
    };
  }
  const results = await Promise.allSettled([runDeliver(a.input()), runDeliver(b.input())]);
  assert.equal(
    results.filter(({ status }) => status === 'fulfilled').length,
    1,
    results.map(({ status, reason }) => `${status}:${reason?.message}`).join(', ')
  );
  assert.match(
    results.find(({ status }) => status === 'rejected').reason.message,
    /delivery-waiver-replay/
  );
  const successorCount = [a, b].reduce(
    (count, f) =>
      count +
      f.harness.data.comments.filter(
        ({ body: item }) =>
          item.startsWith('<!-- aitm-delivery-intent ') && item.includes('aitm.delivery-intent/v3')
      ).length,
    0
  );
  assert.equal(successorCount, 1);
  assert.equal((await a.journal.read()).originalIntentOwners.size, 1);
});
