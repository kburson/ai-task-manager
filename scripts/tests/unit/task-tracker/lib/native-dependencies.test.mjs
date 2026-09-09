// @story #1557
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  convergeBlockedBySet,
  normalizeDependencyConnection,
  readNativeDependencies,
} from '../../../../task-tracker/lib/native-dependencies.mjs';

const repoNode = (number, repo = 'o/r') => ({
  number,
  repository: { nameWithOwner: repo },
  url: `https://github.com/${repo}/issues/${number}`,
});

test('normalizes a complete connection into sorted repository issue refs', () => {
  assert.deepEqual(
    normalizeDependencyConnection(
      { nodes: [repoNode(9), repoNode(4)], totalCount: 2 },
      { repo: 'o/r', issueNumber: 12, relation: 'blockedBy' }
    ),
    [4, 9]
  );
});

test('derives repository identity from production-shaped dependency URLs', () => {
  assert.deepEqual(
    normalizeDependencyConnection(
      { nodes: [{ number: 4, url: 'https://github.com/o/r/issues/4' }], totalCount: 1 },
      { repo: 'o/r', issueNumber: 12, relation: 'blockedBy' }
    ),
    [4]
  );
  assert.deepEqual(
    normalizeDependencyConnection(
      { nodes: [{ number: 4, repository: { nameWithOwner: 'o/r' } }], totalCount: 1 },
      { repo: 'o/r', issueNumber: 12, relation: 'blockedBy' }
    ),
    [4]
  );
});

test('rejects absent, malformed, conflicting, and foreign repository identity', () => {
  for (const node of [
    { number: 4 },
    { number: 4, url: 'not-a-url' },
    { number: 4, url: 'https://github.com/o/r/issues/9' },
    { number: 4, url: 'https://github.com/other/repo/issues/4' },
    { number: 4, repository: { nameWithOwner: 'o/r' }, url: 'https://github.com/x/y/issues/4' },
  ]) {
    assert.throws(
      () =>
        normalizeDependencyConnection(
          { nodes: [node], totalCount: 1 },
          { repo: 'o/r', issueNumber: 12, relation: 'blockedBy' }
        ),
      /native-dependencies:blockedBy-(repository|identity)/
    );
  }
});

test('refuses incomplete, malformed, foreign, duplicate, and self connections', () => {
  const invalid = [
    null,
    { nodes: [], totalCount: 1 },
    { nodes: [{ number: 0 }], totalCount: 1 },
    { nodes: [repoNode(4, 'x/y')], totalCount: 1 },
    { nodes: [repoNode(4), repoNode(4)], totalCount: 2 },
    { nodes: [repoNode(12)], totalCount: 1 },
  ];
  for (const connection of invalid) {
    assert.throws(
      () =>
        normalizeDependencyConnection(connection, {
          repo: 'o/r',
          issueNumber: 12,
          relation: 'blockedBy',
        }),
      /native-dependencies:/
    );
  }
});

test('reads and normalizes both native dependency directions', async () => {
  const calls = [];
  const result = await readNativeDependencies({
    issueNumber: 12,
    repo: 'o/r',
    deps: {
      pexec: async (file, args) => {
        calls.push({ file, args });
        return {
          stdout: JSON.stringify({
            blockedBy: { nodes: [repoNode(9), repoNode(4)], totalCount: 2 },
            blocking: { nodes: [repoNode(20)], totalCount: 1 },
          }),
        };
      },
    },
  });
  assert.deepEqual(result, { blockedBy: [4, 9], blocking: [20] });
  assert.equal(calls[0].file, 'gh');
  assert.deepEqual(calls[0].args.slice(0, 4), ['issue', 'view', '12', '-R']);
  assert.ok(calls[0].args.includes('blockedBy,blocking'));
});

test('converges an exact set with only missing additions and present removals', async () => {
  const edits = [];
  let reads = 0;
  const result = await convergeBlockedBySet({
    issueNumber: 20,
    repo: 'o/r',
    desired: [12, 4, 12],
    deps: {
      readNativeDependencies: async () => {
        reads += 1;
        return reads === 1
          ? { blockedBy: [4, 9], blocking: [] }
          : { blockedBy: [4, 12], blocking: [] };
      },
      editDependency: async (input) => edits.push(input),
    },
  });
  assert.deepEqual(
    edits.map(({ operation, ref }) => ({ operation, ref })),
    [
      { operation: 'remove', ref: 9 },
      { operation: 'add', ref: 12 },
    ]
  );
  assert.deepEqual(result, {
    status: 'updated',
    existing: [4, 9],
    desired: [4, 12],
    added: [12],
    removed: [9],
  });
});

test('exact-set convergence is idempotent but still verifies readback', async () => {
  let reads = 0;
  const result = await convergeBlockedBySet({
    issueNumber: 12,
    repo: 'o/r',
    desired: [4, 9],
    deps: {
      readNativeDependencies: async () => {
        reads += 1;
        return { blockedBy: [4, 9], blocking: [] };
      },
      editDependency: async () => assert.fail('idempotent convergence must not edit'),
    },
  });
  assert.equal(reads, 2);
  assert.deepEqual(result, {
    status: 'idempotent',
    existing: [4, 9],
    desired: [4, 9],
    added: [],
    removed: [],
  });
});

test('exact-set convergence rejects self references before mutation', async () => {
  let touched = false;
  await assert.rejects(
    convergeBlockedBySet({
      issueNumber: 12,
      repo: 'o/r',
      desired: [12],
      deps: {
        readNativeDependencies: async () => {
          touched = true;
          return { blockedBy: [], blocking: [] };
        },
      },
    }),
    /native-dependencies:self/
  );
  assert.equal(touched, false);
});

test('exact-set convergence fails when provider readback differs', async () => {
  let reads = 0;
  await assert.rejects(
    convergeBlockedBySet({
      issueNumber: 20,
      repo: 'o/r',
      desired: [4, 12],
      deps: {
        readNativeDependencies: async () => {
          reads += 1;
          return reads === 1 ? { blockedBy: [4], blocking: [] } : { blockedBy: [4], blocking: [] };
        },
        editDependency: async () => {},
      },
    }),
    /native-dependencies:readback/
  );
});

test('operation-aware union and subtraction preserve edges added between caller intent and convergence', async () => {
  for (const [operation, refs, before, after, expected] of [
    ['union', [9], [4, 77], [4, 9, 77], { added: [9], removed: [] }],
    ['subtract', [9], [4, 9, 77], [4, 77], { added: [], removed: [9] }],
  ]) {
    const edits = [];
    let reads = 0;
    const result = await convergeBlockedBySet({
      issueNumber: 20,
      repo: 'o/r',
      operation,
      refs,
      deps: {
        readNativeDependencies: async () => {
          reads += 1;
          return { blockedBy: reads === 1 ? before : after, blocking: [] };
        },
        editDependency: async (input) => edits.push(input),
      },
    });
    assert.deepEqual(
      edits.map(({ operation: editOperation, ref }) => ({ operation: editOperation, ref })),
      expected.added
        .map((ref) => ({ operation: 'add', ref }))
        .concat(expected.removed.map((ref) => ({ operation: 'remove', ref })))
    );
    assert.deepEqual(result.desired, after);
  }
});
