// @story #1381
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  approveIncidentLedger,
  observeIncidentLedgerLive,
  readIssueDeliveryAuthority,
  recordIncidentLedger,
  resolveApprovedIncidentLedger,
  validateRecordableIncidentLedger,
  verifyIncidentLedgerPhase,
} from '../../../../task-tracker/lib/delivery-incident-reconciliation.mjs';
import {
  createVerificationReceipt,
  upsertVerificationReceipt,
} from '../../../../task-tracker/lib/verification-receipt.mjs';
import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
  renderDeliveryIntentComment,
  renderDeliveryReceiptComment,
} from '../../../../task-tracker/lib/delivery-records.mjs';

const approvedPayload = Object.freeze({
  repository: 'kburson/ai-task-manager',
  incidentIssue: 939,
  convergenceIssue: 1381,
  ledgerId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  baselineTrunkSha: 'a'.repeat(40),
  rows: Object.freeze([
    Object.freeze({ issueNumber: 1381, intendedOutcome: 'convergence-owner' }),
    Object.freeze({ issueNumber: 1403, intendedOutcome: 'incorporated' }),
  ]),
});

test('issue delivery authority rejects malformed and contradictory accepted-SHA claims', () => {
  assert.deepEqual(readIssueDeliveryAuthority('', { expectedIssue: 1403 }), {
    acceptedSha: null,
    approvalMode: null,
    approvalSha: null,
  });
  assert.throws(
    () =>
      readIssueDeliveryAuthority(
        '<!-- aitm-verification-receipt stage="test" data="not-valid-evidence" -->',
        { expectedIssue: 1403 }
      ),
    /delivery-incident:stale-observation/
  );

  const reviewHead = 'b'.repeat(40);
  const reviewReceipt = createVerificationReceipt({
    issueNumber: 1403,
    stage: 'review',
    fingerprint: {
      commitSha: reviewHead,
      environment: {
        node: 'v22.0.0',
        platform: 'darwin-arm64',
        lockfileHash: `sha256:${'c'.repeat(64)}`,
        configHashes: {},
        sandbox: { kind: 'worktree', identity: '/tmp/task-1403', clean: true },
      },
    },
    commands: [
      {
        classification: 'review-probe',
        command: 'npm',
        args: ['test'],
        exitCode: 0,
        durationMs: 1,
      },
    ],
    now: '2026-08-28T00:01:00.000Z',
  });
  const contradictory = upsertVerificationReceipt(
    '<!-- aitm-test-started sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ts="2026-08-28T00:00:00.000Z" -->',
    reviewReceipt
  );
  assert.throws(
    () => readIssueDeliveryAuthority(contradictory, { expectedIssue: 1403 }),
    /delivery-incident:stale-observation/
  );

  const wrongIssueReceipt = createVerificationReceipt({
    issueNumber: 999,
    stage: 'review',
    fingerprint: {
      commitSha: reviewHead,
      environment: {
        node: 'v22.0.0',
        platform: 'darwin-arm64',
        lockfileHash: `sha256:${'c'.repeat(64)}`,
        configHashes: {},
        sandbox: { kind: 'worktree', identity: '/tmp/task-999', clean: true },
      },
    },
    commands: [
      {
        classification: 'review-probe',
        command: 'npm',
        args: ['test'],
        exitCode: 0,
        durationMs: 1,
      },
    ],
    now: '2026-08-28T00:02:00.000Z',
  });
  const copiedEvidence = upsertVerificationReceipt(
    `<!-- aitm-test-started sha="${reviewHead}" ts="2026-08-28T00:00:00.000Z" -->`,
    wrongIssueReceipt
  );
  assert.throws(
    () => readIssueDeliveryAuthority(copiedEvidence, { expectedIssue: 1403 }),
    /delivery-incident:stale-observation/
  );
});

