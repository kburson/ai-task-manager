// @story #1185
// Unit tests for the shared `requiredTestReceiptClassifications` policy.
//
// #1158 taught the Test verb to skip the three complete test lanes for a
// docs-only issue with a provably documentation-only diff, recording the
// decision as a `laneSkip` entry on the `stage="test"` receipt. The Review gate
// kept demanding all five classifications and refused every such receipt with
// three `command-missing` reasons. These tests pin the derivation that closes
// that gap — and, just as importantly, pin every path on which it must NOT
// relax.
//
// Covers:
//   1. A valid docs-only lane-skip receipt drops exactly the three lanes.
//   2. `lint-full` / `format-full` survive even when the record names them.
//   3. No `laneSkip` leaves all five classifications required.
//   4. An empty `changedPaths` relaxes nothing (default-deny on an empty diff).
//   5. A code path in `changedPaths` relaxes nothing.
//   6. A non-`docs-only` kind relaxes nothing.
//   7. An unrecognized `reason` relaxes nothing.
//   8. A malformed `laneSkip` (array, string, null) relaxes nothing.
//   9. A partial `lanes` list drops only the lanes it names.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { requiredTestReceiptClassifications } from '../../../../task-tracker/lib/verification-receipt.mjs';

const ALL = ['lint-full', 'format-full', 'test-unit', 'test-integration', 'test-slow'];
const LANES = ['test-unit', 'test-integration', 'test-slow'];

function receipt(laneSkip) {
  return { stage: 'test', commands: [], ...(laneSkip === undefined ? {} : { laneSkip }) };
}

function docsOnlySkip(overrides = {}) {
  return {
    reason: 'docs-only-diff',
    kind: 'docs-only',
    lanes: [...LANES],
    changedPaths: ['docs/DESIGN.md', 'README.md'],
    ...overrides,
  };
}

test('a valid docs-only lane-skip drops exactly the three complete lanes', () => {
  assert.deepEqual(requiredTestReceiptClassifications(receipt(docsOnlySkip())), [
    'lint-full',
    'format-full',
  ]);
});

test('lint-full and format-full are never droppable, even when the record names them', () => {
  const skip = docsOnlySkip({ lanes: [...LANES, 'lint-full', 'format-full'] });
  assert.deepEqual(requiredTestReceiptClassifications(receipt(skip)), ['lint-full', 'format-full']);
});

test('a receipt with no laneSkip requires all five classifications', () => {
  assert.deepEqual(requiredTestReceiptClassifications(receipt()), ALL);
  assert.deepEqual(requiredTestReceiptClassifications(receipt(undefined)), ALL);
  assert.deepEqual(requiredTestReceiptClassifications(undefined), ALL);
  assert.deepEqual(requiredTestReceiptClassifications(null), ALL);
});

test('an empty changedPaths relaxes nothing — an empty diff is not proven docs-only', () => {
  assert.deepEqual(
    requiredTestReceiptClassifications(receipt(docsOnlySkip({ changedPaths: [] }))),
    ALL
  );
});

test('a code path in changedPaths relaxes nothing', () => {
  const skip = docsOnlySkip({
    changedPaths: ['docs/DESIGN.md', 'scripts/task-tracker/verbs/review.mjs'],
  });
  assert.deepEqual(requiredTestReceiptClassifications(receipt(skip)), ALL);
});

test('a non-docs-only kind relaxes nothing', () => {
  for (const kind of ['code', 'spike', 'epic', '', undefined]) {
    assert.deepEqual(
      requiredTestReceiptClassifications(receipt(docsOnlySkip({ kind }))),
      ALL,
      `kind=${String(kind)}`
    );
  }
});

test('an unrecognized reason relaxes nothing', () => {
  for (const reason of ['docs-only', 'skipped', '', undefined]) {
    assert.deepEqual(
      requiredTestReceiptClassifications(receipt(docsOnlySkip({ reason }))),
      ALL,
      `reason=${String(reason)}`
    );
  }
});

test('a malformed laneSkip relaxes nothing', () => {
  for (const laneSkip of [[], ['test-unit'], 'docs-only-diff', 0, false]) {
    assert.deepEqual(
      requiredTestReceiptClassifications(receipt(laneSkip)),
      ALL,
      `laneSkip=${JSON.stringify(laneSkip)}`
    );
  }
});

test('a partial lanes list drops only the lanes it names', () => {
  const skip = docsOnlySkip({ lanes: ['test-slow'] });
  assert.deepEqual(requiredTestReceiptClassifications(receipt(skip)), [
    'lint-full',
    'format-full',
    'test-unit',
    'test-integration',
  ]);
});

test('an unknown classification in lanes is ignored', () => {
  const skip = docsOnlySkip({ lanes: ['test-unit', 'test-targeted-1', 'review-probe'] });
  assert.deepEqual(requiredTestReceiptClassifications(receipt(skip)), [
    'lint-full',
    'format-full',
    'test-integration',
    'test-slow',
  ]);
});
