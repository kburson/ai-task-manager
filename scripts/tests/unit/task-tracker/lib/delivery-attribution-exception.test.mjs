// @story #1755

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  canonicalSourceInventory,
  evaluateDeliveryAttributionException,
  verifyLocalSourceInventory,
} from '../../../../task-tracker/lib/delivery-attribution-exception.mjs';
import { buildDeliveryCommitText } from '../../../../task-tracker/lib/delivery-attribution.mjs';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const HEAD = 'c'.repeat(40);

test('raw inventory digest retains SHA identity and ordered duplicate subjects', () => {
  const commits = [
    { oid: A, messageHeadline: 'same subject' },
    { oid: B, messageHeadline: 'same subject' },
    { oid: HEAD, messageHeadline: '[#1755] tip' },
  ];
  const first = canonicalSourceInventory(commits, HEAD);
  const reordered = canonicalSourceInventory([commits[1], commits[0], commits[2]], HEAD);

  assert.deepEqual(first.commits, commits);
  assert.match(first.sourceDigest, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(first.sourceDigest, reordered.sourceDigest);
  assert.equal(canonicalSourceInventory(commits, HEAD).sourceDigest, first.sourceDigest);
  assert.throws(() => canonicalSourceInventory([commits[0], commits[0], commits[2]], HEAD));
  assert.throws(() => canonicalSourceInventory(commits, B));
});

test('local proof compares the physical first line and reachability for every SHA', async () => {
  const commits = [
    { oid: A, messageHeadline: 'first subject' },
    { oid: HEAD, messageHeadline: '[#1755] tip' },
  ];
  const observed = [];
  const inspectLocalCommit = async ({ commitSha, headSha }) => {
    observed.push([commitSha, headSha]);
    return {
      oid: commitSha,
      message: commitSha === A ? 'first subject\r\nbody' : '[#1755] tip\nbody',
      reachable: true,
      localHeadSha: HEAD,
    };
  };

  assert.equal(
    await verifyLocalSourceInventory({ commits, headSha: HEAD, inspectLocalCommit }),
    true
  );
  assert.deepEqual(observed, [
    [A, HEAD],
    [HEAD, HEAD],
  ]);

  for (const invalid of [
    null,
    { oid: A, message: '\nfirst subject', reachable: true, localHeadSha: HEAD },
    { oid: A, message: ' first subject\nbody', reachable: true, localHeadSha: HEAD },
    { oid: A, message: 'first subject\nbody', reachable: false, localHeadSha: HEAD },
    { oid: B, message: 'first subject\nbody', reachable: true, localHeadSha: HEAD },
    { oid: A, message: 'first subject\nbody', reachable: true, localHeadSha: B },
  ]) {
    await assert.rejects(() =>
      verifyLocalSourceInventory({
        commits,
        headSha: HEAD,
        inspectLocalCommit: async ({ commitSha }) =>
          commitSha === A
            ? invalid
            : { oid: HEAD, message: '[#1755] tip', reachable: true, localHeadSha: HEAD },
      })
    );
  }
});

test('an empty physical first line cannot authorize a source commit', async () => {
  const commits = [
    { oid: A, messageHeadline: '' },
    { oid: HEAD, messageHeadline: '[#1755] tip' },
  ];
  assert.throws(() => canonicalSourceInventory(commits, HEAD));
  await assert.rejects(() =>
    verifyLocalSourceInventory({
      commits,
      headSha: HEAD,
      inspectLocalCommit: async ({ commitSha }) => ({
        oid: commitSha,
        message: commitSha === A ? '\nbody after empty first line' : '[#1755] tip\nbody',
        reachable: true,
        localHeadSha: HEAD,
      }),
    })
  );
});

test('exact SHA mappings yield deterministic bounded commit text without relaxing ordinary attribution', () => {
  const commits = [
    { oid: A, messageHeadline: 'same subject' },
    { oid: B, messageHeadline: 'same subject' },
    { oid: HEAD, messageHeadline: '[#1755] tip [#1757] child' },
  ];
  const input = {
    issueNumber: 1755,
    prNumber: 1800,
    expectedHeadSha: HEAD,
    commits,
    attributableCommits: commits,
    verifiedMergeShas: [],
    mappings: [
      { oid: A, messageHeadline: 'same subject', issueNumber: 1755 },
      { oid: B, messageHeadline: 'same subject', issueNumber: 1756 },
    ],
  };
  assert.throws(() =>
    buildDeliveryCommitText({
      issueNumber: 1755,
      prNumber: 1800,
      expectedHeadSha: HEAD,
      commitSubjects: commits.map(({ messageHeadline }) => messageHeadline),
    })
  );
  const first = evaluateDeliveryAttributionException(input);
  assert.deepEqual(first, evaluateDeliveryAttributionException(input));
  assert.deepEqual(first.attributionTokens, ['#1755', '#1756', '#1757']);
  assert.equal(first.attributionDisposition, 'waived');
  assert.match(first.commitTitleSha256, /^[0-9a-f]{64}$/);
  assert.match(first.commitMessageSha256, /^[0-9a-f]{64}$/);
  for (const mappings of [
    [input.mappings[0]],
    [...input.mappings, input.mappings[0]],
    [
      ...input.mappings,
      { oid: HEAD, messageHeadline: commits[2].messageHeadline, issueNumber: 1755 },
    ],
    [{ ...input.mappings[0], messageHeadline: 'wrong' }, input.mappings[1]],
    [{ ...input.mappings[0], issueNumber: 0 }, input.mappings[1]],
    [{ ...input.mappings[0], issueNumber: '#1755' }, input.mappings[1]],
  ])
    assert.throws(() => evaluateDeliveryAttributionException({ ...input, mappings }));
  assert.throws(() => evaluateDeliveryAttributionException({ ...input, issueNumber: 1758 }));
  assert.throws(() =>
    evaluateDeliveryAttributionException({
      ...input,
      commits: [commits[0], commits[1], { ...commits[2], messageHeadline: '[#0] invalid' }],
      attributableCommits: [
        commits[0],
        commits[1],
        { ...commits[2], messageHeadline: '[#0] invalid' },
      ],
    })
  );
});

test('only verified merge SHAs are excluded from exceptional mappings', () => {
  const commits = [
    { oid: A, messageHeadline: 'Merge #12 from branch' },
    { oid: HEAD, messageHeadline: '[#1755] tip' },
  ];
  const base = {
    issueNumber: 1755,
    prNumber: 1800,
    expectedHeadSha: HEAD,
    commits,
    attributableCommits: commits,
    verifiedMergeShas: [],
    mappings: [{ oid: A, messageHeadline: commits[0].messageHeadline, issueNumber: 1755 }],
  };
  assert.equal(evaluateDeliveryAttributionException(base).attributionDisposition, 'waived');
  assert.throws(() => evaluateDeliveryAttributionException({ ...base, mappings: [] }));
  assert.throws(() =>
    evaluateDeliveryAttributionException({
      ...base,
      attributableCommits: [commits[1]],
      verifiedMergeShas: [A],
    })
  );
  assert.throws(() =>
    evaluateDeliveryAttributionException({
      ...base,
      attributableCommits: [commits[1]],
      verifiedMergeShas: [A],
      mappings: [],
    })
  );
  const cleanMerge = { oid: A, messageHeadline: 'Merge remote changes' };
  assert.equal(
    evaluateDeliveryAttributionException({
      ...base,
      commits: [cleanMerge, commits[1]],
      attributableCommits: [commits[1]],
      verifiedMergeShas: [A],
      mappings: [],
    }).attributionDisposition,
    'waived'
  );
});
