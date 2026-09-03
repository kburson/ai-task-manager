#!/usr/bin/env node
// @story #1490
//
// #1490 (completing acceptance scope) — attribution for an externally merged,
// multi-commit squash that carries GitHub's DEFAULT squash body.
//
// `assertMergeCommitAttribution` requires exactly one `Attribution:` line, as the
// final line. That trailer is part of the authorized-byte contract emitted by the
// governed provider action. External recovery runs with
// `requireAuthorizedBytes: false` and rebuilds the intent from inspected merge
// bytes, so no trailer can exist on a merge a human performed in the GitHub UI.
//
// The first pass of #1490 missed this because its positive fixture used a
// FABRICATED message body, `'Attribution: [#1488]'`, which no real pull request
// produces. The gate was therefore never exercised. The fixtures below are the
// VERBATIM merge bodies of the two real pull requests:
//
//   PR #1487 -> f83eb22f (5 source commits)
//   PR #1489 -> 3a044ea8 (3 source commits, head itself a merge commit)
//
// As in the sibling topology suite, NO fixture sets `pullRequest.mergeMethod`:
// production never provides it, and setting it bypasses the topology proof.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { verifyExternalDeliveredPullRequest } from '../../../../task-tracker/lib/delivery-verification.mjs';

const ACCEPTED = 'a'.repeat(40);
const MERGE_SHA = 'b'.repeat(40);
const BASE_TIP = 'c'.repeat(40);
const ACCEPTED_TREE = 'd'.repeat(40);
const OTHER_TREE = 'e'.repeat(40);
const SOURCE_1 = '1'.repeat(40);
const SOURCE_2 = '2'.repeat(40);
const MERGED_AT = '2026-09-02T18:47:28.000Z';

// Verbatim from `git log -1 --format=%B 3a044ea8`.
const PR1489_TITLE = '[#1488] fix: stop verbStart re-running the Review action after bind (#1489)';
const PR1489_BODY = [
  '* [#1488] fix: stop verbStart re-running the Review action after bind',
  '',
  '* [#1488] test: realign timing-emitter baseline line numbers after resume.mjs comment',
].join('\n');

// Verbatim from `git log -1 --format=%B f83eb22f`.
const PR1487_TITLE = '[#1485] fix: honor recorded custom epic branches in merge-back (#1487)';
const PR1487_BODY = [
  '* docs: design merge-back branch authority [#1485]',
  '',
  '* docs: plan merge-back branch authority [#1485]',
  '',
  '* [#1485] fix: preserve parent issue in epic lineage',
  '',
  '* [#1485] fix: honor custom epic authority in merge-back',
  '',
  '* [#1485] chore: clear lint and spell gates on merge-back authority docs and tests',
].join('\n');

function evidence() {
  return [
    { oid: SOURCE_1, message: 'first', parents: [BASE_TIP], tree: OTHER_TREE },
    { oid: SOURCE_2, message: 'second', parents: [SOURCE_1], tree: OTHER_TREE },
    {
      oid: ACCEPTED,
      message: 'merge trunk in',
      parents: [SOURCE_2, BASE_TIP],
      tree: ACCEPTED_TREE,
    },
  ];
}

function pullRequest() {
  const source = evidence();
  return {
    number: 1489,
    state: 'MERGED',
    merged: true,
    baseRefName: 'trunk',
    headRefName: 'codex/defect-1488-review-bind-timer',
    headRefOid: ACCEPTED,
    mergeCommit: { oid: MERGE_SHA },
    mergedAt: MERGED_AT,
    headRefDeleted: false,
    sourceCommits: source.map(({ oid }) => ({ oid })),
    sourceCommitEvidence: source,
    sourceCommitsComplete: true,
    sourceCommitsHeadSha: ACCEPTED,
  };
}

function input({ issueNumber = 1488, attributionTokens = ['#1488'], title, body } = {}) {
  return {
    acceptedSha: ACCEPTED,
    acceptedReviewSha: ACCEPTED,
    attributingCommits() {
      throw new Error('delivery verification must not use generic subject-only attribution');
    },
    async fetchOriginTrunk() {},
    async inspectMergeCommit() {
      return {
        parents: [BASE_TIP],
        tree: ACCEPTED_TREE,
        commitTitle: title,
        commitMessage: body,
      };
    },
    async isAncestor({ ancestor, descendant }) {
      if (descendant === 'origin/trunk') return true;
      return ancestor === BASE_TIP && descendant === ACCEPTED;
    },
    localHeadSha: ACCEPTED,
    pullRequest: pullRequest(),
    testReceiptSha: ACCEPTED,
    intentInput: {
      intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      supersedesIntentId: null,
      issueNumber,
      repository: 'kburson/ai-task-manager',
      prNumber: 1489,
      baseRef: 'trunk',
      headRef: 'codex/defect-1488-review-bind-timer',
      expectedHeadSha: ACCEPTED,
      mergeMethod: 'squash',
      attributionTokens,
      provider: 'external',
      sessionId: 'session-1490',
      clientCreatedAt: MERGED_AT,
    },
  };
}

