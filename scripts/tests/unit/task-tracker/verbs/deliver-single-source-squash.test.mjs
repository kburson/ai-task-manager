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
    // #1490 — this scenario previously passed `prCommitMessages`, an option the
    // harness does not read, so its inventory was length 1 and it never exercised
    // a multi-commit pull request at all. Its original premise — "more than one
    // source commit can never be a provable squash" — is also no longer true:
    // #1490 makes a VALID multi-source squash provable. Retargeted to the case
    // that genuinely still refuses, a multi-commit inventory that does not
    // terminate at the accepted head, which the attribution preflight catches
    // before verification is reached.
    label: 'a multi-commit inventory not terminating at the accepted head',
    expectedRefusal: /delivery-preflight:attribution/,
    options: {
      prCommitSubjects: ['[#939] first', '[#939] second'],
      prSourceCommits: [
        { oid: '2'.repeat(40), messageHeadline: '[#939] first' },
        { oid: '3'.repeat(40), messageHeadline: '[#939] second' },
      ],
      prSourceEvidence: [
        evidence({ oid: '2'.repeat(40), message: 'first' }),
        evidence({ oid: '3'.repeat(40), message: 'second', parents: ['2'.repeat(40)] }),
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

    await assert.rejects(
      () => deliver(harness),
      // #1490 — assert the EXACT refusal. A generic `delivery-verification:` match
      // would also accept an attribution or bytes failure, hiding a case that had
      // stopped being refused for the reason this scenario exists to prove.
      scenario.expectedRefusal ?? /delivery-verification:merge-method-unknown/
    );
    assert.equal(harness.calls.createIssueComment, 0);
    assert.equal(harness.data.comments.length, 0);
    // #1490 — these are single-source scenarios. Proving the multi-source rescue
    // path was never entered is what stops it from silently reclaiming them.
    assert.equal(harness.calls.squashParentAncestry, 0);
  });
}
