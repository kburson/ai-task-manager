#!/usr/bin/env node
// @story #1392
// cspell:ignore NDEKTSV RRFFQ

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runDeliver } from '../../../../task-tracker/verbs/deliver.mjs';

const HEAD = 'a'.repeat(40);
const OLD_HEAD = 'b'.repeat(40);
const BRANCH = 'codex/939-full-auto-merge';

function pullRequest(number, headRefOid, state = 'OPEN') {
  return {
    number,
    state,
    merged: state === 'MERGED',
    isDraft: false,
    baseRefName: 'trunk',
    headRefName: BRANCH,
    headRefOid,
    mergeable: state === 'OPEN' ? 'MERGEABLE' : 'UNKNOWN',
    mergeCommit: state === 'MERGED' ? { oid: 'c'.repeat(40) } : null,
    mergedAt: state === 'MERGED' ? '2026-08-23T03:57:33.000Z' : null,
    headRefDeleted: false,
    sourceCommitSubjects: ['[#1392] exact-head delivery'],
    mergeMethod: state === 'MERGED' ? 'squash' : null,
  };
}

function harness(snapshots) {
  const comments = [];
  return {
    cfg: {
      repo: 'kburson/ai-task-manager',
      assignee: 'kburson',
      trunkRef: 'origin/trunk',
      fullAutoMerge: { mechanism: 'provider-action', mergeMethod: 'squash' },
    },
    state: { active: '#1392', entryStartTs: '2026-08-23T04:00:00.000Z' },
    deps: {
      async fetchIssue() {
        return {
          number: 1392,
          state: 'OPEN',
          projectState: 'Review',
          assignees: ['kburson'],
          agentReviewPassed: true,
          body: 'governed issue body',
        };
      },
      async resolveLineage() {
        return { parentIssueNumber: null, deliveryTarget: 'trunk' };
      },
      async getCurrentBranch() {
        return BRANCH;
      },
      async getLocalHeadSha() {
        return HEAD;
      },
      async resolveTestReceiptSha() {
        return HEAD;
      },
      async resolveAcceptedReviewSha() {
        return HEAD;
      },
      async resolveAgentReviewPassed() {
        return true;
      },
      async resolveReviewAuthorization() {
        return { mode: 'full-auto', standing: true, source: 'test' };
      },
      async listPullRequests() {
        return snapshots.map(({ number }) => ({ number }));
      },
      async fetchPullRequest({ prNumber }) {
        return structuredClone(snapshots.find(({ number }) => number === prNumber));
      },
      async fetchRequiredChecks({ prNumber, expectedHeadSha }) {
        assert.equal(prNumber, 1391);
        assert.equal(expectedHeadSha, HEAD);
        return {
          readable: true,
          required: [{ name: 'ci', headSha: HEAD, status: 'COMPLETED', conclusion: 'SUCCESS' }],
        };
      },
      async fetchRepositoryMergeMethods() {
        return ['merge', 'squash', 'rebase'];
      },
      async listCommitSubjects() {
        return ['[#1392] exact-head delivery'];
      },
      async listDirtyPaths() {
        return [];
      },
      async fetchOriginTrunk() {},
      async isAncestor() {
        return true;
      },
      async inspectMergeCommit() {
        return {
          parents: ['d'.repeat(40)],
          commitTitle: '[#1392] exact-head delivery',
          commitMessage: `PR #1391\nSource: ${HEAD}\n\nAttribution: [#1392]`,
        };
      },
      async attributingCommits(issueNumber) {
        return [{ sha: 'c'.repeat(40), subject: `[#${issueNumber}] delivered` }];
      },
      async listIssueComments() {
        return structuredClone(comments);
      },
      async createIssueComment({ body }) {
        const id = `comment-${comments.length + 1}`;
        comments.push({ id, createdAt: '2026-08-23T04:00:01.000Z', body });
        return { id };
      },
      providerId() {
        return 'codex';
      },
      sessionId() {
        return 'session-1392';
      },
      now() {
        return '2026-08-23T04:00:00.000Z';
      },
      createIntentId() {
        return '01ARZ3NDEKTSV4RRFFQ69G5FAV';
      },
    },
  };
}

async function deliver(snapshots) {
  const input = harness(snapshots);
  return runDeliver({ issueNumber: 1392, ...input });
}

test('selects the sole current-head PR from historical branch PRs', async () => {
  const result = await deliver([pullRequest(1385, OLD_HEAD, 'MERGED'), pullRequest(1391, HEAD)]);

  assert.equal(result.status, 'action-required');
  assert.equal(result.action.prNumber, 1391);
});

test('recovers the sole merged current-head PR from historical branch PRs', async () => {
  const result = await deliver([
    pullRequest(1385, OLD_HEAD, 'MERGED'),
    pullRequest(1391, HEAD, 'MERGED'),
  ]);

  assert.equal(result.status, 'delivered');
  assert.equal(result.recovery, true);
  assert.equal(result.intent.prNumber, 1391);
  assert.equal(result.receipt.prNumber, 1391);
});

test('preserves count refusal for zero or duplicate exact-head PRs', async () => {
  for (const heads of [
    [OLD_HEAD, OLD_HEAD],
    [HEAD, HEAD],
  ]) {
    await assert.rejects(
      () => deliver([pullRequest(1385, heads[0]), pullRequest(1391, heads[1])]),
      /delivery-preflight:pull-request-count/
    );
  }
});
