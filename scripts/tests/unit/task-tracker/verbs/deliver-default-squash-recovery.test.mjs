#!/usr/bin/env node
// @story #1490
//
// Verb-level regression for external recovery of a multi-commit pull request that
// was squash-merged outside the governed provider action and therefore carries
// GitHub's default squash body with no `Attribution:` trailer.
//
// The unit suites prove the verification predicates. This proves the RECORD
// consequences at the verb boundary: a refusal must write nothing at all, and a
// success must write exactly one external delivery intent plus one receipt.
// Without this, a partially-written record set could pass every predicate test.
//
// No fixture sets `pullRequest.mergeMethod` (`omitPrMergeMethod`), matching
// production: the adapter never provides it, and supplying it would bypass the
// topology proof entirely.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { HEAD, MERGE_HEAD, deliver, makeHarness } from './deliver-test-harness.mjs';

const ACCEPTED_TREE = '7'.repeat(40);
const SOURCE_1 = '1'.repeat(40);
const SOURCE_2 = '2'.repeat(40);
const OTHER_TREE = '8'.repeat(40);

// GitHub's default squash bytes for a two-commit pull request on issue #939.
const DEFAULT_TITLE = '[#939] Add governed delivery intent verb (#1400)';
const DEFAULT_BODY = [
  '* [#939] Add governed delivery intent verb',
  '',
  '* [#939] test: cover the delivery intent verb',
].join('\n');

function harnessOptions(overrides = {}) {
  return {
    prState: 'MERGED',
    omitPrMergeMethod: true,
    historyMergeMethod: 'squash',
    historyTree: ACCEPTED_TREE,
    historyCommitTitle: DEFAULT_TITLE,
    historyCommitMessage: DEFAULT_BODY,
    prCommitSubjects: [
      '[#939] Add governed delivery intent verb',
      '[#939] test: cover the delivery intent verb',
    ],
    prSourceCommits: [
      { oid: SOURCE_1, messageHeadline: '[#939] Add governed delivery intent verb' },
      { oid: HEAD, messageHeadline: '[#939] test: cover the delivery intent verb' },
    ],
    prSourceEvidence: [
      { oid: SOURCE_1, message: 'first', parents: [SOURCE_2], tree: OTHER_TREE },
      { oid: HEAD, message: 'second', parents: [SOURCE_1], tree: ACCEPTED_TREE },
    ],
    ...overrides,
  };
}

test('#1490: external default-squash recovery writes one intent and one receipt', async () => {
  const harness = makeHarness(harnessOptions());
  const result = await deliver(harness);

  assert.equal(result.status, 'delivered');
  assert.equal(result.mode, 'current-head');
  assert.equal(result.receipt.mergeCommitSha, MERGE_HEAD);
  assert.equal(result.receipt.mergeMethod, 'squash');
  assert.equal(result.intent.provider, 'external');

  // Exactly one intent then one receipt, in that order, and no provider action.
  assert.equal(harness.calls.createIssueComment, 2);
  assert.deepEqual(
    harness.calls.events.filter((event) => event !== 'comments:read'),
    ['intent:post', 'receipt:post']
  );
  assert.equal(result.action, null);
  // The squash-parent ancestry question was actually asked.
  assert.ok(harness.calls.squashParentAncestry >= 1);
});

test('#1490: a refused external default-squash recovery writes zero records', async () => {
  // Same shape, except the merge parent is NOT an ancestor of the accepted head —
  // the rebase signature. Verification must refuse and persist nothing.
  const harness = makeHarness(harnessOptions({ squashParentIsAncestor: false }));

  await assert.rejects(deliver(harness), /delivery-verification:merge-method-unknown/);

  assert.equal(harness.calls.createIssueComment, 0);
  assert.deepEqual(
    harness.calls.events.filter((event) => event !== 'comments:read'),
    []
  );
});

test('#1490: an indented canonical-looking trailer writes zero records', async () => {
  const harness = makeHarness(
    harnessOptions({
      historyCommitMessage: `${DEFAULT_BODY}\n\n Attribution: [#939]`,
    })
  );

  await assert.rejects(deliver(harness), /delivery-verification:attribution/);

  assert.equal(harness.calls.createIssueComment, 0);
  assert.equal(harness.data.comments.length, 0);
});

test('#1490: the harness rejects an unexpected squash-parent ancestry question', async () => {
  // Guards the harness itself. Asserted directly rather than through `deliver`,
  // because the proof wraps `isAncestor` in a fail-closed try/catch: a wrong
  // ancestry question would surface only as a generic refusal there, which would
  // not distinguish "the harness caught it" from "the proof declined".
  const harness = makeHarness(harnessOptions());
  const accepted = harness.data.prHead ?? harness.data.head;

  await assert.rejects(
    () => harness.deps.isAncestor({ ancestor: '9'.repeat(40), descendant: accepted }),
    /Expected values to be strictly equal/
  );
  await assert.rejects(
    () => harness.deps.isAncestor({ ancestor: 'd'.repeat(40), descendant: '9'.repeat(40) }),
    /Expected values to be strictly equal/
  );
});

test('#1490: an unauthorized attribution token writes zero records', async () => {
  const harness = makeHarness(
    harnessOptions({
      historyCommitMessage: `${DEFAULT_BODY}\n\n* [#4242] unauthorized companion change`,
    })
  );

  await assert.rejects(deliver(harness), /delivery-verification:attribution/);

  assert.equal(harness.calls.createIssueComment, 0);
});
