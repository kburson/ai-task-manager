// @story #1811
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  diagnoseDeliverySnapshot,
  verifyObservedIntegration,
} from '../../../../task-tracker/lib/delivery-integration-proof.mjs';

const sha = (digit) => digit.repeat(40);
const base = '6363654f9b7310b4477e4b27870830ded0a00389';
const accepted = 'edaa8e402f340af3ca15b5b36ec845b038040d58';
const merged = 'c862f2ba6e6d1a278fa0525f2a79599a5cc9a818';
const tree = 'f6efaa724e7502761c26c8b2d146a5f3b5e43266';

function fixture(overrides = {}) {
  const source = { oid: accepted, parents: [base], tree, message: '[#1784] source' };
  return {
    repository: 'kburson/ai-task-manager',
    requestedMergeMethod: 'squash',
    requestedCommitTitle: '[#1784] Governed PR delivery',
    requestedCommitMessage:
      'PR #1785\nSource: edaa8e402f340af3ca15b5b36ec845b038040d58\n\nAttribution: [#1784]',
    pullRequest: {
      number: 1785,
      merged: true,
      baseRefName: 'trunk',
      sourceCommitsComplete: true,
      sourceCommitsHeadSha: accepted,
      headRefOid: accepted,
      mergeCommitSha: merged,
    },
    acceptedHeadSha: accepted,
    mergedCommitSha: merged,
    sourceCommits: [source],
    inspectCommit: async ({ commitSha }) => {
      assert.equal(commitSha, merged);
      return {
        parents: [base, accepted],
        tree,
        commitTitle: 'Merge pull request #1785 from kburson/claude/1755-final-acceptance-ad486a',
        commitMessage:
          '[#1784] docs(peer-review): record terminal acceptance for the #1755 specification',
      };
    },
    isAncestor: async ({ ancestor, descendant }) => ancestor === merged && descendant === sha('e'),
    compareContent: async () => true,
    trunkRef: sha('e'),
    ...overrides,
  };
}

test('the real accepted head and two-parent merge topology prove an observed merge', async () => {
  const proof = await verifyObservedIntegration(fixture());
  assert.equal(proof.method, 'merge');
  assert.equal(proof.mergeCommitSha, merged);
  assert.deepEqual(proof.parents, [base, accepted]);
  assert.equal(proof.tree, tree);
  assert.equal(
    proof.title,
    'Merge pull request #1785 from kburson/claude/1755-final-acceptance-ad486a'
  );
  assert.equal(
    proof.message,
    '[#1784] docs(peer-review): record terminal acceptance for the #1755 specification'
  );
  assert.equal(Object.isFrozen(proof), true);
});

test('changed integrated content refuses despite matching merge topology', async () => {
  await assert.rejects(
    () => verifyObservedIntegration(fixture({ compareContent: async () => false })),
    { message: 'delivery-integration:content-mismatch' }
  );
});

test('wrong accepted head and incomplete source inventory refuse', async () => {
  await assert.rejects(() => verifyObservedIntegration(fixture({ acceptedHeadSha: sha('b') })), {
    message: 'delivery-integration:accepted-head',
  });
  await assert.rejects(() => verifyObservedIntegration(fixture({ sourceCommits: [] })), {
    message: 'delivery-integration:source-inventory',
  });
});

test('an unreachable merge refuses even when topology and content agree', async () => {
  await assert.rejects(
    () => verifyObservedIntegration(fixture({ isAncestor: async () => false })),
    { message: 'delivery-integration:trunk-reachability' }
  );
});

test('a multi-source squash maps the complete source delta to one integrated commit', async () => {
  const first = sha('1');
  const squash = fixture({
    sourceCommits: [
      { oid: first, parents: [base], tree: sha('2'), message: '[#1784] first' },
      { oid: accepted, parents: [first], tree, message: '[#1784] second' },
    ],
    inspectCommit: async () => ({
      parents: [base],
      tree,
      commitTitle: 'Squashed',
      commitMessage: 'Observed',
    }),
    compareContent: async ({ method }) => method === 'squash',
    isAncestor: async ({ ancestor, descendant }) =>
      (ancestor === merged && descendant === sha('e')) ||
      (ancestor === base && (descendant === accepted || descendant === base)),
  });
  const proof = await verifyObservedIntegration(squash);
  assert.equal(proof.method, 'squash');
  assert.deepEqual(
    proof.sourceMapping.map((item) => item.source),
    [first, accepted]
  );
});

test('a rebase requires every source delta mapped in order to a replayed commit', async () => {
  const first = sha('1');
  const replayFirst = sha('3');
  const replayBase = sha('4');
  const replay = fixture({
    sourceCommits: [
      { oid: first, parents: [base], tree: sha('2'), message: '[#1784] first' },
      { oid: accepted, parents: [first], tree, message: '[#1784] second' },
    ],
    inspectCommit: async ({ commitSha }) =>
      commitSha === merged
        ? { parents: [replayFirst], tree, commitTitle: 'Second', commitMessage: 'Observed' }
        : {
            parents: [replayBase],
            tree: sha('5'),
            commitTitle: 'First',
            commitMessage: 'Observed',
          },
    isAncestor: async ({ ancestor, descendant }) =>
      (ancestor === merged && descendant === sha('e')) ||
      (ancestor === base && descendant === replayBase),
    compareContent: async ({ method }) => method === 'rebase-step' || method === 'rebase-total',
  });
  const proof = await verifyObservedIntegration(replay);
  assert.equal(proof.method, 'rebase');
  assert.deepEqual(
    proof.sourceMapping.map((item) => item.integrated),
    [replayFirst, merged]
  );
});

