// @story #1562
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { parseReconcileArgs } from '../../../../task-tracker/verbs/deliver.mjs';
import { HEAD, MERGE_HEAD, NEXT_HEAD, deliver, makeHarness } from './deliver-test-harness.mjs';

test('returns null when the lane is not requested', () => {
  assert.equal(parseReconcileArgs(['1562']), null);
  assert.equal(parseReconcileArgs([]), null);
});

test('parses the declared method and reason', () => {
  const parsed = parseReconcileArgs([
    '1562',
    '--reconcile-merge-method',
    'merge',
    '--reason',
    'merged from the GitHub UI with the merge-commit button',
  ]);
  assert.deepEqual(parsed, {
    declaredMergeMethod: 'merge',
    reason: 'merged from the GitHub UI with the merge-commit button',
  });
});

test('accepts the equals form', () => {
  const parsed = parseReconcileArgs([
    '--reconcile-merge-method=merge',
    '--reason=merged by hand from the web UI',
  ]);
  assert.equal(parsed.declaredMergeMethod, 'merge');
  assert.equal(parsed.reason, 'merged by hand from the web UI');
});

test('refuses a method outside the known set', () => {
  assert.throws(
    () => parseReconcileArgs(['--reconcile-merge-method', 'fast-forward', '--reason', 'because x']),
    /deliver:reconcile-merge-method/
  );
});

test('refuses a missing reason — the ledger must record why', () => {
  assert.throws(
    () => parseReconcileArgs(['--reconcile-merge-method', 'merge']),
    /deliver:reconcile-reason/
  );
});

test('refuses an empty or placeholder reason', () => {
  for (const reason of ['', '   ', 'TBD']) {
    assert.throws(
      () => parseReconcileArgs(['--reconcile-merge-method', 'merge', '--reason', reason]),
      /deliver:reconcile-reason/
    );
  }
});

test('refuses a reason without the lane flag, so it cannot be silently ignored', () => {
  assert.throws(() => parseReconcileArgs(['--reason', 'a standalone reason']), /deliver:reason/);
});

test('refuses a repeated flag rather than picking one', () => {
  assert.throws(
    () =>
      parseReconcileArgs([
        '--reconcile-merge-method',
        'merge',
        '--reconcile-merge-method',
        'rebase',
        '--reason',
        'because x',
      ]),
    /deliver:reconcile-merge-method/
  );
});

// @story #2098 — exercise runDeliver with the live adapter's nested merge SHA.

function currentReconciliationHarness() {
  return makeHarness({
    prState: 'MERGED',
    prMergeMethod: 'merge',
    historyMergeMethod: 'merge',
    configuredMergeMethod: 'squash',
  });
}
const currentReconcile = {
  declaredMergeMethod: 'merge',
  reason: 'Observed two-parent GitHub merge while repository configuration selected squash.',
  operator: 'kburson',
};

test('#2098: current-head reconciliation consumes nested mergeCommit.oid and persists observed method', async () => {
  const harness = currentReconciliationHarness();
  const result = await deliver(harness, { reconcile: currentReconcile });
  assert.equal(result.status, 'delivered');
  assert.equal(result.action, null);
  assert.equal(result.intent.expectedHeadSha, HEAD);
  assert.equal(result.receipt.mergeCommitSha, MERGE_HEAD);
  assert.equal(result.receipt.mergeMethod, 'merge');
  assert.equal(result.receipt.provider, 'external');
  assert.equal(harness.calls.createIssueComment, 3);
  const reconciliation = JSON.parse(harness.data.comments[0].body.match(/^<!-- \S+ (.+) -->/)[1]);
  assert.equal(reconciliation.mergeCommitSha, MERGE_HEAD);
  assert.equal(reconciliation.observedMergeMethod, 'merge');
});

