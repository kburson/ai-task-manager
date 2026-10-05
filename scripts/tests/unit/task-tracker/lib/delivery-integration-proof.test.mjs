// @story #1811 #1873 #1892
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

function mergedBaseFixture() {
  const first = sha('1');
  const sourceMerge = sha('2');
  const integrationBase = sha('3');
  const input = fixture({
    sourceCommits: [
      { oid: first, parents: [base], tree: sha('4'), message: '[#1873] first' },
      {
        oid: sourceMerge,
        parents: [first, integrationBase],
        tree: sha('5'),
        message: '[#1873] integrate trunk',
      },
      { oid: accepted, parents: [sourceMerge], tree, message: '[#1873] accepted' },
    ],
    inspectCommit: async () => ({
      parents: [integrationBase],
      tree,
      commitTitle: 'Squashed',
      commitMessage: 'Observed',
    }),
    isAncestor: async ({ ancestor, descendant }) =>
      (ancestor === merged && descendant === sha('e')) ||
      (ancestor === integrationBase && descendant === integrationBase) ||
      (ancestor === base && descendant === integrationBase),
    compareContent: async ({ method }) => method === 'squash',
  });
  return { input, first, sourceMerge, integrationBase };
}

test('a source merge from the integrated base retains complete squash content proof', async () => {
  const { input, first, sourceMerge, integrationBase } = mergedBaseFixture();
  const proof = await verifyObservedIntegration(input);
  assert.equal(proof.method, 'squash');
  assert.deepEqual(proof.sourceMapping, [
    { source: first, integrated: merged },
    { source: sourceMerge, integrated: merged },
    { source: accepted, integrated: merged },
  ]);
  assert.deepEqual(proof.contentProof, {
    kind: 'equivalent-delta',
    sourceBase: integrationBase,
    sourceHead: accepted,
    integrationBase,
    integrationHead: merged,
  });
});

test('a source merge with an unintegrated secondary parent refuses before content proof', async () => {
  const { input } = mergedBaseFixture();
  input.sourceCommits[1].parents[1] = sha('9');
  input.compareContent = async () => {
    assert.fail('unverified source history reached content proof');
  };
  await assert.rejects(() => verifyObservedIntegration(input), {
    message: 'delivery-integration:source-inventory',
  });
});

test('a source merge does not excuse changed integrated content', async () => {
  const { input } = mergedBaseFixture();
  input.compareContent = async () => false;
  await assert.rejects(() => verifyObservedIntegration(input), {
    message: 'delivery-integration:content-mismatch',
  });
});

test('malformed merge parents and gaps in the first-parent inventory refuse', async () => {
  for (const parents of [
    [sha('1'), 'invalid'],
    [sha('1'), sha('1')],
    [sha('9'), sha('3')],
  ]) {
    const { input } = mergedBaseFixture();
    input.sourceCommits[1].parents = parents;
    input.compareContent = async () => {
      assert.fail('invalid inventory reached content proof');
    };
    await assert.rejects(() => verifyObservedIntegration(input), {
      message: 'delivery-integration:source-inventory',
    });
  }
});

// The older child fork precedes the epic's first commit in the provider inventory.
// Treating this as a flat first-parent chain rejects genuine integrated content.
function childMergeFixture() {
  const input = fixture({
    sourceCommits: [
      { oid: sha('1'), parents: [sha('8')], tree: sha('a'), message: '[#1892] child start' },
      { oid: sha('2'), parents: [base], tree: sha('b'), message: '[#1892] epic start' },
      { oid: sha('3'), parents: [sha('1')], tree: sha('c'), message: '[#1892] child finish' },
      {
        oid: sha('4'),
        parents: [sha('2'), sha('3')],
        tree: sha('d'),
        message: '[#1892] merge child',
      },
      {
        oid: sha('5'),
        parents: [sha('4'), sha('6')],
        tree: sha('f'),
        message: '[#1892] merge trunk',
      },
      { oid: accepted, parents: [sha('5')], tree, message: '[#1892] accepted' },
    ],
    inspectCommit: async () => ({
      parents: [sha('6')],
      tree,
      commitTitle: 'Squashed',
      commitMessage: 'Observed',
    }),
    isAncestor: async ({ ancestor, descendant }) =>
      (ancestor === merged && descendant === sha('e')) ||
      (ancestor === sha('8') && [base, sha('6')].includes(descendant)) ||
      (ancestor === base && descendant === sha('6')) ||
      (ancestor === sha('6') && descendant === sha('6')),
    compareContent: async ({ method, sourceBase, sourceHead, integrationBase, integrationHead }) =>
      ['squash', 'merge'].includes(method) &&
      sourceBase === sha('6') &&
      sourceHead === accepted &&
      integrationBase === sha('6') &&
      integrationHead === merged,
  });
  return input;
}

