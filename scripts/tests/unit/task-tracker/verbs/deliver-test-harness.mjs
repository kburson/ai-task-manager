// @story #939
// Shared deterministic harness for governed delivery verb unit tests.

import { strict as assert } from 'node:assert';

import { runDeliver } from '../../../../task-tracker/verbs/deliver.mjs';

export const HEAD = 'a'.repeat(40);
export const NEXT_HEAD = 'b'.repeat(40);
export const MERGE_HEAD = 'c'.repeat(40);
export const NOW = '2026-08-22T14:00:00.000Z';
export const SERVER_NOW = '2026-08-22T14:00:01.000Z';
export const MERGED_AT = '2026-08-22T14:01:00.000Z';
export const RECEIPT_SERVER_NOW = '2026-08-22T14:01:01.000Z';
export const INTENT_IDS = [
  '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '01ARZ3NDEKTSV4RRFFQ69G5FAW',
  '01ARZ3NDEKTSV4RRFFQ69G5FAX',
];

export function cfg() {
  return {
    repo: 'kburson/ai-task-manager',
    assignee: 'kburson',
    trunkRef: 'origin/trunk',
    fullAutoMerge: {
      mechanism: 'provider-action',
      mergeMethod: 'squash',
    },
  };
}

export function trackerState() {
  return {
    active: '#939',
    entryStartTs: '2026-08-22T13:00:00.000Z',
  };
}

