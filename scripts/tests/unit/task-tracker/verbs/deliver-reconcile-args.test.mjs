// @story #1562
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { parseReconcileArgs } from '../../../../task-tracker/verbs/deliver.mjs';

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
