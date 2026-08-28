// @story #1381
import assert from 'node:assert/strict';
import test from 'node:test';

import * as verifierModule from '../../../../task-tracker/verify-delivery-incident-reconciliation.mjs';
import {
  parseVerificationArgs,
  productionVerification,
  readSubIssueNumbersStrict,
  verificationErrorExitCode,
} from '../../../../task-tracker/verify-delivery-incident-reconciliation.mjs';

test('live project board options use canonical incident-ledger state slugs', () => {
  const cfg = {
    kanbanOptionBacklog: 'backlog-id',
    kanbanOptionRefine: 'refine-id',
    kanbanOptionReadyForPlan: 'ready-id',
    kanbanOptionPlan: 'plan-id',
    kanbanOptionDevelop: 'develop-id',
    kanbanOptionTest: 'test-id',
    kanbanOptionReview: 'review-id',
    kanbanOptionDone: 'done-id',
  };
  assert.deepEqual(
    Object.values(cfg).map((optionId) =>
      verifierModule.canonicalBoardStateForOption(cfg, optionId)
    ),
    ['backlog', 'refine', 'ready-for-plan', 'plan', 'develop', 'test', 'review', 'done']
  );
});

test('read-only verifier accepts only convergence issue 1381 and known phases', () => {
  assert.deepEqual(parseVerificationArgs(['--issue', '1381']), {
    convergenceIssue: 1381,
    phase: 'terminal',
  });
  assert.deepEqual(parseVerificationArgs(['--issue', '#1381', '--phase', 'pre-close']), {
    convergenceIssue: 1381,
    phase: 'pre-close',
  });
  assert.throws(() => parseVerificationArgs(['--issue', '1381', '--phase', 'mutate']));
  assert.throws(() => parseVerificationArgs(['--issue', '1403']));
  assert.equal(
    verificationErrorExitCode(
      new TypeError(
        'Usage: verify-delivery-incident-reconciliation --issue 1381 [--phase pre-close|terminal]'
      )
    ),
    2
  );
  assert.equal(verificationErrorExitCode(new Error('delivery-incident:stale-observation')), 1);
});

test('sub-issue pagination is bounded, correlated, and fail-closed', async () => {
  const pages = new Map([
    [null, { nodes: [{ number: 1380 }], pageInfo: { hasNextPage: true, endCursor: 'p2' } }],
    ['p2', { nodes: [{ number: 1382 }], pageInfo: { hasNextPage: false, endCursor: null } }],
  ]);
  assert.deepEqual(
    await readSubIssueNumbersStrict(async (after) => pages.get(after)),
    [1380, 1382]
  );
  await assert.rejects(
    readSubIssueNumbersStrict(async () => ({ nodes: [] })),
    /stale-observation/
  );
  let repeatedCursorPage = 0;
  await assert.rejects(
    readSubIssueNumbersStrict(async () => ({
      nodes: [{ number: 1380 + repeatedCursorPage++ }],
      pageInfo: { hasNextPage: true, endCursor: 'same' },
    })),
    /stale-observation/
  );
  await assert.rejects(
    readSubIssueNumbersStrict(
      async () => ({
        nodes: [{ number: 1380 }],
        pageInfo: { hasNextPage: true, endCursor: 'next' },
      }),
      { maximumPages: 1 }
    ),
    /stale-observation/
  );
});

