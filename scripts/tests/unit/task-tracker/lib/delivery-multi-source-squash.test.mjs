#!/usr/bin/env node
// @story #1490
// cspell:ignore rebaseable
//
// #1490 — externally squash-merged MULTI-COMMIT pull requests must be provable.
//
// `provesSingleSourceSquash` only proves a squash when the pull request held
// exactly one non-merge source commit. Every multi-commit pull request merged
// through the GitHub UI therefore reached `delivery-verification:merge-method-unknown`
// and could never obtain a receipt, so its issue could never close. Observed on
// #1485 (PR #1487, 5 source commits) and #1488 (PR #1489, 3 source commits, head
// itself a merge commit).
//
// GitHub exposes no authoritative historical merge method — verified live against
// PR #1489: `merged`, `merged_by`, `merge_commit_sha`, `mergeable`,
// `mergeable_state`, `auto_merge` only; `rebaseable` and
// `squash_merge_commit_title` are null after merge. The production adapter
// consequently never sets `pullRequest.mergeMethod`. A topology proof is required.
//
// EVERY fixture here deliberately OMITS `pullRequest.mergeMethod`. Setting it
// short-circuits `verifyLiveDelivery` through `mergeMethodObservation` and the
// proof under test would never run.

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
const REWRITE = 'f'.repeat(40);
const MERGED_AT = '2026-09-02T18:47:28.000Z';

// The REAL merge bytes of PR #1489 (`git log -1 --format=%B 3a044ea8`): GitHub's
// default squash title and bullet body, with NO `Attribution:` trailer. The first
// pass of this suite used a fabricated `'Attribution: [#1488]'` body, which no
// real pull request produces — that fiction satisfied the attribution gate and so
// never exercised it. Attribution behaviour itself is covered in
// `delivery-default-squash-attribution.test.mjs`.
const COMMIT_TITLE = '[#1488] fix: stop verbStart re-running the Review action after bind (#1489)';
const COMMIT_MESSAGE = [
  '* [#1488] fix: stop verbStart re-running the Review action after bind',
  '',
  '* [#1488] test: realign timing-emitter baseline line numbers after resume.mjs comment',
].join('\n');

// Three source commits whose head is itself a MERGE commit — PR #1489's exact
// shape, and the case that also defeats the single-source proof's one-parent rule.
function multiSourceEvidence({ headParents = [SOURCE_2, BASE_TIP] } = {}) {
  return [
    { oid: SOURCE_1, message: 'first', parents: [BASE_TIP], tree: OTHER_TREE },
    { oid: SOURCE_2, message: 'second', parents: [SOURCE_1], tree: OTHER_TREE },
    { oid: ACCEPTED, message: 'merge trunk in', parents: headParents, tree: ACCEPTED_TREE },
  ];
}

function pullRequest(overrides = {}) {
  const evidence = overrides.sourceCommitEvidence ?? multiSourceEvidence();
  return {
    number: 1489,
    state: 'MERGED',
    merged: true,
    baseRefName: 'trunk',
    headRefName: 'codex/defect-1488-review-bind-timer',
    headRefOid: ACCEPTED,
    mergeCommit: { oid: overrides.mergeSha ?? MERGE_SHA },
    mergedAt: MERGED_AT,
    headRefDeleted: false,
    sourceCommits: evidence.map(({ oid }) => ({ oid })),
    sourceCommitEvidence: evidence,
    sourceCommitsComplete: overrides.sourceCommitsComplete ?? true,
    sourceCommitsHeadSha: overrides.sourceCommitsHeadSha ?? ACCEPTED,
    // mergeMethod intentionally absent — see file header.
  };
}

function intentInput() {
  return {
    intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    supersedesIntentId: null,
    issueNumber: 1488,
    repository: 'kburson/ai-task-manager',
    prNumber: 1489,
    baseRef: 'trunk',
    headRef: 'codex/defect-1488-review-bind-timer',
    expectedHeadSha: ACCEPTED,
    mergeMethod: 'squash',
    attributionTokens: ['#1488'],
    provider: 'external',
    sessionId: 'session-1490',
    clientCreatedAt: MERGED_AT,
  };
}

function input(overrides = {}) {
  const {
    inspection = {
      parents: [BASE_TIP],
      tree: ACCEPTED_TREE,
      commitTitle: COMMIT_TITLE,
      commitMessage: COMMIT_MESSAGE,
    },
    ancestors = new Set([`${BASE_TIP}->${ACCEPTED}`]),
    pr = pullRequest(),
  } = overrides;
  return {
    acceptedSha: ACCEPTED,
    acceptedReviewSha: ACCEPTED,
    attributingCommits() {
      throw new Error('delivery verification must not use generic subject-only attribution');
    },
    async fetchOriginTrunk() {},
    async inspectMergeCommit() {
      return inspection;
    },
    async isAncestor({ ancestor, descendant }) {
      // Trunk reachability of the merge commit is asserted separately upstream.
      if (descendant === 'origin/trunk') return true;
      return ancestors.has(`${ancestor}->${descendant}`);
    },
    localHeadSha: ACCEPTED,
    pullRequest: pr,
    testReceiptSha: ACCEPTED,
    intentInput: intentInput(),
  };
}

test('#1490: a multi-commit external squash whose head is a merge commit is proven', async () => {
  const verified = await verifyExternalDeliveredPullRequest(input());
  assert.equal(verified.receiptInput.mergeMethod, 'squash');
  assert.equal(verified.receiptInput.mergeCommitSha, MERGE_SHA);
  assert.equal(verified.receiptInput.expectedHeadSha, ACCEPTED);
});

