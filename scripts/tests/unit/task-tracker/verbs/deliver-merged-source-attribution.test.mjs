#!/usr/bin/env node
// @story #1406

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { mergedSourceCommitSubjects } from '../../../../task-tracker/verbs/deliver.mjs';

const SOURCE_COMMIT = '1'.repeat(40);
const SOURCE_MERGE = '2'.repeat(40);
const MERGE_TITLE = 'Merge branch trunk into work';
const ATTRIBUTED_TITLE = '[#1406] Repair delivery attribution';
const STRICT_SUBJECTS = [ATTRIBUTED_TITLE, MERGE_TITLE];

function pullRequest(overrides = {}) {
  return {
    sourceCommitSubjects: STRICT_SUBJECTS,
    sourceCommits: [
      { oid: SOURCE_COMMIT, messageHeadline: ATTRIBUTED_TITLE },
      { oid: SOURCE_MERGE, messageHeadline: MERGE_TITLE },
    ],
    ...overrides,
  };
}

test('omits a matching unattributed source record with two repository parents', async () => {
  const subjects = await mergedSourceCommitSubjects(pullRequest(), async ({ commitSha }) => {
    assert.equal(commitSha, SOURCE_MERGE);
    return {
      parents: ['3'.repeat(40), '4'.repeat(40)],
      commitTitle: MERGE_TITLE,
    };
  });

  assert.deepEqual(subjects, [ATTRIBUTED_TITLE]);
});

for (const [label, inspection] of [
  ['one parent', { parents: ['3'.repeat(40)], commitTitle: MERGE_TITLE }],
  [
    'mismatched title',
    { parents: ['3'.repeat(40), '4'.repeat(40)], commitTitle: 'different title' },
  ],
  ['malformed parents', { parents: ['not-a-sha', '4'.repeat(40)], commitTitle: MERGE_TITLE }],
]) {
  test(`preserves strict attribution input for ${label}`, async () => {
    const subjects = await mergedSourceCommitSubjects(pullRequest(), async () => inspection);
    assert.deepEqual(subjects, STRICT_SUBJECTS);
  });
}

test('preserves strict attribution input when repository inspection fails', async () => {
  const subjects = await mergedSourceCommitSubjects(pullRequest(), async () => {
    throw new Error('object unavailable');
  });

  assert.deepEqual(subjects, STRICT_SUBJECTS);
});

test('preserves strict attribution input when immutable records are malformed', async () => {
  let inspected = false;
  const subjects = await mergedSourceCommitSubjects(
    pullRequest({
      sourceCommits: [
        { oid: SOURCE_COMMIT, messageHeadline: ATTRIBUTED_TITLE },
        { oid: 'not-a-sha', messageHeadline: MERGE_TITLE },
      ],
    }),
    async () => {
      inspected = true;
      return { parents: ['3'.repeat(40), '4'.repeat(40)], commitTitle: MERGE_TITLE };
    }
  );

  assert.deepEqual(subjects, STRICT_SUBJECTS);
  assert.equal(inspected, false);
});

test('does not inspect attributed source subjects', async () => {
  const subjects = [ATTRIBUTED_TITLE];
  const result = await mergedSourceCommitSubjects(
    pullRequest({
      sourceCommitSubjects: subjects,
      sourceCommits: [{ oid: SOURCE_COMMIT, messageHeadline: ATTRIBUTED_TITLE }],
    }),
    async () => {
      throw new Error('inspection must not run');
    }
  );

  assert.deepEqual(result, subjects);
});