test('a partial or changed replay refuses instead of accepting the final tree alone', async () => {
  const first = sha('1');
  const replayFirst = sha('3');
  const replayBase = sha('4');
  const replay = fixture({
    sourceCommits: [
      { oid: first, parents: [base], tree: sha('2'), message: '[#1784] first' },
      { oid: accepted, parents: [first], tree, message: '[#1784] second' },
    ],
    inspectCommit: async ({ commitSha }) =>
      commitSha === merged
        ? { parents: [replayFirst], tree, commitTitle: 'Second', commitMessage: 'Observed' }
        : {
            parents: [replayBase],
            tree: sha('5'),
            commitTitle: 'First',
            commitMessage: 'Observed',
          },
    isAncestor: async ({ ancestor, descendant }) =>
      (ancestor === merged && descendant === sha('e')) ||
      (ancestor === base && descendant === replayBase),
    compareContent: async ({ method, sourceHead }) =>
      method === 'rebase-total' || sourceHead !== first,
  });
  await assert.rejects(() => verifyObservedIntegration(replay), {
    message: 'delivery-integration:content-mismatch',
  });
});

test('one read-only diagnosis reports independent blockers from the same snapshot', async () => {
  const observation = fixture({
    pullRequest: {
      number: 999,
      merged: false,
      baseRefName: 'trunk',
      sourceCommitsComplete: true,
      sourceCommitsHeadSha: accepted,
      headRefOid: sha('b'),
      mergeCommitSha: merged,
    },
    isAncestor: async () => false,
  });
  const before = structuredClone({ pullRequest: observation.pullRequest });
  const diagnosis = await diagnoseDeliverySnapshot({
    ...observation,
    intent: { issueNumber: 1784, prNumber: 1785, expectedHeadSha: accepted, baseRef: 'trunk' },
    testReceiptSha: sha('c'),
    acceptedReviewSha: sha('d'),
    agentReviewPassed: false,
    requiredChecks: [{ headSha: accepted, conclusion: 'FAILURE' }],
    sourceAttribution: false,
  });
  assert.deepEqual(
    diagnosis.failures.map(({ predicate }) => predicate),
    [
      'pr-number',
      'pr-merged',
      'accepted-head',
      'test-head',
      'review-head',
      'review-complete',
      'required-checks',
      'source-attribution',
      'trunk-reachability',
      'integration-proof',
    ]
  );
  assert.deepEqual({ pullRequest: observation.pullRequest }, before);
  assert.equal(Object.isFrozen(diagnosis), true);
});

test('incomplete inventory and contradictory merged SHA refuse before content comparison', async () => {
  const incomplete = fixture();
  incomplete.pullRequest.sourceCommitsComplete = false;
  await assert.rejects(() => verifyObservedIntegration(incomplete), {
    message: 'delivery-integration:source-inventory',
  });
  const contradictory = fixture();
  contradictory.pullRequest.mergeCommitSha = sha('9');
  await assert.rejects(() => verifyObservedIntegration(contradictory), {
    message: 'delivery-integration:accepted-head',
  });
});

test('single-parent rewrite without a complete content mapping refuses', async () => {
  const unknown = fixture({
    inspectCommit: async () => ({
      parents: [sha('9')],
      tree,
      commitTitle: 'Unknown',
      commitMessage: '',
    }),
    isAncestor: async ({ ancestor }) => ancestor === merged,
  });
  await assert.rejects(() => verifyObservedIntegration(unknown), {
    message: 'delivery-integration:merge-topology',
  });
});

test('diagnosis identifies an unavailable inspection dependency as indeterminate', async () => {
  const observation = fixture({
    inspectCommit: async () => {
      throw new Error('Git object unavailable');
    },
  });
  const diagnosis = await diagnoseDeliverySnapshot({
    ...observation,
    intent: { issueNumber: 1784, prNumber: 1785, expectedHeadSha: accepted, baseRef: 'trunk' },
    testReceiptSha: accepted,
    acceptedReviewSha: accepted,
    agentReviewPassed: true,
    requiredChecks: [{ headSha: accepted, conclusion: 'SUCCESS' }],
    sourceAttribution: true,
  });
  assert.deepEqual(diagnosis.failures, [
    { predicate: 'integration-proof', status: 'indeterminate', detail: 'Git object unavailable' },
  ]);
});

test('diagnosis pins PR and checks before asynchronous proof callbacks', async () => {
  const observation = fixture();
  const snapshot = {
    ...observation,
    intent: { issueNumber: 1784, prNumber: 1785, expectedHeadSha: accepted, baseRef: 'trunk' },
    testReceiptSha: accepted,
    acceptedReviewSha: accepted,
    agentReviewPassed: true,
    requiredChecks: [{ headSha: accepted, conclusion: 'SUCCESS' }],
    sourceAttribution: true,
    isAncestor: async () => {
      snapshot.pullRequest.headRefOid = sha('9');
      snapshot.requiredChecks[0].conclusion = 'FAILURE';
      return true;
    },
  };
  const diagnosis = await diagnoseDeliverySnapshot(snapshot);
  assert.equal(diagnosis.ok, true);
  assert.equal(diagnosis.proof.method, 'merge');
});
