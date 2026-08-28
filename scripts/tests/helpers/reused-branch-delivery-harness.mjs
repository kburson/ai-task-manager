// @story #1381 #939
import { strict as assert } from 'node:assert';

import { loadCloseDeliveryGateInput } from '../../task-tracker/verbs/close.mjs';
import { createDefaultDeliverDeps, runDeliver } from '../../task-tracker/verbs/deliver.mjs';
import { closeBody } from './close-convergence-wiring-helpers.mjs';

export const REUSED_BRANCH_REPOSITORY = 'kburson/ai-task-manager';
export const REUSED_BRANCH_NAME = 'codex/1381-governed-delivery-convergence-spec';
export const REUSED_SHA_A = 'a'.repeat(40);
export const REUSED_SHA_B = 'b'.repeat(40);
export const REUSED_MERGE_A = 'c'.repeat(40);
export const REUSED_MERGE_B = 'd'.repeat(40);

const INTENT_IDS = [
  '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '01ARZ3NDEKTSV4RRFFQ69G5FAW',
  '01ARZ3NDEKTSV4RRFFQ69G5FAX',
  '01ARZ3NDEKTSV4RRFFQ69G5FAY',
];

const ISSUE_DEFINITIONS = Object.freeze({
  1381: Object.freeze({ sha: REUSED_SHA_A, prNumber: 1400, mergeSha: REUSED_MERGE_A }),
  1385: Object.freeze({ sha: REUSED_SHA_B, prNumber: 1405, mergeSha: REUSED_MERGE_B }),
});

function verificationMarker(stage, commitSha) {
  const data = Buffer.from(JSON.stringify({ stage, commitSha })).toString('base64url');
  return `<!-- aitm-verification-receipt stage="${stage}" data="${data}" -->`;
}

export function reusedBranchDeliveryBody(
  sha,
  { testSha = sha, reviewSha = sha, approvalSha = sha } = {}
) {
  return [
    closeBody(),
    verificationMarker('test', testSha),
    verificationMarker('review', reviewSha),
    `<!-- aitm-review-approved ts="2026-08-28T00:00:00.000Z" approved-sha="${approvalSha}" full-auto="yes" signals="session=1" -->`,
    '- [ ] Agent Review Passed <!-- aitm-verified gate="agent-review" ts="2026-08-28T00:00:00.000Z" sha="sandbox" validators="body-sections" result="pass" -->',
  ].join('\n');
}

