// @story #1381
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorizeIncidentEpicCloseForCommand,
  prepareIncorporatedCloseAuthorization,
  resolveIncorporatedReviewEvidence,
  runCloseIncorporatedLane,
} from '../../../../task-tracker/verbs/close.mjs';
import {
  createVerificationReceipt,
  upsertVerificationReceipt,
  VERIFICATION_COMMAND_IDENTITIES,
} from '../../../../task-tracker/lib/verification-receipt.mjs';
import { buildIncorporatedPayload } from '../../../../task-tracker/lib/delivery-incident-records.mjs';
import { INCORPORATED_CLOSE_STEPS } from '../../../../task-tracker/lib/incorporated-close.mjs';

const HEAD = 'a'.repeat(40);
const VERIFICATION_COMMANDS = [['npm', 'run', 'lint']];

function verificationBody({ redReview = false } = {}) {
  const environment = {
    node: 'v22.0.0',
    platform: 'darwin-arm64',
    lockfileHash: `sha256:${'b'.repeat(64)}`,
    configHashes: {},
    sandbox: { kind: 'worktree', identity: '/tmp/task-1403', clean: true },
  };
  const testCommands = Object.entries(VERIFICATION_COMMAND_IDENTITIES).map(
    ([classification, identity]) => ({
      classification,
      command: identity.command,
      args: [...identity.args],
      exitCode: 0,
      durationMs: 1,
    })
  );
  const testReceipt = createVerificationReceipt({
    issueNumber: 1403,
    stage: 'test',
    fingerprint: { commitSha: HEAD, verificationCommands: VERIFICATION_COMMANDS, environment },
    commands: testCommands,
    now: '2026-08-28T00:00:00.000Z',
  });
  const reviewReceipt = createVerificationReceipt({
    issueNumber: 1403,
    stage: 'review',
    fingerprint: { commitSha: HEAD, verificationCommands: VERIFICATION_COMMANDS, environment },
    commands: [
      {
        classification: 'review-probe',
        command: 'npm',
        args: ['test'],
        exitCode: redReview ? 1 : 0,
        durationMs: 1,
      },
    ],
    now: '2026-08-28T00:01:00.000Z',
  });
  let body = upsertVerificationReceipt(
    '## Verification Commands\n- [ ] `npm run lint`',
    testReceipt
  );
  body = upsertVerificationReceipt(body, reviewReceipt);
  body +=
    `\n<!-- aitm-review-approved ts="2026-08-28T00:02:00.000Z" approved-sha="${HEAD}" full-auto="yes" signals="full-auto" -->` +
    '\n- [ ] Agent Review Passed <!-- aitm-verified gate="agent-review" ts="2026-08-28T00:01:00.000Z" sha="sandbox" validators="body-sections" result="pass" -->\n';
  return body;
}

test('Incorporated review evidence is strict, exact-SHA, and resolved against current policy', () => {
  let resolverInput;
  const result = resolveIncorporatedReviewEvidence({
    body: verificationBody(),
    issueNumber: 1403,
    expectedSha: HEAD,
    session: { gates: { reviewToDone: false } },
    projectConfig: { gateReviewToDone: true },
    reviewAuthorizationResolver: (input) => {
      resolverInput = input;
      return { mode: 'full-auto', standing: true, source: 'session' };
    },
  });
  assert.equal(result.acceptedSha, HEAD);
  assert.equal(result.reviewAuthorizationValid, true);
  assert.equal(resolverInput.acceptedHeadSha, HEAD);
  assert.deepEqual(resolverInput.fullAutoApprovalEvidence, {
    accepted: true,
    approvedSha: HEAD,
  });
  assert.equal(resolverInput.humanApprovalEvidence, null);
});

