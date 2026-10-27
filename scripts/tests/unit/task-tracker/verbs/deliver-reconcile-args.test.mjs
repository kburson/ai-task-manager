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
