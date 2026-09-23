// @story #1755

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  canonicalSourceInventory,
  verifyLocalSourceInventory,
} from '../../../../task-tracker/lib/delivery-attribution-exception.mjs';

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
    { oid: A, message: '\nfirst subject', reachable: true },
    { oid: A, message: ' first subject\nbody', reachable: true },
    { oid: A, message: 'first subject\nbody', reachable: false },
    { oid: B, message: 'first subject\nbody', reachable: true },
  ]) {
    await assert.rejects(() =>
      verifyLocalSourceInventory({
        commits,
        headSha: HEAD,
        inspectLocalCommit: async ({ commitSha }) =>
          commitSha === A ? invalid : { oid: HEAD, message: '[#1755] tip', reachable: true },
      })
    );
  }
});