export function makeHarness(options = {}) {
  const calls = {
    events: [],
    listIssueComments: 0,
    createIssueComment: 0,
    listPullRequests: 0,
    fetchPullRequest: 0,
    fetchRequiredChecks: 0,
    fetchOriginTrunk: 0,
    isAncestor: 0,
    squashParentAncestry: 0,
    inspectMergeCommit: 0,
    inspectSourceCommit: 0,
    attributingCommits: [],
    terminalTiming: 0,
    terminalBoard: 0,
    terminalDisposition: 0,
    terminalClosure: 0,
    terminalBinding: 0,
  };
  const data = {
    head: options.head ?? HEAD,
    testReceiptSha: options.testReceiptSha ?? options.head ?? HEAD,
    acceptedReviewSha: options.acceptedReviewSha ?? options.head ?? HEAD,
    lineage: options.lineage ?? { parentIssueNumber: null, deliveryTarget: 'trunk' },
    comments: [...(options.comments ?? [])],
    checks: {
      readable: true,
      required: [
        {
          name: 'ci',
          headSha: options.head ?? HEAD,
          status: 'COMPLETED',
          conclusion: 'SUCCESS',
        },
      ],
    },
    commitSubjects: options.commitSubjects ?? ['[#939] Add governed delivery intent verb'],
    prCommitSubjects: options.prCommitSubjects ??
      options.commitSubjects ?? ['[#939] Add governed delivery intent verb'],
    prSourceCommits:
      options.prSourceCommits ??
      (
        options.prCommitSubjects ??
        options.commitSubjects ?? ['[#939] Add governed delivery intent verb']
      ).map((messageHeadline, index, subjects) => ({
        oid:
          index === subjects.length - 1
            ? (options.prHead ?? options.head ?? HEAD)
            : (index + 1).toString(16).padStart(40, '0'),
        messageHeadline,
      })),
    prSourceEvidence: options.prSourceEvidence ?? null,
    configuredMergeMethod: options.configuredMergeMethod ?? 'squash',
    sourceCommitsComplete: options.sourceCommitsComplete ?? true,
    sourceCommitsHeadSha: options.sourceCommitsHeadSha ?? options.prHead ?? options.head ?? HEAD,
    prState: options.prState ?? 'OPEN',
    prHead: options.prHead ?? null,
    mergeCommitSha: options.mergeCommitSha === undefined ? MERGE_HEAD : options.mergeCommitSha,
    mergedAt: options.mergedAt ?? MERGED_AT,
    prMergeMethod: options.prMergeMethod === undefined ? 'squash' : options.prMergeMethod,
    headRefDeleted: options.headRefDeleted ?? false,
    fetchFailure: options.fetchFailure ?? false,
    historyMergeMethod: options.historyMergeMethod ?? 'squash',
    agentReviewPassed: options.agentReviewPassed ?? true,
    reviewAuthorization:
      options.reviewAuthorization ??
      Object.freeze({ mode: 'full-auto', standing: true, source: 'test' }),
  };
  let intentIdIndex = 0;

  const deps = {
    resolveReviewAuthorization() {
      return data.reviewAuthorization;
    },
    async fetchIssue() {
      return {
        number: 939,
        state: 'OPEN',
        projectState: 'Review',
        assignees: ['kburson'],
        agentReviewPassed: data.agentReviewPassed,
        body: 'governed issue body',
      };
    },
    async resolveLineage() {
      return { ...data.lineage };
    },
    async getCurrentBranch() {
      return 'codex/939-full-auto-merge';
    },
    async getLocalHeadSha() {
      return data.head;
    },
    async resolveTestReceiptSha() {
      return data.testReceiptSha;
    },
    async resolveAcceptedReviewSha() {
      return data.acceptedReviewSha;
    },
    async resolveAgentReviewPassed() {
      return data.agentReviewPassed;
    },
    async listPullRequests({ headRef }) {
      calls.listPullRequests += 1;
      assert.equal(headRef, 'codex/939-full-auto-merge');
      return [{ number: 1400 }];
    },
    async fetchPullRequest({ prNumber }) {
      calls.fetchPullRequest += 1;
      assert.equal(prNumber, 1400);
      const pullRequest = {
        number: 1400,
        state: data.prState,
        merged: data.prState === 'MERGED',
        isDraft: false,
        baseRefName: 'trunk',
        headRefName: 'codex/939-full-auto-merge',
        headRefOid: data.prHead ?? data.head,
        mergeable: data.prState === 'OPEN' ? 'MERGEABLE' : 'UNKNOWN',
        mergeCommit: data.mergeCommitSha === null ? null : { oid: data.mergeCommitSha },
        mergedAt: data.prState === 'MERGED' ? data.mergedAt : null,
        headRefDeleted: data.headRefDeleted,
        sourceCommitSubjects: [...data.prCommitSubjects],
        sourceCommits:
          data.prSourceCommits === null ? undefined : structuredClone(data.prSourceCommits),
        sourceCommitsComplete: data.sourceCommitsComplete,
        sourceCommitsHeadSha: data.sourceCommitsHeadSha,
      };
      if (data.prSourceEvidence !== null) {
        pullRequest.sourceCommitEvidence = structuredClone(data.prSourceEvidence);
      }
      if (!options.omitPrMergeMethod) {
        pullRequest.mergeMethod = data.prState === 'MERGED' ? data.prMergeMethod : null;
      }
      return pullRequest;
    },
    async fetchRequiredChecks({ prNumber, expectedHeadSha }) {
      calls.fetchRequiredChecks += 1;
      assert.equal(prNumber, 1400);
      assert.equal(expectedHeadSha, data.head);
      return structuredClone(data.checks);
    },
    async fetchRepositoryMergeMethods() {
      return ['merge', 'squash', 'rebase'];
    },
    async listCommitSubjects({ range }) {
      assert.equal(range, 'origin/trunk..HEAD');
      return [...data.commitSubjects];
    },
    async listDirtyPaths() {
      return [];
    },
    async listIssueComments() {
      calls.listIssueComments += 1;
      calls.events.push('comments:read');
      return structuredClone(data.comments);
    },
    async createIssueComment({ body }) {
      calls.createIssueComment += 1;
      const kind = body.startsWith('<!-- aitm-delivery-receipt ') ? 'receipt' : 'intent';
      calls.events.push(`${kind}:post`);
      data.comments.push({
        id: `comment-${data.comments.length + 1}`,
        createdAt: kind === 'receipt' ? RECEIPT_SERVER_NOW : SERVER_NOW,
        body,
      });
      if (
        (options.losePostResponse === true && calls.createIssueComment === 1) ||
        (options.loseReceiptPostResponse === true && kind === 'receipt')
      ) {
        throw new Error('transport response lost');
      }
      return { id: data.comments.at(-1).id };
    },
    async fetchOriginTrunk({ remote, branch }) {
      calls.fetchOriginTrunk += 1;
      assert.equal(remote, 'origin');
      assert.equal(branch, 'trunk');
      if (data.fetchFailure) throw new Error('fetch unavailable');
    },
    async isAncestor({ ancestor, descendant }) {
      calls.isAncestor += 1;
      // #1490 — two distinct ancestry questions reach this dep. Trunk
      // reachability of the merge commit, and (for the multi-source squash
      // proof) whether the merge commit's parent is an ancestor of the accepted
      // head. Keep both assertions exact rather than accepting any pair.
      if (descendant !== 'origin/trunk') {
        calls.squashParentAncestry += 1;
        // Both sides asserted exactly: the ancestor must be the inspected merge
        // parent and the descendant the accepted head. Accepting any pair here
        // would let a proof asking the wrong ancestry question still pass.
        assert.equal(ancestor, options.inspectedMergeParent ?? 'd'.repeat(40));
        assert.equal(descendant, data.prHead ?? data.head);
        return options.squashParentIsAncestor ?? true;
      }
      assert.equal(ancestor, data.mergeCommitSha);
      return options.mergeReachable ?? true;
    },
    async inspectMergeCommit({
      mergeCommitSha,
      expectedHeadSha,
      authorizedCommitTitle,
      authorizedCommitMessage,
    }) {
      calls.inspectMergeCommit += 1;
      assert.equal(mergeCommitSha, data.mergeCommitSha);
      const intent = data.comments
        .map(({ body }) => body.match(/^<!-- aitm-delivery-intent (.+) -->/))
        .find(Boolean);
      const parsed = intent === undefined ? null : JSON.parse(intent[1]);
      const commitTitle =
        options.historyCommitTitle ??
        parsed?.commitTitle ??
        authorizedCommitTitle ??
        '[#939] Governed PR delivery';
      const commitMessage =
        options.historyCommitMessage ??
        parsed?.commitMessage ??
        authorizedCommitMessage ??
        `PR #1400\nSource: ${HEAD}\n\nAttribution: [#939]`;
      if (options.historyBytesMismatch) {
        return { parents: ['d'.repeat(40)], commitTitle, commitMessage: 'wrong bytes' };
      }
      if (data.historyMergeMethod === 'merge') {
        return {
          parents: ['d'.repeat(40), expectedHeadSha],
          commitTitle,
          commitMessage,
        };
      }
      if (data.historyMergeMethod === 'squash') {
        return {
          parents: ['d'.repeat(40)],
          ...(options.historyTree ? { tree: options.historyTree } : {}),
          commitTitle,
          commitMessage,
        };
      }
      return {
        parents: ['d'.repeat(40), 'e'.repeat(40), 'f'.repeat(40)],
        commitTitle,
        commitMessage,
      };
    },
    async inspectSourceCommit({ commitSha }) {
      calls.inspectSourceCommit += 1;
      if (options.sourceInspections?.[commitSha]) {
        return structuredClone(options.sourceInspections[commitSha]);
      }
      throw new Error('unexpected source commit inspection');
    },
    async attributingCommits(issueNumber, { refs }) {
      calls.attributingCommits.push(issueNumber);
      assert.deepEqual(refs, ['origin/trunk']);
      const missing = new Set(options.missingAttribution ?? []);
      return missing.has(issueNumber)
        ? []
        : [{ sha: data.mergeCommitSha, subject: `[#${issueNumber}] delivered`, ts: data.mergedAt }];
    },
    now() {
      return NOW;
    },
    createIntentId() {
      return INTENT_IDS[intentIdIndex++];
    },
    providerId() {
      return 'codex';
    },
    sessionId() {
      return 'session-939';
    },
    async flushTerminalTiming() {
      calls.terminalTiming += 1;
    },
    async moveBoardToDone() {
      calls.terminalBoard += 1;
    },
    async setTerminalDisposition() {
      calls.terminalDisposition += 1;
    },
    async closeIssue() {
      calls.terminalClosure += 1;
    },
    async releaseBinding() {
      calls.terminalBinding += 1;
    },
  };

  return { calls, data, deps };
}

export async function mergePendingIntent(harness, overrides = {}) {
  const pending = await deliver(harness, overrides);
  assert.equal(pending.status, 'action-required');
  harness.data.prState = 'MERGED';
  return pending;
}

export async function deliver(harness, overrides = {}) {
  return runDeliver({
    issueNumber: 939,
    cfg: {
      ...cfg(),
      ...(harness.data.configuredMergeMethod
        ? {
            fullAutoMerge: {
              ...cfg().fullAutoMerge,
              mergeMethod: harness.data.configuredMergeMethod,
            },
          }
        : {}),
    },
    state: trackerState(),
    deps: harness.deps,
    ...overrides,
  });
}

export async function advancePendingDelivery(harness) {
  const pending = await deliver(harness);
  assert.equal(pending.status, 'action-required');
  harness.data.prState = 'MERGED';
  harness.data.prHead = HEAD;
  harness.data.head = NEXT_HEAD;
  return pending;
}