test('#2098: current reconciliation refuses conflicting flat and nested merge SHA before writing', async () => {
  const harness = currentReconciliationHarness();
  const fetch = harness.deps.fetchPullRequest;
  harness.deps.fetchPullRequest = async (args) => ({
    ...(await fetch(args)),
    mergeCommitSha: NEXT_HEAD,
  });
  await assert.rejects(
    () => deliver(harness, { reconcile: currentReconcile }),
    /merge-commit-source-disagreement/
  );
  assert.equal(harness.calls.createIssueComment, 0);
});

test('#2098: nested reconciliation still refuses absent SHA and false declared method', async () => {
  for (const missing of [true, false]) {
    const harness = currentReconciliationHarness();
    if (missing) harness.data.mergeCommitSha = null;
    await assert.rejects(
      () =>
        deliver(harness, {
          reconcile: missing
            ? currentReconcile
            : { ...currentReconcile, declaredMergeMethod: 'squash' },
        }),
      missing ? /delivery-verification:input/ : /declared-not-observed/
    );
    assert.equal(harness.calls.createIssueComment, 0);
  }
});

function contentReconciliationHarness(equal = true) {
  const base = 'd'.repeat(40);
  const tree = 'e'.repeat(40);
  const harness = makeHarness({
    prState: 'MERGED',
    prMergeMethod: 'merge',
    historyMergeMethod: 'merge',
    configuredMergeMethod: 'squash',
    prSourceEvidence: [{ oid: HEAD, parents: [base], tree, message: '[#939] source' }],
  });
  harness.deps.inspectMergeCommit = async ({ mergeCommitSha }) => {
    assert.equal(mergeCommitSha, MERGE_HEAD);
    return {
      parents: [base, HEAD],
      tree,
      commitTitle: '[#939] Governed PR delivery',
      commitMessage: `PR #1400\nSource: ${HEAD}\n\nAttribution: [#939]`,
    };
  };
  const isAncestor = harness.deps.isAncestor;
  harness.deps.isAncestor = async (input) => {
    if (input.descendant === MERGE_HEAD) {
      assert.equal(input.ancestor, MERGE_HEAD);
      return true;
    }
    return isAncestor(input);
  };
  harness.deps.resolveLocalTrunkHeadSha = async () => MERGE_HEAD;
  harness.deps.compareDeliveryContent = async (input) => {
    assert.deepEqual(input, {
      method: 'merge',
      sourceBase: base,
      sourceHead: HEAD,
      integrationBase: base,
      integrationHead: MERGE_HEAD,
    });
    return equal;
  };
  return harness;
}

test('#2098: current recovery persists and replays v5 observed content proof', async () => {
  const harness = contentReconciliationHarness();
  const first = await deliver(harness, { reconcile: currentReconcile });
  assert.equal(first.receipt.schema, 'aitm.delivery-receipt/v5');
  assert.equal(first.action, null);
  assert.deepEqual(first.receipt.observedIntegration.contentProof, {
    kind: 'equivalent-delta',
    sourceBase: 'd'.repeat(40),
    sourceHead: HEAD,
    integrationBase: 'd'.repeat(40),
    integrationHead: MERGE_HEAD,
  });
  const replay = await deliver(harness);
  assert.equal(replay.status, 'already-delivered');
  assert.deepEqual(replay.receipt, first.receipt);
  harness.deps.compareDeliveryContent = async () => false;
  await assert.rejects(
    () => deliver(harness),
    (error) =>
      error.category === 'merge-method-evidence' &&
      error.cause?.message === 'delivery-integration:content-mismatch'
  );
  assert.equal(harness.calls.createIssueComment, 3);
});

test('#2098: current recovery refuses unequal content before any ledger write', async () => {
  const harness = contentReconciliationHarness(false);
  await assert.rejects(
    () => deliver(harness, { reconcile: currentReconcile }),
    (error) =>
      error.category === 'merge-method-evidence' &&
      error.cause?.message === 'delivery-integration:content-mismatch'
  );
  assert.equal(harness.calls.createIssueComment, 0);
  assert.equal(harness.data.comments.length, 0);
});