test('#1490: PR #1489 real default-squash body recovers without a trailer', async () => {
  const verified = await verifyExternalDeliveredPullRequest(
    input({ title: PR1489_TITLE, body: PR1489_BODY })
  );
  assert.equal(verified.receiptInput.mergeMethod, 'squash');
  assert.equal(verified.receiptInput.mergeCommitSha, MERGE_SHA);
});

test('#1490: PR #1487 real default-squash body recovers without a trailer', async () => {
  const verified = await verifyExternalDeliveredPullRequest(
    input({
      issueNumber: 1485,
      attributionTokens: ['#1485'],
      title: PR1487_TITLE,
      body: PR1487_BODY,
    })
  );
  assert.equal(verified.receiptInput.mergeMethod, 'squash');
});

test('#1490: a multi-token default body carrying every expected token recovers', async () => {
  const verified = await verifyExternalDeliveredPullRequest(
    input({
      attributionTokens: ['#1380', '#1488'],
      title: PR1489_TITLE,
      body: `${PR1489_BODY}\n\n* [#1380] chore: companion change`,
    })
  );
  assert.equal(verified.receiptInput.mergeMethod, 'squash');
});

test('#1490: a missing expected secondary token is refused', async () => {
  // Title carries only the top-level token; #1380 is authorized but absent.
  await assert.rejects(
    verifyExternalDeliveredPullRequest(
      input({ attributionTokens: ['#1380', '#1488'], title: PR1489_TITLE, body: PR1489_BODY })
    ),
    /delivery-verification:attribution/
  );
});

test('#1490: an extra unauthorized token is refused', async () => {
  await assert.rejects(
    verifyExternalDeliveredPullRequest(
      input({
        title: PR1489_TITLE,
        body: `${PR1489_BODY}\n\n* [#9999] unauthorized companion change`,
      })
    ),
    /delivery-verification:attribution/
  );
});

test('#1490: a title not leading with the top-level token is refused', async () => {
  await assert.rejects(
    verifyExternalDeliveredPullRequest(
      input({
        title: 'fix: stop verbStart re-running the Review action after bind (#1489)',
        body: PR1489_BODY,
      })
    ),
    /delivery-verification:attribution/
  );
});

test('#1490: a nonterminal Attribution line does not fall through to the default-body proof', async () => {
  // A body that DOES carry a trailer must be judged by the canonical rule only.
  // Here the trailer exists but is not the final line, so it must refuse rather
  // than be rescued by the default-body proof.
  await assert.rejects(
    verifyExternalDeliveredPullRequest(
      input({
        title: PR1489_TITLE,
        body: `Attribution: [#1488]\n\n${PR1489_BODY}`,
      })
    ),
    /delivery-verification:attribution/
  );
});

test('#1490: a duplicated Attribution line does not fall through to the default-body proof', async () => {
  await assert.rejects(
    verifyExternalDeliveredPullRequest(
      input({
        title: PR1489_TITLE,
        body: `${PR1489_BODY}\n\nAttribution: [#1488]\nAttribution: [#1488]`,
      })
    ),
    /delivery-verification:attribution/
  );
});

test('#1490: an indented canonical-looking trailer does not fall through', async () => {
  // Leading whitespace defeats an anchored `startsWith` check. The body still
  // CLAIMS canonical attribution, so it must be judged by the canonical rule —
  // which it fails on exact bytes — rather than slipping into the semantic proof.
  await assert.rejects(
    verifyExternalDeliveredPullRequest(
      input({
        title: PR1489_TITLE,
        body: `${PR1489_BODY}\n\n Attribution: [#1488]`,
      })
    ),
    /delivery-verification:attribution/
  );
});

test('#1490: a canonical trailer on external recovery still succeeds', async () => {
  const verified = await verifyExternalDeliveredPullRequest(
    input({ title: PR1489_TITLE, body: `${PR1489_BODY}\n\nAttribution: [#1488]` })
  );
  assert.equal(verified.receiptInput.mergeMethod, 'squash');
});
