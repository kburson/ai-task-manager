// @story #1872
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planShards, validateShardReceipts } from '../../../../run-tests-shards.mjs';

const groups = [
  [
    'scripts/tests/integration/task-tracker/lib/delivery-waiver.test.mjs',
    'scripts/tests/integration/task-tracker/lib/delivery.test.mjs',
  ],
  [
    'scripts/tests/integration/task-tracker/lib/guidance-capture.test.mjs',
    'scripts/tests/integration/task-tracker/lib/guidance.test.mjs',
  ],
  [
    'scripts/tests/integration/meta/package.test.mjs',
    'scripts/tests/integration/task-tracker/verbs/promote.test.mjs',
  ],
];
const inventory = groups.flat();
const commit = 'a'.repeat(40);
function receipts() {
  return groups.map((files, index) => ({
    exitCode: 0,
    timing: {
      schema: 5,
      lane: 'integration',
      commit,
      generatedAt: '2026-10-04T06:40:00Z',
      runnerProfile: { platform: 'linux', nodeVersion: '24.0.0' },
      shard: { index: index + 1, total: 3 },
      discoveryInventory: files,
      count: files.length,
      files: Object.fromEntries(files.map((file) => [file, { status: 0, wallMs: 1 }])),
    },
  }));
}
const validate = (results) =>
  validateShardReceipts(results, { inventory, lane: 'integration', commit, total: 3 });

test('three groups preserve suite families and cover every file once, independent of discovery order', () => {
  assert.deepEqual(planShards(inventory, 3), groups);
  assert.deepEqual(planShards([...inventory].reverse(), 3), groups);
  assert.throws(() => planShards([...inventory, inventory[0]], 3), /duplicate/);
  assert.throws(() => planShards(inventory, 0), /count/);
});

test('aggregate accepts actual complete results and rejects missing, duplicated or stale shards', () => {
  assert.equal(validate(receipts()).count, inventory.length);
  assert.throws(() => validate(receipts().slice(1)), /shard/);
  assert.throws(() => validate([receipts()[0], receipts()[0], receipts()[2]]), /shard/);
  const stale = receipts();
  stale[0].timing.commit = 'b'.repeat(40);
  assert.throws(() => validate(stale), /commit/);
});

test('aggregate refuses an omitted test, failed assertion, or runner failure after passing assertions', () => {
  const omitted = receipts();
  delete omitted[0].timing.files[omitted[0].timing.discoveryInventory[0]];
  assert.throws(() => validate(omitted), /inventory/);
  const failed = receipts();
  failed[0].timing.files[failed[0].timing.discoveryInventory[0]].status = 1;
  assert.throws(() => validate(failed), /failed/);
  const ceiling = receipts();
  ceiling[0].exitCode = 1;
  assert.throws(() => validate(ceiling), /exit/);
});