test('#1490: a multi-commit external squash of ordinary commits is proven', async () => {
  // PR #1487's shape: no merge commit at the head.
  const evidence = multiSourceEvidence({ headParents: [SOURCE_2] });
  const verified = await verifyExternalDeliveredPullRequest(
    input({ pr: pullRequest({ sourceCommitEvidence: evidence }) })
  );
  assert.equal(verified.receiptInput.mergeMethod, 'squash');
});

test('#1490: a multi-commit rebase is refused because its parent is a fresh rewrite', async () => {
  // A rebase replays each source commit onto the base. The merge SHA is the LAST
  // replayed commit, so its parent is a newly created rewrite that never existed
  // on the source branch and therefore is not an ancestor of the accepted head.
  await assert.rejects(
    verifyExternalDeliveredPullRequest(
      input({
        inspection: {
          parents: [REWRITE],
          tree: ACCEPTED_TREE,
          commitTitle: COMMIT_TITLE,
          commitMessage: COMMIT_MESSAGE,
        },
        ancestors: new Set(),
      })
    ),
    /merge-method-unknown/
  );
});

test('#1490: tree equality alone does not prove a squash', async () => {
  // Guards the conjunction: same tree, but the parent is not an ancestor of the
  // accepted head. A rebase produces exactly this, so this must still refuse.
  await assert.rejects(
    verifyExternalDeliveredPullRequest(input({ ancestors: new Set() })),
    /merge-method-unknown/
  );
});

test('#1490: a merged tree differing from the accepted tree is refused', async () => {
  // Covers a squash that dropped content, and a descendant that reverted it:
  // either way the tree moves.
  await assert.rejects(
    verifyExternalDeliveredPullRequest(
      input({
        inspection: {
          parents: [BASE_TIP],
          tree: OTHER_TREE,
          commitTitle: COMMIT_TITLE,
          commitMessage: COMMIT_MESSAGE,
        },
      })
    ),
    /merge-method-unknown/
  );
});

test('#1490: an incomplete or unbound source inventory is refused', async () => {
  await assert.rejects(
    verifyExternalDeliveredPullRequest(
      input({ pr: pullRequest({ sourceCommitsComplete: false }) })
    ),
    /merge-method-unknown/
  );
  await assert.rejects(
    verifyExternalDeliveredPullRequest(
      input({ pr: pullRequest({ sourceCommitsHeadSha: SOURCE_1 }) })
    ),
    /merge-method-unknown/
  );
});

test('#1490: an ordinary two-parent merge is classified as a merge, never a squash', async () => {
  await assert.rejects(
    verifyExternalDeliveredPullRequest(
      input({
        inspection: {
          parents: [BASE_TIP, ACCEPTED],
          tree: ACCEPTED_TREE,
          commitTitle: COMMIT_TITLE,
          commitMessage: COMMIT_MESSAGE,
        },
      })
    ),
    /merge-method$/
  );
});

test('#1490: a fast-forward is refused', async () => {
  await assert.rejects(
    verifyExternalDeliveredPullRequest(input({ pr: pullRequest({ mergeSha: ACCEPTED }) })),
    /merge-method-unknown|merge-commit-sha/
  );
});

// #1490 — the inventory/evidence pairing is proven HERE, not assumed from the
// production adapter. An adapter defect, a partial page, or a hand-supplied
// pull-request object must not be able to smuggle an inventory that does not
// actually describe the accepted head's history.

function withSource(entries) {
  return {
    ...pullRequest(),
    sourceCommits: entries.map(({ oid }) => ({ oid })),
    sourceCommitEvidence: entries,
  };
}

test('#1490: an inventory and evidence of differing length are refused', async () => {
  const full = multiSourceEvidence();
  const pr = withSource(full);
  pr.sourceCommitEvidence = full.slice(0, 2);
  await assert.rejects(verifyExternalDeliveredPullRequest(input({ pr })), /merge-method-unknown/);
});

test('#1490: a reordered inventory and evidence pairing is refused', async () => {
  const full = multiSourceEvidence();
  const pr = withSource(full);
  // Same set, different order. Set membership would accept this, so the proof
  // must compare positionally.
  pr.sourceCommits = [full[1], full[0], full[2]].map(({ oid }) => ({ oid }));
  await assert.rejects(verifyExternalDeliveredPullRequest(input({ pr })), /merge-method-unknown/);
});

test('#1490: a duplicated source OID is refused', async () => {
  const pr = withSource([
    { oid: SOURCE_1, message: 'first', parents: [BASE_TIP], tree: OTHER_TREE },
    { oid: SOURCE_1, message: 'again', parents: [BASE_TIP], tree: OTHER_TREE },
    { oid: ACCEPTED, message: 'head', parents: [SOURCE_1], tree: ACCEPTED_TREE },
  ]);
  await assert.rejects(verifyExternalDeliveredPullRequest(input({ pr })), /merge-method-unknown/);
});

test('#1490: an accepted head that does not terminate the inventory is refused', async () => {
  const pr = withSource([
    { oid: SOURCE_1, message: 'first', parents: [BASE_TIP], tree: OTHER_TREE },
    { oid: ACCEPTED, message: 'head', parents: [SOURCE_1], tree: ACCEPTED_TREE },
    { oid: SOURCE_2, message: 'after the head', parents: [ACCEPTED], tree: OTHER_TREE },
  ]);
  await assert.rejects(verifyExternalDeliveredPullRequest(input({ pr })), /merge-method-unknown/);
});

test('#1490: evidence missing required structure is refused', async () => {
  const malformed = multiSourceEvidence();
  delete malformed[0].tree;
  await assert.rejects(
    verifyExternalDeliveredPullRequest(input({ pr: withSource(malformed) })),
    /merge-method-unknown/
  );
});