test('Incorporated review evidence rejects malformed claims, red commands, and ambiguous tips', () => {
  const minimal = Buffer.from(JSON.stringify({ stage: 'test', commitSha: HEAD })).toString(
    'base64url'
  );
  assert.throws(
    () =>
      resolveIncorporatedReviewEvidence({
        body: `<!-- aitm-verification-receipt stage="test" data="${minimal}" -->`,
        issueNumber: 1403,
        expectedSha: HEAD,
      }),
    /incorporated-close:accepted-evidence/
  );

  assert.throws(
    () =>
      resolveIncorporatedReviewEvidence({
        body: verificationBody().replace('`npm run lint`', '`npm test`'),
        issueNumber: 1403,
        expectedSha: HEAD,
      }),
    /incorporated-close:accepted-evidence/
  );

  assert.throws(
    () =>
      resolveIncorporatedReviewEvidence({
        body: verificationBody({ redReview: true }),
        issueNumber: 1403,
        expectedSha: HEAD,
      }),
    /incorporated-close:accepted-evidence/
  );

  const body = verificationBody();
  const testMarker = body.match(/<!-- aitm-verification-receipt stage="test"[^>]+-->/)[0];
  assert.throws(
    () =>
      resolveIncorporatedReviewEvidence({
        body: `${body}\n${testMarker}`,
        issueNumber: 1403,
        expectedSha: HEAD,
      }),
    /incorporated-close:accepted-evidence/
  );
});

test('Incorporated review evidence refuses stale approval without current standing', () => {
  assert.throws(
    () =>
      resolveIncorporatedReviewEvidence({
        body: verificationBody(),
        issueNumber: 1403,
        expectedSha: HEAD,
        reviewAuthorizationResolver: () => ({
          mode: 'missing',
          standing: false,
          source: 'none',
        }),
      }),
    /incorporated-close:review-authorization/
  );
});

test('durable review authority permits strict retry evidence after Full-Auto standing is removed', () => {
  let resolverCalls = 0;
  const result = resolveIncorporatedReviewEvidence({
    body: verificationBody(),
    issueNumber: 1403,
    expectedSha: HEAD,
    durableReviewAuthority: {
      acceptedSha: HEAD,
      reviewAuthorization: { mode: 'full-auto', source: 'session' },
    },
    reviewAuthorizationResolver: () => {
      resolverCalls += 1;
      return { mode: 'missing', standing: false, source: 'none' };
    },
  });
  assert.equal(resolverCalls, 0);
  assert.equal(result.acceptedSha, HEAD);
  assert.deepEqual(result.reviewAuthorization, { mode: 'full-auto', source: 'session' });
});

test('fresh Incorporated preparation uses exact human ledger approval for a carrier-only row', async () => {
  const repository = 'kburson/ai-task-manager';
  const row = {
    issueNumber: 1384,
    intendedOutcome: 'incorporated',
    acceptedSha: null,
    prNumber: 1385,
    prHeadSha: 'a'.repeat(40),
    mergeSha: 'b'.repeat(40),
    codeOnTrunk: true,
    codeOnTrunkBasis: 'shared-carrier',
    blocker: 'issue-local delivery provenance absent for #1384',
  };
  const approvalRecordId = '01ARZ3NDEKTSV4RRFFQ69G5FAB';
  const ledger = {
    repository,
    convergenceIssue: 1381,
    incidentIssue: 939,
    ledgerId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    ledgerDigest: `sha256:${'d'.repeat(64)}`,
    approvalRecordId,
    ledgerPayload: { rows: [row] },
    projection: {
      approvedLedgerApproval: {
        authorLogin: 'kpburson',
        envelope: {
          recordId: approvalRecordId,
          payload: {
            approvedBy: 'kpburson',
            ledgerId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
            ledgerDigest: `sha256:${'d'.repeat(64)}`,
          },
        },
      },
    },
  };
  const authorization = await prepareIncorporatedCloseAuthorization({
    issueNumber: 1384,
    convergenceIssue: 1381,
    ctx: {
      projectConfig: { cfg: { repo: repository }, projectDir: '/tmp/project' },
      incidentRuntime: {
        listConvergenceRecords: async () => [],
        listOwnerRecords: async () => [],
        listIssueRecords: async () => [],
        liveObservationDeps: {
          readTrunkSha: async () => 'c'.repeat(40),
          fetchIssue: async () => ({ state: 'OPEN', stateReason: '', body: '', labels: [] }),
          fetchPullRequest: async () => ({
            number: row.prNumber,
            headRefOid: row.prHeadSha,
            mergeCommitSha: row.mergeSha,
          }),
          isOnTrunk: async () => true,
          listComments: async () => [],
        },
      },
      resolveApprovedIncidentLedger: () => ledger,
      projectValuesForIssue: async () => ({ blockedBy: '', disposition: '' }),
    },
  });
  assert.equal(authorization.acceptedSha, null);
  assert.deepEqual(authorization.reviewAuthorization, {
    mode: 'human',
    source: 'directory-human-evidence',
  });
});