test('complete child-merge graph verifies squash and preserves every source identity', async () => {
  const proof = await verifyObservedIntegration(childMergeFixture());
  assert.equal(proof.method, 'squash');
  assert.deepEqual(proof.sourceMapping, [
    { source: sha('1'), integrated: merged },
    { source: sha('2'), integrated: merged },
    { source: sha('3'), integrated: merged },
    { source: sha('4'), integrated: merged },
    { source: sha('5'), integrated: merged },
    { source: accepted, integrated: merged },
  ]);
  assert.deepEqual(proof.contentProof, {
    kind: 'equivalent-delta',
    sourceBase: sha('6'),
    sourceHead: accepted,
    integrationBase: sha('6'),
    integrationHead: merged,
  });
});

test('complete child graph also proves ordinary merge with original source identities', async () => {
  const input = childMergeFixture();
  input.inspectCommit = async () => ({
    parents: [sha('6'), accepted],
    tree,
    commitTitle: 'Merged',
    commitMessage: 'Observed',
  });
  const proof = await verifyObservedIntegration(input);
  assert.equal(proof.method, 'merge');
  assert.deepEqual(
    proof.sourceMapping.map(({ source, integrated }) => [source, integrated]),
    [
      [sha('1'), sha('1')],
      [sha('2'), sha('2')],
      [sha('3'), sha('3')],
      [sha('4'), sha('4')],
      [sha('5'), sha('5')],
      [accepted, accepted],
    ]
  );
});

test('child graph does not excuse changed integrated content', async () => {
  const input = childMergeFixture();
  input.compareContent = async () => false;
  await assert.rejects(() => verifyObservedIntegration(input), {
    message: 'delivery-integration:content-mismatch',
  });
});

test('unintegrated external first parent of a child refuses before content comparison', async () => {
  const input = childMergeFixture();
  input.sourceCommits[0].parents = [sha('9')];
  input.compareContent = async () => assert.fail('unintegrated child reached content proof');
  await assert.rejects(() => verifyObservedIntegration(input), {
    message: 'delivery-integration:source-inventory',
  });
});

for (const [name, corrupt] of [
  ['duplicate', (commits) => commits.splice(1, 0, { ...commits[0] })],
  [
    'cycle',
    (commits) => {
      commits[0].parents = [sha('3')];
    },
  ],
  [
    'forward parent',
    (commits) => {
      [commits[0], commits[2]] = [commits[2], commits[0]];
    },
  ],
  [
    'disconnected',
    (commits) =>
      commits.splice(0, 0, {
        oid: sha('7'),
        parents: [base],
        tree,
        message: '[#1892] disconnected',
      }),
  ],
  ['missing child tip', (commits) => commits.splice(2, 1)],
  [
    'missing entire child',
    (commits) => {
      commits.splice(2, 1);
      commits.splice(0, 1);
    },
  ],
  [
    'malformed parent',
    (commits) => {
      commits[3].parents[1] = 'invalid';
    },
  ],
]) {
  test(name + ' child inventory refuses before content comparison', async () => {
    const input = childMergeFixture();
    corrupt(input.sourceCommits);
    input.compareContent = async () => assert.fail('invalid graph reached content proof');
    await assert.rejects(() => verifyObservedIntegration(input), {
      message: 'delivery-integration:source-inventory',
    });
  });
}
