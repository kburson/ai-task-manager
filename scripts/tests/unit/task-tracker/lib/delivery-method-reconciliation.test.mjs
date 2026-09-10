// @story #1562
import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  METHOD_RECONCILIATION_SCHEMA,
  buildMethodReconciliation,
  renderMethodReconciliationComment,
  resolveReconciledMergeMethod,
  validateMethodReconciliation,
} from '../../../../task-tracker/lib/delivery-method-reconciliation.mjs';

const repository = 'kburson/ai-task-manager';
const issueNumber = 1562;
const prNumber = 1556;
const acceptedSha = 'a'.repeat(40);
const mergeCommitSha = 'b'.repeat(40);

function input(overrides = {}) {
  return {
    issueNumber,
    repository,
    prNumber,
    acceptedSha,
    mergeCommitSha,
    configuredMergeMethod: 'squash',
    observedMergeMethod: 'merge',
    reason: 'merged from the GitHub UI with the merge-commit button',
    operator: 'kburson',
    clientCreatedAt: '2026-09-09T04:00:00.000Z',
    ...overrides,
  };
}

test('builds a reconciliation record carrying both methods and the reason', () => {
  const record = buildMethodReconciliation(input());
  assert.equal(record.schema, METHOD_RECONCILIATION_SCHEMA);
  assert.deepEqual(Object.keys(record).sort(), [
    'acceptedSha',
    'clientCreatedAt',
    'configuredMergeMethod',
    'divergent',
    'issueNumber',
    'mergeCommitSha',
    'observedMergeMethod',
    'operator',
    'prNumber',
    'reason',
    'repository',
    'schema',
  ]);
  assert.equal(record.configuredMergeMethod, 'squash');
  assert.equal(record.observedMergeMethod, 'merge');
  assert.equal(record.divergent, true);
  assert.equal(record.reason, 'merged from the GitHub UI with the merge-commit button');
  assert.equal(record.acceptedSha, acceptedSha);
  assert.equal(record.mergeCommitSha, mergeCommitSha);
});

test('builds a frozen v2 reconstruction record with the exact retroactive origin', () => {
  const record = buildMethodReconciliation(
    input({ intentOrigin: 'retroactively-reconstructed' })
  );
  assert.equal(record.schema, 'aitm.delivery-method-reconciliation/v2');
  assert.equal(record.intentOrigin, 'retroactively-reconstructed');
  assert.deepEqual(Object.keys(record).sort(), [
    'acceptedSha',
    'clientCreatedAt',
    'configuredMergeMethod',
    'divergent',
    'intentOrigin',
    'issueNumber',
    'mergeCommitSha',
    'observedMergeMethod',
    'operator',
    'prNumber',
    'reason',
    'repository',
    'schema',
  ]);
  assert.equal(Object.isFrozen(record), true);
});

test('validates a v2 reconstruction record and refuses a tampered origin', () => {
  const record = buildMethodReconciliation(
    input({ intentOrigin: 'retroactively-reconstructed' })
  );
  assert.equal(validateMethodReconciliation(record).ok, true);
  assert.throws(
    () => validateMethodReconciliation({ ...record, intentOrigin: 'delivery-time' }),
    /delivery-method-reconciliation:intent-origin/
  );
});

test('renders v2 with the no-delivery-time-intent reconstruction explanation', () => {
  const comment = renderMethodReconciliationComment(
    buildMethodReconciliation(input({ intentOrigin: 'retroactively-reconstructed' }))
  );
  assert.match(comment, /No delivery-time intent existed/);
  assert.match(comment, /reconstructed from provider and Git evidence/);
});

test('records are frozen so a caller cannot mutate recorded evidence', () => {
  const record = buildMethodReconciliation(input());
  assert.equal(Object.isFrozen(record), true);
});

test('divergent is false when the observed method equals the configured one', () => {
  const record = buildMethodReconciliation(input({ observedMergeMethod: 'squash' }));
  assert.equal(record.divergent, false);
});

test('refuses an empty or whitespace reason', () => {
  for (const reason of ['', '   ', '\n']) {
    assert.throws(
      () => buildMethodReconciliation(input({ reason })),
      /delivery-method-reconciliation:reason/
    );
  }
});

test('refuses a reason that is only a placeholder', () => {
  for (const reason of ['TBD', 'todo', '...']) {
    assert.throws(
      () => buildMethodReconciliation(input({ reason })),
      /delivery-method-reconciliation:reason/
    );
  }
});

test('refuses a merge method outside the known set', () => {
  assert.throws(
    () => buildMethodReconciliation(input({ observedMergeMethod: 'fast-forward' })),
    /delivery-method-reconciliation:observed-merge-method/
  );
  assert.throws(
    () => buildMethodReconciliation(input({ configuredMergeMethod: 'cherry-pick' })),
    /delivery-method-reconciliation:configured-merge-method/
  );
});

test('refuses malformed shas', () => {
  assert.throws(
    () => buildMethodReconciliation(input({ acceptedSha: 'nope' })),
    /delivery-method-reconciliation:accepted-sha/
  );
  assert.throws(
    () => buildMethodReconciliation(input({ mergeCommitSha: 'b'.repeat(39) })),
    /delivery-method-reconciliation:merge-commit-sha/
  );
});

test('validate accepts a freshly built record and rejects a tampered one', () => {
  const record = buildMethodReconciliation(input());
  assert.equal(validateMethodReconciliation(record).ok, true);
  // Tampering the observed method to equal the configured one leaves a stale
  // `divergent: true`, which the cross-check must catch.
  assert.throws(
    () => validateMethodReconciliation({ ...record, observedMergeMethod: 'squash' }),
    /delivery-method-reconciliation:divergent/
  );
  // The same in reverse: a record claiming no divergence while its methods differ.
  assert.throws(
    () => validateMethodReconciliation({ ...record, divergent: false }),
    /delivery-method-reconciliation:divergent/
  );
});

// resolveReconciledMergeMethod is the guard that keeps the lane honest: an
// operator states a method, and it is accepted ONLY when observation agrees.
test('resolve returns the declared method when observation agrees', () => {
  assert.equal(
    resolveReconciledMergeMethod({ declared: 'merge', observed: 'merge', configured: 'squash' }),
    'merge'
  );
});

test('resolve refuses when the declared method contradicts observation', () => {
  assert.throws(
    () =>
      resolveReconciledMergeMethod({ declared: 'squash', observed: 'merge', configured: 'squash' }),
    /delivery-method-reconciliation:declared-not-observed/
  );
});

test('resolve refuses a no-op reconciliation that matches configuration', () => {
  assert.throws(
    () =>
      resolveReconciledMergeMethod({
        declared: 'squash',
        observed: 'squash',
        configured: 'squash',
      }),
    /delivery-method-reconciliation:not-divergent/
  );
});

test('resolve refuses an unknown observation rather than guessing', () => {
  assert.throws(
    () =>
      resolveReconciledMergeMethod({
        declared: 'merge',
        observed: 'unknown',
        configured: 'squash',
      }),
    /delivery-method-reconciliation:observed-merge-method/
  );
});