function projection() {
  return {
    approvedLedger: { envelope: { payload: approvedPayload } },
    approvedLedgerApproval: {
      envelope: {
        recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAB',
        payload: { ledgerDigest: `sha256:${'b'.repeat(64)}` },
      },
    },
    approvedLedgerOwner: { envelope: { recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAC' } },
    approvedLedgerIncorporated: [],
  };
}

test('approved ledger resolution binds repository, convergence issue, and incident owner', () => {
  const result = resolveApprovedIncidentLedger({
    records: [],
    repository: approvedPayload.repository,
    convergenceIssue: 1381,
    incidentIssue: 939,
    deps: { projectDeliveryIncidentRecords: projection },
  });
  assert.equal(result.ledgerId, approvedPayload.ledgerId);
  assert.equal(result.ownerRecordId, '01ARZ3NDEKTSV4RRFFQ69G5FAC');
  assert.throws(() =>
    resolveApprovedIncidentLedger({
      records: [],
      repository: 'other/repository',
      convergenceIssue: 1381,
      incidentIssue: 939,
      deps: { projectDeliveryIncidentRecords: projection },
    })
  );
  assert.throws(
    () =>
      resolveApprovedIncidentLedger({
        records: [],
        repository: approvedPayload.repository,
        convergenceIssue: 1381,
        incidentIssue: 939,
        deps: {
          projectDeliveryIncidentRecords: () => {
            throw new Error('delivery-incident:reviewed-set');
          },
        },
      }),
    /delivery-incident:extra-row/
  );
});

test('phase-aware verifier is read-only and distinguishes pending from terminal outcomes', async () => {
  let writes = 0;
  const authority = resolveApprovedIncidentLedger({
    records: [],
    repository: approvedPayload.repository,
    convergenceIssue: 1381,
    incidentIssue: 939,
    deps: { projectDeliveryIncidentRecords: projection },
  });
  const observeRows = async () => [
    { issueNumber: 1381, observationMatches: true, terminalMatches: false, evidence: ['owner'] },
    { issueNumber: 1403, observationMatches: true, terminalMatches: false, evidence: ['carrier'] },
  ];
  const preClose = await verifyIncidentLedgerPhase({
    authority,
    phase: 'pre-close',
    verifiedTrunkSha: 'c'.repeat(40),
    deps: {
      observeRows,
      verifyPreCloseTopology: async () => true,
      write: () => (writes += 1),
    },
  });
  assert.equal(preClose.ok, true);
  assert.equal(preClose.outcomes[0].status, 'pending-authorized');
  assert.equal(preClose.outcomes[1].status, 'pending-authorized');
  assert.equal(writes, 0);

  await assert.rejects(
    verifyIncidentLedgerPhase({
      authority,
      phase: 'terminal',
      verifiedTrunkSha: 'c'.repeat(40),
      deps: { observeRows, write: () => (writes += 1) },
    }),
    /stale-observation/
  );
  assert.equal(writes, 0);

  const terminalRows = async () => [
    {
      issueNumber: 1381,
      observationMatches: true,
      terminalMatches: true,
      outcomeEvidenceMatches: true,
      evidence: ['receipt'],
    },
    {
      issueNumber: 1403,
      observationMatches: true,
      terminalMatches: true,
      outcomeEvidenceMatches: true,
      evidence: ['incorporated'],
    },
  ];
  await assert.rejects(
    verifyIncidentLedgerPhase({
      authority,
      phase: 'terminal',
      verifiedTrunkSha: 'c'.repeat(40),
      deps: { observeRows: terminalRows },
    }),
    /stale-observation/
  );
  const terminal = await verifyIncidentLedgerPhase({
    authority,
    phase: 'terminal',
    verifiedTrunkSha: 'c'.repeat(40),
    deps: {
      observeRows: terminalRows,
      verifyTerminalAuthority: async () => true,
      write: () => (writes += 1),
    },
  });
  assert.equal(terminal.ok, true);
  assert.equal(writes, 0);
});

test('record mode validates live observation before one exact append and recovers lost response', async () => {
  const payload = {
    ledgerId: approvedPayload.ledgerId,
    repository: approvedPayload.repository,
    convergenceIssue: 1381,
  };
  const envelope = {
    recordId: payload.ledgerId,
    recordType: 'delivery-incident-ledger',
    payload,
  };
  const records = [];
  let observed = 0;
  let appends = 0;
  const deps = {
    buildIncidentLedgerPayload: (value) => Object.freeze(value),
    observeLedger: async () => {
      observed += 1;
      return payload;
    },
    createLedgerEnvelope: () => envelope,
    renderIncidentRecord: () => 'body',
    projectDeliveryIncidentRecords: () => ({}),
    listConvergenceRecords: async () => records,
    appendConvergenceRecord: async () => {
      appends += 1;
      records.push({ id: 'comment', envelope });
      throw new Error('transport-lost');
    },
    hashRecordPayload: () => `sha256:${'d'.repeat(64)}`,
  };
  const result = await recordIncidentLedger({
    repository: payload.repository,
    convergenceIssue: 1381,
    payload,
    deps,
  });
  assert.equal(result.status, 'recorded');
  assert.equal(observed, 1);
  assert.equal(appends, 1);

  const replay = await recordIncidentLedger({
    repository: payload.repository,
    convergenceIssue: 1381,
    payload,
    deps,
  });
  assert.equal(replay.status, 'already-recorded');
  assert.equal(appends, 1);
});

test('recordable ledger requires complete carrier evidence for every Incorporated outcome', () => {
  const row = {
    issueNumber: 1384,
    intendedOutcome: 'incorporated',
    prNumber: null,
    prHeadSha: null,
    mergeSha: null,
    codeOnTrunk: false,
    codeOnTrunkBasis: 'shared-carrier',
    blocker: 'issue-local delivery provenance absent for #1384',
  };
  assert.throws(
    () => validateRecordableIncidentLedger({ rows: [row] }),
    /delivery-incident:incomplete-incorporated-carrier/
  );
  assert.equal(
    validateRecordableIncidentLedger({
      rows: [
        {
          ...row,
          prNumber: 1385,
          prHeadSha: 'a'.repeat(40),
          mergeSha: 'b'.repeat(40),
          codeOnTrunk: true,
        },
      ],
    }).rows[0].prNumber,
    1385
  );
});

test('approval authenticates first and completes approval plus incident owner after interruption', async () => {
  const ledgerEnvelope = {
    recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAA',
    recordType: 'delivery-incident-ledger',
    payload: {
      ...approvedPayload,
      schema: 'aitm.delivery-incident-ledger/v1',
    },
  };
  const convergenceRecords = [{ id: 'ledger-comment', envelope: ledgerEnvelope }];
  const ownerRecords = [];
  const order = [];
  const digest = `sha256:${'e'.repeat(64)}`;
  let ownerAttempts = 0;
  const deps = {
    authenticate: async () => {
      order.push('authenticate');
      return { login: 'kpburson' };
    },
    listConvergenceRecords: async () => convergenceRecords,
    listOwnerRecords: async () => ownerRecords,
    hashRecordPayload: () => digest,
    buildIncidentLedgerApprovalGrantPayload: (value) => Object.freeze(value),
    buildIncidentLedgerApprovalPayload: (value) => Object.freeze(value),
    buildIncidentLedgerOwnerPayload: (value) => Object.freeze(value),
    createApprovalGrantEnvelope: ({ payload }) => ({
      recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAD',
      recordType: 'delivery-incident-ledger-approval-grant',
      payload,
    }),
    createApprovalEnvelope: ({ payload }) => ({
      recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAB',
      recordType: 'delivery-incident-ledger-approval',
      payload,
    }),
    createOwnerEnvelope: ({ payload }) => ({
      recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAC',
      recordType: 'delivery-incident-ledger-owner',
      payload,
    }),
    renderIncidentRecord: () => 'body',
    projectDeliveryIncidentRecords: (records) => ({
      approvedLedgerOwner: records.find(
        ({ envelope }) => envelope.recordType === 'delivery-incident-ledger-owner'
      ),
    }),
    appendConvergenceRecord: async ({ envelope }) => {
      const isGrant = envelope.recordType.endsWith('-grant');
      order.push(isGrant ? 'approval-grant' : 'approval');
      convergenceRecords.push({
        id: isGrant ? 'grant-comment' : 'approval-comment',
        envelope,
        authorLogin: 'kpburson',
        createdAt: isGrant ? '2026-08-28T00:00:00.000Z' : '2026-08-28T00:00:01.000Z',
        updatedAt: isGrant ? '2026-08-28T00:00:00.000Z' : '2026-08-28T00:00:01.000Z',
      });
      return convergenceRecords.at(-1);
    },
    appendOwnerRecord: async ({ envelope }) => {
      order.push('owner');
      ownerAttempts += 1;
      ownerRecords.push({ id: 'owner-comment', envelope });
      if (ownerAttempts === 1) throw new Error('transport-lost');
      return ownerRecords.at(-1);
    },
  };
  const result = await approveIncidentLedger({
    repository: approvedPayload.repository,
    convergenceIssue: 1381,
    ledgerId: approvedPayload.ledgerId,
    ledgerDigest: digest,
    deps,
  });
  assert.equal(result.status, 'approved');
  assert.deepEqual(order, ['authenticate', 'approval-grant', 'approval', 'owner']);
  assert.equal(ownerAttempts, 1);

  const replay = await approveIncidentLedger({
    repository: approvedPayload.repository,
    convergenceIssue: 1381,
    ledgerId: approvedPayload.ledgerId,
    ledgerDigest: digest,
    deps,
  });
  assert.equal(replay.status, 'already-approved');
  assert.equal(ownerAttempts, 1);
});

test('approval refuses a divergent owner graph before any approval-side write', async () => {
  const digest = `sha256:${'e'.repeat(64)}`;
  const ledgerEnvelope = {
    recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAA',
    recordType: 'delivery-incident-ledger',
    payload: { ...approvedPayload, schema: 'aitm.delivery-incident-ledger/v1' },
  };
  const ownerRecords = [
    {
      id: 'owner-a',
      envelope: {
        recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAC',
        recordType: 'delivery-incident-ledger-owner',
        supersedes: null,
        payload: {},
      },
    },
    {
      id: 'owner-b',
      envelope: {
        recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAD',
        recordType: 'delivery-incident-ledger-owner',
        supersedes: null,
        payload: {},
      },
    },
  ];
  let writes = 0;
  await assert.rejects(
    approveIncidentLedger({
      repository: approvedPayload.repository,
      convergenceIssue: 1381,
      ledgerId: approvedPayload.ledgerId,
      ledgerDigest: digest,
      deps: {
        authenticate: async () => ({ login: 'kpburson' }),
        listConvergenceRecords: async () => [{ id: 'ledger', envelope: ledgerEnvelope }],
        listOwnerRecords: async () => ownerRecords,
        appendConvergenceRecord: async () => (writes += 1),
        appendOwnerRecord: async () => (writes += 1),
        hashRecordPayload: () => digest,
      },
    }),
    /ambiguous-authority/
  );
  assert.equal(writes, 0);
});

test('replacement approval resumes on a second invocation after owner write was interrupted', async () => {
  const digest = `sha256:${'e'.repeat(64)}`;
  const oldApprovalId = '01ARZ3NDEKTSV4RRFFQ69G5FA0';
  const oldOwnerId = '01ARZ3NDEKTSV4RRFFQ69G5FA1';
  const convergenceRecords = [
    {
      id: 'old-approval',
      envelope: {
        recordId: oldApprovalId,
        recordType: 'delivery-incident-ledger-approval',
        supersedes: null,
        payload: { ledgerId: '01ARZ3NDEKTSV4RRFFQ69G5FA2' },
      },
    },
    {
      id: 'new-ledger',
      envelope: {
        recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAA',
        recordType: 'delivery-incident-ledger',
        payload: { ...approvedPayload, schema: 'aitm.delivery-incident-ledger/v1' },
      },
    },
  ];
  const ownerRecords = [
    {
      id: 'old-owner',
      envelope: {
        recordId: oldOwnerId,
        recordType: 'delivery-incident-ledger-owner',
        supersedes: null,
        payload: { approvalRecordId: oldApprovalId },
      },
    },
  ];
  let ownerAttempts = 0;
  const providerRecord = (id, envelope, second) => ({
    id,
    envelope,
    authorLogin: 'kpburson',
    createdAt: second,
    updatedAt: second,
  });
  const deps = {
    authenticate: async () => ({ login: 'kpburson' }),
    listConvergenceRecords: async () => convergenceRecords,
    listOwnerRecords: async () => ownerRecords,
    hashRecordPayload: () => digest,
    buildIncidentLedgerApprovalGrantPayload: (value) => Object.freeze(value),
    buildIncidentLedgerApprovalPayload: (value) => Object.freeze(value),
    buildIncidentLedgerOwnerPayload: (value) => Object.freeze(value),
    createApprovalGrantEnvelope: ({ payload }) => ({
      recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAD',
      recordType: 'delivery-incident-ledger-approval-grant',
      supersedes: null,
      payload,
    }),
    createApprovalEnvelope: ({ payload, supersedes }) => ({
      recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAB',
      recordType: 'delivery-incident-ledger-approval',
      supersedes,
      payload,
    }),
    createOwnerEnvelope: ({ payload, supersedes }) => ({
      recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAC',
      recordType: 'delivery-incident-ledger-owner',
      supersedes,
      payload,
    }),
    renderIncidentRecord: () => 'body',
    projectDeliveryIncidentRecords: (records) => {
      const owners = records.filter(
        ({ envelope }) => envelope.recordType === 'delivery-incident-ledger-owner'
      );
      const superseded = new Set(owners.map(({ envelope }) => envelope.supersedes).filter(Boolean));
      return {
        approvedLedgerOwner: owners.find(({ envelope }) => !superseded.has(envelope.recordId)),
      };
    },
    appendConvergenceRecord: async ({ envelope }) => {
      const isGrant = envelope.recordType.endsWith('-grant');
      const record = providerRecord(
        isGrant ? 'new-grant' : 'new-approval',
        envelope,
        isGrant ? '2026-08-28T00:00:00.000Z' : '2026-08-28T00:00:01.000Z'
      );
      convergenceRecords.push(record);
      return record;
    },
    appendOwnerRecord: async ({ envelope }) => {
      ownerAttempts += 1;
      if (ownerAttempts === 1) throw new Error('transport-before-write');
      ownerRecords.push({ id: 'new-owner', envelope });
      return ownerRecords.at(-1);
    },
  };
  const input = {
    repository: approvedPayload.repository,
    convergenceIssue: 1381,
    ledgerId: approvedPayload.ledgerId,
    ledgerDigest: digest,
    deps,
  };
  await assert.rejects(approveIncidentLedger(input), /record-write/);
  const recovered = await approveIncidentLedger(input);
  assert.equal(recovered.status, 'approved');
  assert.equal(ownerAttempts, 2);
  assert.equal(ownerRecords.at(-1).envelope.supersedes, oldOwnerId);
});

test('live ledger observation compares issue, board, PR, merge, evidence, approval, and trunk', async () => {
  const payload = {
    baselineTrunkSha: 'a'.repeat(40),
    rows: [
      {
        issueNumber: 1403,
        observedGitHubState: 'OPEN',
        observedBoardState: 'Develop',
        acceptedSha: 'b'.repeat(40),
        prNumber: 1404,
        prHeadSha: 'b'.repeat(40),
        mergeSha: 'c'.repeat(40),
        intentUrl: null,
        receiptUrl: null,
        approvalMode: 'full-auto',
        approvalSha: 'b'.repeat(40),
        codeOnTrunk: true,
        codeOnTrunkBasis: 'carrier-pr',
        blocker: 'historical evidence gap',
        intendedOutcome: 'incorporated',
      },
    ],
  };
  const liveDeps = {
    readTrunkSha: async () => payload.baselineTrunkSha,
    fetchIssue: async () => ({
      state: 'OPEN',
      body: `<!-- aitm-test-started sha="${'b'.repeat(40)}" ts="2026-08-28T00:00:00Z" -->\n<!-- aitm-review-approved ts="2026-08-28T00:01:00.000Z" approved-sha="${'b'.repeat(40)}" full-auto="yes" signals="env=yes" -->`,
    }),
    fetchBoardState: async () => 'Develop',
    fetchPullRequest: async () => ({
      number: 1404,
      headRefOid: 'b'.repeat(40),
      mergeCommitSha: 'c'.repeat(40),
    }),
    listComments: async () => [],
    isOnTrunk: async () => true,
  };
  const observed = await observeIncidentLedgerLive(payload, liveDeps);
  assert.deepEqual(observed, payload);
  await assert.rejects(
    observeIncidentLedgerLive(
      {
        ...payload,
        rows: [
          {
            ...payload.rows[0],
            intentUrl: 'https://github.com/kburson/ai-task-manager/issues/1403#issuecomment-1',
          },
        ],
      },
      liveDeps
    ),
    /stale-observation/
  );
  await assert.rejects(
    observeIncidentLedgerLive(payload, {
      ...liveDeps,
      listComments: async () => [
        {
          id: 'hidden-intent',
          url: 'https://github.com/kburson/ai-task-manager/issues/1403#issuecomment-2',
          createdAt: '2026-08-28T00:00:00.000Z',
          body: '<!-- aitm-delivery-intent {} -->',
        },
      ],
    }),
    /stale-observation/
  );
  await assert.rejects(
    observeIncidentLedgerLive(payload, {
      readTrunkSha: async () => payload.baselineTrunkSha,
      fetchIssue: async () => ({ state: 'CLOSED', body: '' }),
      fetchBoardState: async () => 'Develop',
      fetchPullRequest: async () => ({}),
      listComments: async () => [],
      isOnTrunk: async () => true,
    }),
    /stale-observation/
  );
});

for (const [issueNumber, prNumber, intentId] of [
  [1389, 1410, '01ARZ3NDEKTSV4RRFFQ69G5FA8'],
  [1392, 1411, '01ARZ3NDEKTSV4RRFFQ69G5FA9'],
]) {
  test(`terminal observation accepts the newly recovered receipt for #${issueNumber}`, async () => {
    const head = 'b'.repeat(40);
    const merge = 'c'.repeat(40);
    const intent = buildDeliveryIntent({
      intentId,
      supersedesIntentId: null,
      issueNumber,
      repository: approvedPayload.repository,
      prNumber,
      baseRef: 'trunk',
      headRef: `codex/${issueNumber}-recovery`,
      expectedHeadSha: head,
      mergeMethod: 'squash',
      attributionTokens: [`#${issueNumber}`],
      commitTitle: `[#${issueNumber}] Recover delivery evidence`,
      commitMessage: `PR #${prNumber} source ${head}\n\n[#${issueNumber}]`,
      provider: 'codex',
      sessionId: 'incident-recovery',
      clientCreatedAt: '2026-08-28T00:00:00.000Z',
    });
    const receipt = buildDeliveryReceipt({
      intentId,
      issueNumber,
      prNumber,
      expectedHeadSha: head,
      mergeCommitSha: merge,
      baseRef: 'trunk',
      mergeMethod: 'squash',
      verifiedTrunkRef: 'origin/trunk',
      provider: 'codex',
      sessionId: 'incident-recovery',
      verifiedAt: '2026-08-28T00:02:00.000Z',
    });
    const intentUrl = `https://github.com/kburson/ai-task-manager/issues/${issueNumber}#issuecomment-1`;
    const receiptUrl = `https://github.com/kburson/ai-task-manager/issues/${issueNumber}#issuecomment-2`;
    const payload = {
      repository: approvedPayload.repository,
      baselineTrunkSha: 'a'.repeat(40),
      rows: [
        {
          issueNumber,
          observedGitHubState: 'CLOSED',
          observedBoardState: 'Done',
          acceptedSha: head,
          prNumber,
          prHeadSha: head,
          mergeSha: merge,
          intentUrl,
          receiptUrl: null,
          approvalMode: 'full-auto',
          approvalSha: head,
          codeOnTrunk: true,
          codeOnTrunkBasis: 'governed-recovery',
          blocker: null,
          intendedOutcome: 'recover-then-close',
        },
      ],
    };
    const deps = {
      readTrunkSha: async () => payload.baselineTrunkSha,
      fetchIssue: async () => ({
        state: 'CLOSED',
        body: `<!-- aitm-test-started sha="${head}" ts="2026-08-28T00:00:00Z" -->\n<!-- aitm-review-approved ts="2026-08-28T00:01:00.000Z" approved-sha="${head}" full-auto="yes" signals="env=yes" -->`,
      }),
      fetchBoardState: async () => 'Done',
      fetchPullRequest: async () => ({
        number: prNumber,
        headRefOid: head,
        mergeCommitSha: merge,
      }),
      listComments: async () => [
        {
          id: 'intent',
          url: intentUrl,
          body: renderDeliveryIntentComment(intent),
          createdAt: '2026-08-28T00:01:00.000Z',
        },
        {
          id: 'receipt',
          url: receiptUrl,
          body: renderDeliveryReceiptComment(receipt),
          createdAt: '2026-08-28T00:02:00.000Z',
        },
      ],
      isOnTrunk: async () => true,
    };
    await assert.rejects(observeIncidentLedgerLive(payload, deps), /stale-observation/);
    const observed = await observeIncidentLedgerLive(payload, deps, { phase: 'terminal' });
    assert.deepEqual(observed, payload);
  });
}