export function createReusedBranchDeliveryHarness({ reversePullRequests = false } = {}) {
  let currentHead = REUSED_SHA_A;
  let intentIndex = 0;
  let clock = 0;
  let fullAutoStanding = true;
  const comments = new Map(Object.keys(ISSUE_DEFINITIONS).map((issue) => [Number(issue), []]));
  const definitions = Object.entries(ISSUE_DEFINITIONS);
  if (reversePullRequests) definitions.reverse();
  const pullRequests = new Map(
    definitions.map(([issue, definition]) => [
      definition.prNumber,
      {
        issueNumber: Number(issue),
        number: definition.prNumber,
        state: 'OPEN',
        headRefOid: definition.sha,
        mergeCommitSha: definition.mergeSha,
        mergedAt: null,
      },
    ])
  );
  const effects = {
    providerActions: 0,
    intents: 0,
    receipts: 0,
    originFetches: 0,
    trunkChecks: 0,
    policyReads: 0,
  };
  const faults = {
    fetch: false,
    unreachable: false,
    mergeBytes: false,
    mergeMethod: false,
    attribution: false,
  };
  const iso = (minute) => `2026-08-28T00:${String(minute).padStart(2, '0')}:00.000Z`;
  const definitionFor = (issueNumber) => ISSUE_DEFINITIONS[issueNumber];
  const intentFor = (issueNumber) =>
    comments
      .get(issueNumber)
      .map(({ body }) => body.match(/^<!-- aitm-delivery-intent (.+) -->/))
      .find(Boolean);

  function pullRequestSnapshot(pr) {
    return {
      number: pr.number,
      state: pr.state,
      merged: pr.state === 'MERGED',
      isDraft: false,
      baseRefName: 'trunk',
      headRefName: REUSED_BRANCH_NAME,
      headRefOid: pr.headRefOid,
      mergeable: pr.state === 'OPEN' ? 'MERGEABLE' : 'UNKNOWN',
      mergeCommit: { oid: pr.mergeCommitSha },
      mergedAt: pr.mergedAt,
      mergeMethod: pr.state === 'MERGED' ? 'squash' : null,
      headRefDeleted: false,
      sourceCommitSubjects: [`[#${pr.issueNumber}] integrated reused-branch work`],
    };
  }

  function verificationDeps(issueNumber) {
    const definition = definitionFor(issueNumber);
    return {
      async fetchOriginTrunk() {
        effects.originFetches += 1;
        if (faults.fetch) throw new Error('origin unavailable');
      },
      async isAncestor({ ancestor, descendant }) {
        effects.trunkChecks += 1;
        assert.equal(ancestor, definition.mergeSha);
        assert.equal(descendant, 'origin/trunk');
        return !faults.unreachable;
      },
      async inspectMergeCommit() {
        const parsed = JSON.parse(intentFor(issueNumber)[1]);
        return {
          parents: faults.mergeMethod ? ['f'.repeat(40), definition.sha] : ['f'.repeat(40)],
          commitTitle: parsed.commitTitle,
          commitMessage: faults.mergeBytes
            ? 'wrong governed bytes'
            : faults.attribution
              ? `${parsed.commitTitle}\n\nAttribution: [#9999]`
              : parsed.commitMessage,
        };
      },
      async attributingCommits(number, { refs }) {
        assert.equal(number, issueNumber);
        assert.deepEqual(refs, ['origin/trunk']);
        return [
          {
            sha: definition.mergeSha,
            subject: `[#${issueNumber}] integrated reused-branch work`,
            ts: pullRequests.get(definition.prNumber).mergedAt,
          },
        ];
      },
    };
  }

  function deliverDeps(issueNumber) {
    const definition = definitionFor(issueNumber);
    return {
      ...createDefaultDeliverDeps(
        {
          cfg: {
            repo: REUSED_BRANCH_REPOSITORY,
            assignee: 'kburson',
            trunkRef: 'origin/trunk',
            fullAutoMerge: { mechanism: 'provider-action', mergeMethod: 'squash' },
          },
          projectDir: '/virtual/reused-branch',
          getIssueBoardState: async () => 'Review',
          loadCurrentSession: () => {
            effects.policyReads += 1;
            return { gates: { reviewToDone: !fullAutoStanding } };
          },
          loadRawProjectConfig: () => {
            effects.policyReads += 1;
            return {};
          },
        },
        { exec: async () => Promise.reject(new Error('unexpected production I/O')) }
      ),
      async fetchIssue() {
        return {
          number: issueNumber,
          state: 'OPEN',
          projectState: 'Review',
          assignees: ['kburson'],
          agentReviewPassed: true,
          body: reusedBranchDeliveryBody(definition.sha),
        };
      },
      async resolveLineage() {
        return { parentIssueNumber: null, deliveryTarget: 'trunk' };
      },
      async getCurrentBranch() {
        return REUSED_BRANCH_NAME;
      },
      async getLocalHeadSha() {
        return currentHead;
      },
      async resolveTestReceiptSha() {
        return definition.sha;
      },
      async resolveAcceptedReviewSha() {
        return definition.sha;
      },
      async resolveAgentReviewPassed() {
        return true;
      },
      async listPullRequests() {
        return [...pullRequests.values()].map(({ number }) => ({ number }));
      },
      async fetchPullRequest({ prNumber }) {
        return pullRequestSnapshot(pullRequests.get(prNumber));
      },
      async fetchRequiredChecks({ prNumber, expectedHeadSha }) {
        assert.equal(prNumber, definition.prNumber);
        assert.equal(expectedHeadSha, definition.sha);
        return {
          readable: true,
          required: [
            {
              name: 'ci',
              headSha: definition.sha,
              status: 'COMPLETED',
              conclusion: 'SUCCESS',
            },
          ],
        };
      },
      async fetchRepositoryMergeMethods() {
        return ['squash'];
      },
      async listCommitSubjects() {
        return [`[#${issueNumber}] integrated reused-branch work`];
      },
      async listDirtyPaths() {
        return [];
      },
      async listIssueComments() {
        return structuredClone(comments.get(issueNumber));
      },
      async createIssueComment({ body }) {
        const kind = body.startsWith('<!-- aitm-delivery-receipt ') ? 'receipt' : 'intent';
        effects[kind === 'receipt' ? 'receipts' : 'intents'] += 1;
        clock += 1;
        const comment = {
          id: `${issueNumber}-${kind}-${clock}`,
          createdAt: iso(clock),
          body,
        };
        comments.get(issueNumber).push(comment);
        return { id: comment.id };
      },
      ...verificationDeps(issueNumber),
      now() {
        clock += 1;
        return iso(clock);
      },
      createIntentId() {
        return INTENT_IDS[intentIndex++];
      },
      providerId() {
        return 'codex';
      },
      sessionId() {
        return 'session-1381';
      },
      async inspectSourceCommit() {
        throw new Error('unexpected source inspection');
      },
    };
  }

  async function deliver(issueNumber) {
    const result = await runDeliver({
      issueNumber,
      cfg: {
        repo: REUSED_BRANCH_REPOSITORY,
        assignee: 'kburson',
        trunkRef: 'origin/trunk',
        fullAutoMerge: { mechanism: 'provider-action', mergeMethod: 'squash' },
      },
      state: { active: `#${issueNumber}`, entryStartTs: iso(0) },
      deps: deliverDeps(issueNumber),
    });
    if (result.action !== null) effects.providerActions += 1;
    return result;
  }

  function merge(issueNumber) {
    const definition = definitionFor(issueNumber);
    const pr = pullRequests.get(definition.prNumber);
    pr.state = 'MERGED';
    clock += 1;
    pr.mergedAt = iso(clock);
  }

  async function closePexec(issueNumber, command, args) {
    if (command === 'git' && args[0] === 'branch') {
      return { stdout: `${REUSED_BRANCH_NAME}\n` };
    }
    if (command === 'git' && args[0] === 'rev-parse' && args[1] === 'HEAD') {
      return { stdout: `${currentHead}\n` };
    }
    if (command === 'gh' && args[0] === 'pr') {
      return {
        stdout: JSON.stringify(
          [...pullRequests.values()].map((pr) => ({
            number: pr.number,
            state: pr.state,
            mergedAt: pr.mergedAt,
            mergeCommit: { oid: pr.mergeCommitSha },
            headRefName: REUSED_BRANCH_NAME,
            headRefOid: pr.headRefOid,
            baseRefName: 'trunk',
          }))
        ),
      };
    }
    if (command === 'gh' && args[0] === 'api') {
      return {
        stdout: JSON.stringify([
          comments.get(issueNumber).map((comment) => ({
            id: comment.id,
            body: comment.body,
            created_at: comment.createdAt,
          })),
        ]),
      };
    }
    return undefined;
  }

  async function closeGateInput(
    issueNumber,
    { body = reusedBranchDeliveryBody(definitionFor(issueNumber).sha) } = {}
  ) {
    const definition = definitionFor(issueNumber);
    return loadCloseDeliveryGateInput({
      issueNumber,
      cfg: {
        repo: REUSED_BRANCH_REPOSITORY,
        trunkRef: 'origin/trunk',
        fullAutoMerge: { mechanism: 'provider-action', mergeMethod: 'squash' },
      },
      projectDir: '/virtual/reused-branch',
      body,
      lifecycleEvidence: null,
      ctx: { resolveCloseParentIssue: async () => null },
      pexec: (command, args) => closePexec(issueNumber, command, args),
    });
  }

  return {
    comments,
    effects,
    faults,
    pullRequests,
    deliver,
    merge,
    closeGateInput,
    closePexec,
    verificationDeps,
    setCurrentHead(value) {
      currentHead = value;
    },
    setFullAutoStanding(value) {
      fullAutoStanding = value;
    },
  };
}
