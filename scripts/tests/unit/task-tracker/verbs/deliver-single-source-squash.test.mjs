#!/usr/bin/env node
// @story #1468

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { deliver, HEAD, makeHarness } from './deliver-test-harness.mjs';

const PARENT = 'd'.repeat(40);
const TREE = '1'.repeat(40);

function evidence(overrides = {}) {
  return { oid: HEAD, message: 'source', parents: [PARENT], tree: TREE, ...overrides };
}

const refusalScenarios = [
  {
    label: 'identical source and merge messages',
    options: {
      historyCommitTitle: '[#939] Identical message',
      historyCommitMessage: '',
      prSourceEvidence: [evidence({ message: '[#939] Identical message' })],
    },
  },
  {
    label: 'multiple source commits',
    options: {
      prCommitMessages: ['first', 'second'],
      prSourceEvidence: [
        evidence({ message: 'first' }),
        evidence({ oid: '2'.repeat(40), message: 'second', parents: [HEAD], tree: '3'.repeat(40) }),
      ],
    },
  },
  {
    label: 'missing source evidence fields',
    options: { prSourceEvidence: [{ oid: HEAD, message: 'source', parents: [PARENT] }] },
  },
  {
    label: 'source parent mismatch',
    options: { prSourceEvidence: [evidence({ parents: ['e'.repeat(40)] })] },
  },
  {
    label: 'source tree mismatch',
    options: { prSourceEvidence: [evidence({ tree: '2'.repeat(40) })] },
  },
  {
    label: 'configured merge method',
    options: { configuredMergeMethod: 'merge', prSourceEvidence: [evidence()] },
  },
];

for (const scenario of refusalScenarios) {
  test(`external recovery refuses ${scenario.label} as squash proof`, async () => {
    const harness = makeHarness({
      prState: 'MERGED',
      prMergeMethod: null,
      historyTree: TREE,
      ...scenario.options,
    });

    await assert.rejects(() => deliver(harness), /delivery-verification:/);
    assert.equal(harness.calls.createIssueComment, 0);
    assert.equal(harness.data.comments.length, 0);
  });
}