for (const phase of ['pre-close', 'terminal']) {
  test(`production ${phase} orchestration preserves every record and performs reads only`, async () => {
    const calls = [];
    const blockerByIssue = new Map([
      [1403, 1381],
      [1397, 1403],
      [1395, 1397],
      [1393, 1395],
      [1392, 1393],
      [1390, 1392],
      [1389, 1390],
      [1388, 1389],
    ]);
    const authority = {
      repository: 'kburson/ai-task-manager',
      convergenceIssue: 1381,
      incidentIssue: 939,
      ledgerPayload: {
        baselineTrunkSha: 'a'.repeat(40),
        rows: [
          {
            issueNumber: 1381,
            observedGitHubState: 'OPEN',
            observedBoardState: 'develop',
            intendedOutcome: 'convergence-owner',
          },
          {
            issueNumber: 1403,
            observedGitHubState: 'OPEN',
            observedBoardState: 'develop',
            acceptedSha: 'c'.repeat(40),
            prNumber: 1412,
            prHeadSha: 'c'.repeat(40),
            mergeSha: 'd'.repeat(40),
            codeOnTrunkBasis: 'governed-delivery',
            blocker: '#1381',
            intendedOutcome: 'incorporated',
          },
          {
            issueNumber: 1389,
            observedGitHubState: 'CLOSED',
            observedBoardState: 'done',
            intentUrl: 'https://github.com/kburson/ai-task-manager/issues/1389#issuecomment-intent',
            receiptUrl:
              'https://github.com/kburson/ai-task-manager/issues/1389#issuecomment-receipt',
            intendedOutcome: 'recover-then-close',
          },
          {
            issueNumber: 1378,
            observedGitHubState: 'CLOSED',
            observedBoardState: 'done',
            intendedOutcome: 'retain-superseded',
          },
        ],
      },
      projection: {
        approvedLedgerIncorporated: [],
        incorporated: [
          {
            envelope: {
              payload: {
                issueNumber: 1403,
                acceptedSha: 'c'.repeat(40),
                prNumber: 1412,
                prHeadSha: 'c'.repeat(40),
                mergeSha: 'd'.repeat(40),
                codeOnTrunkBasis: 'governed-delivery',
                blocker: '#1381',
              },
            },
          },
        ],
      },
    };
    const runtime = {
      listConvergenceRecords: async () => {
        calls.push('records:1381');
        return [
          {
            id: 'convergence-comment',
            envelope: { recordId: 'duplicate-authority', recordType: 'delivery-incident-ledger' },
          },
        ];
      },
      listOwnerRecords: async () => {
        calls.push('records:939');
        return [];
      },
      listIssueRecords: async (issue) => {
        calls.push(`records:${issue}`);
        return issue === 1403
          ? [
              {
                id: 'distinct-comment-same-record-id',
                envelope: {
                  recordId: 'duplicate-authority',
                  recordType: 'delivery-incident-incorporated',
                },
              },
            ]
          : [];
      },
      liveObservationDeps: {
        readTrunkSha: async () => {
          calls.push('trunk');
          return 'b'.repeat(40);
        },
        fetchIssue: async (issue) => {
          calls.push(`issue:${issue}`);
          const blocker = blockerByIssue.get(issue);
          return {
            state: phase === 'terminal' ? 'CLOSED' : 'OPEN',
            body:
              issue === 1378
                ? '<!-- aitm-superseded-by refs="#939" ts="2026-08-28T00:00:00.000Z" -->'
                : blocker === undefined
                  ? ''
                  : `<!-- aitm-blocked-by: #${blocker} -->`,
            labels: blocker === undefined ? [] : [{ name: 'BLOCKED' }],
          };
        },
        fetchBoardState: async (issue) => {
          calls.push(`status:${issue}`);
          return phase === 'terminal' ? 'done' : 'develop';
        },
        listComments: async (issue) => {
          calls.push(`comments:${issue}`);
          return [];
        },
        fetchPullRequest: async (prNumber) => {
          calls.push(`pr:${prNumber}`);
          return {
            number: prNumber,
            headRefOid: 'c'.repeat(40),
            mergeCommitSha: 'd'.repeat(40),
          };
        },
        isOnTrunk: async (sha) => {
          calls.push(`on-trunk:${sha}`);
          return true;
        },
      },
    };
    const result = await productionVerification(
      { convergenceIssue: 1381, phase },
      {
        cfg: { repo: authority.repository, projectId: 'project' },
        projectDir: '/tmp/read-only-verifier',
        runtime,
        resolveApprovedIncidentLedger: ({ records }) => {
          assert.equal(
            records.filter(({ envelope }) => envelope.recordId === 'duplicate-authority').length,
            2
          );
          return authority;
        },
        projectValuesForIssue: async ({ fieldDefs, issueNumber }) => {
          calls.push(`project:${fieldDefs[0].key}:${issueNumber}`);
          return fieldDefs[0].key === 'blockedBy'
            ? { blockedBy: `#${blockerByIssue.get(issueNumber)}` }
            : {
                disposition:
                  phase === 'terminal'
                    ? issueNumber === 1403
                      ? 'Incorporated'
                      : issueNumber === 1378
                        ? 'Replaced'
                        : 'Delivered'
                    : '',
              };
        },
        readParentIssue: async () => {
          calls.push('parent:1381');
          return null;
        },
        readSubIssueNumbers: async () => {
          calls.push('children:939');
          return [1380, 1382, 1383, 1384];
        },
        observeIncidentLedgerLive: async () => {
          calls.push(`observe:${phase}`);
        },
        resolveSingleDeliveredEvidence: ({ expectedHeadSha }) => {
          assert.equal(expectedHeadSha, 'c'.repeat(40));
          return {
            prNumber: 1412,
            expectedHeadSha,
            mergeCommitSha: 'd'.repeat(40),
          };
        },
        readIssueDeliveryAuthority: () => ({
          acceptedSha: 'c'.repeat(40),
          approvalSha: 'c'.repeat(40),
          approvalMode: 'full-auto',
        }),
        verifyIncidentLedgerPhase: async ({ deps: phaseDeps }) => {
          if (phase === 'pre-close') assert.equal(await phaseDeps.verifyPreCloseTopology(), true);
          else assert.equal(await phaseDeps.verifyTerminalAuthority(), true);
          const rows = await phaseDeps.observeRows({ phase });
          assert.equal(rows.length, 4);
          if (phase === 'terminal') {
            assert.equal(
              rows.every(({ terminalMatches }) => terminalMatches),
              true
            );
            assert.equal(
              rows.find(({ issueNumber }) => issueNumber === 1389)?.outcomeEvidenceMatches,
              true
            );
            assert.equal(
              rows.find(({ issueNumber }) => issueNumber === 1403)?.outcomeEvidenceMatches,
              true
            );
            assert.equal(
              rows.find(({ issueNumber }) => issueNumber === 1378)?.outcomeEvidenceMatches,
              true
            );
          }
          return { ok: true };
        },
      }
    );
    assert.deepEqual(result, { ok: true });
    assert.equal(calls.includes('records:1381'), true);
    assert.equal(calls.includes('records:939'), true);
    assert.equal(calls.includes('observe:' + phase), true);
    if (phase === 'pre-close') assert.equal(calls.includes('children:939'), true);
    else assert.equal(calls.includes('pr:1412'), true);
    assert.equal(
      calls.some((call) => /^(?:write|append|mutate|close):/.test(call)),
      false
    );
  });
}