test('fresh, partial, and completed preparation normalize or reuse exact review authority', async () => {
  const repository = 'kburson/ai-task-manager';
  const acceptedSha = HEAD;
  const row = {
    issueNumber: 1403,
    intendedOutcome: 'incorporated',
    acceptedSha,
    prNumber: 1404,
    prHeadSha: acceptedSha,
    mergeSha: 'c'.repeat(40),
    codeOnTrunk: true,
    codeOnTrunkBasis: 'carrier-pr',
    blocker: 'governed delivery receipt is absent',
  };
  const ledger = {
    repository,
    convergenceIssue: 1381,
    incidentIssue: 939,
    ledgerId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    ledgerDigest: `sha256:${'d'.repeat(64)}`,
    approvalRecordId: '01ARZ3NDEKTSV4RRFFQ69G5FAB',
    ledgerPayload: { rows: [row] },
    projection: {
      approvedLedgerApproval: {
        authorLogin: 'kpburson',
        envelope: {
          recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAB',
          payload: {
            approvedBy: 'kpburson',
            ledgerId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
            ledgerDigest: `sha256:${'d'.repeat(64)}`,
          },
        },
      },
    },
  };
  const incorporatedRecordId = '01ARZ3NDEKTSV4RRFFQ69G5FAZ';
  const incorporatedPayload = buildIncorporatedPayload({
    schema: 'aitm.delivery-incident-incorporated/v1',
    repository,
    issueNumber: 1403,
    convergenceIssue: 1381,
    ledgerId: ledger.ledgerId,
    ledgerDigest: ledger.ledgerDigest,
    approvalRecordId: ledger.approvalRecordId,
    acceptedSha,
    prNumber: row.prNumber,
    prHeadSha: row.prHeadSha,
    mergeSha: row.mergeSha,
    codeOnTrunkBasis: row.codeOnTrunkBasis,
    blocker: row.blocker,
  });

  for (const checkpointCount of [0, 2, INCORPORATED_CLOSE_STEPS.length]) {
    let previous = null;
    const issueRecords =
      checkpointCount === 0
        ? []
        : [
            {
              envelope: {
                recordId: incorporatedRecordId,
                recordType: 'delivery-incident-incorporated',
                payload: incorporatedPayload,
              },
            },
          ];
    INCORPORATED_CLOSE_STEPS.slice(0, checkpointCount).forEach((step, index) => {
      const recordId = `01ARZ3NDEKTSV4RRFFQ69G5FB${index}`;
      issueRecords.push({
        envelope: {
          recordId,
          recordType: 'delivery-incident-incorporated-close',
          supersedes: previous,
          payload: {
            schema: 'aitm.delivery-incident-incorporated-close/v1',
            repository,
            issueNumber: 1403,
            convergenceIssue: 1381,
            ledgerId: ledger.ledgerId,
            incorporatedRecordId,
            acceptedSha,
            authorizationDecision: { mode: 'full-auto', source: 'session' },
            completedSteps: INCORPORATED_CLOSE_STEPS.slice(0, index + 1),
          },
        },
      });
      previous = recordId;
    });
    let resolverCalls = 0;
    const completed = checkpointCount === INCORPORATED_CLOSE_STEPS.length;
    const authorization = await prepareIncorporatedCloseAuthorization({
      issueNumber: 1403,
      convergenceIssue: 1381,
      ctx: {
        projectConfig: { cfg: { repo: repository }, projectDir: '/tmp/project' },
        incidentRuntime: {
          listConvergenceRecords: async () => [],
          listOwnerRecords: async () => [],
          listIssueRecords: async () => issueRecords,
          liveObservationDeps: {
            readTrunkSha: async () => 'e'.repeat(40),
            fetchIssue: async () => ({
              state: completed ? 'CLOSED' : 'OPEN',
              stateReason: completed ? 'COMPLETED' : '',
              body: verificationBody(),
              labels: [],
            }),
            fetchPullRequest: async () => ({
              number: row.prNumber,
              headRefOid: row.prHeadSha,
              mergeCommitSha: row.mergeSha,
            }),
            isOnTrunk: async () => true,
            listComments: async () => [],
          },
        },
        resolveApprovedIncidentLedger: () => ledger,
        projectValuesForIssue: async () => ({ blockedBy: '', disposition: '' }),
        resolveReviewAuthorization: () => {
          resolverCalls += 1;
          return checkpointCount === 0
            ? { mode: 'full-auto', standing: true, source: 'session' }
            : { mode: 'missing', standing: false, source: 'none' };
        },
      },
    });
    assert.equal(resolverCalls, 0);
    assert.deepEqual(
      authorization.reviewAuthorization,
      checkpointCount === 0
        ? { mode: 'human', source: 'directory-human-evidence' }
        : { mode: 'full-auto', source: 'session' }
    );
  }
});

test('close Incorporated lane authorizes before invoking its dedicated mutation runner', async () => {
  const order = [];
  const authorization = { issueNumber: 1403, convergenceIssue: 1381 };
  const expected = {
    status: 'incorporated',
    issueNumber: 1403,
    convergenceIssue: 1381,
    ledgerId: 'ledger',
    recordId: 'record',
    mutatedSteps: [],
  };
  const ctx = {
    prepareIncorporatedCloseAuthorization: async (input) => {
      order.push('authorize');
      assert.equal(input.issueNumber, 1403);
      assert.equal(input.convergenceIssue, 1381);
      return authorization;
    },
    runIncorporatedClose: async ({ authorization: value }) => {
      order.push('mutate');
      assert.equal(value, authorization);
      return expected;
    },
    incorporatedCloseDeps: {},
    incidentRuntime: {},
  };
  const result = await runCloseIncorporatedLane({ ctx, issueNumber: 1403, convergenceIssue: 1381 });
  assert.equal(result, expected);
  assert.deepEqual(order, ['authorize', 'mutate']);
});

test('authorization refusal leaves the Incorporated mutation runner untouched', async () => {
  let mutations = 0;
  const ctx = {
    prepareIncorporatedCloseAuthorization: async () => {
      throw new Error('incorporated-close:blocker-not-cleared');
    },
    runIncorporatedClose: async () => {
      mutations += 1;
    },
    incorporatedCloseDeps: {},
    incidentRuntime: {},
  };
  await assert.rejects(
    runCloseIncorporatedLane({ ctx, issueNumber: 1403, convergenceIssue: 1381 }),
    /blocker-not-cleared/
  );
  assert.equal(mutations, 0);
});

test('ordinary close treats --of as an assertion, never as authority discovery', async () => {
  const runtime = {
    listIssueRecords: async () => [],
  };
  const ctx = {
    projectConfig: { cfg: { repo: 'kburson/ai-task-manager' }, projectDir: '/tmp/project' },
    githubClient: { getIssueBoardState: async () => 'Review' },
    incidentRuntime: runtime,
  };
  assert.equal(await authorizeIncidentEpicCloseForCommand({ ctx, issueNumber: 42 }), null);
  await assert.rejects(
    authorizeIncidentEpicCloseForCommand({
      ctx,
      issueNumber: 42,
      explicitConvergenceIssue: 1381,
    }),
    /incident-epic-close:non-incident-of/
  );
  await assert.rejects(
    authorizeIncidentEpicCloseForCommand({ ctx, issueNumber: 939 }),
    /incident-epic-close:missing-owner/
  );
});
