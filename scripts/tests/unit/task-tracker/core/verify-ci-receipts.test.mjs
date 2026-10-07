// @story #1873
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  validateCloudRun,
  validateCloudLanes,
} from '../../../../maintenance/verify-ci-receipts.mjs';
import { planShards } from '../../../../run-tests-shards.mjs';

const head = 'a'.repeat(40),
  commit = 'b'.repeat(40);
const run = {
  id: 42,
  run_attempt: 2,
  head_sha: head,
  status: 'completed',
  conclusion: 'success',
  path: '.github/workflows/ci.yml',
  event: 'pull_request',
  repository: { full_name: 'owner/repo' },
};
const inventories = Object.fromEntries(
  ['unit', 'integration', 'slow'].map((lane) => [
    lane,
    [
      `scripts/tests/${lane}/one.test.mjs`,
      `scripts/tests/${lane}/two.test.mjs`,
      `scripts/tests/${lane}/three.test.mjs`,
    ],
  ])
);
function lanes() {
  return Object.entries(inventories).map(([lane, inventory]) => {
    const total = lane === 'unit' ? 1 : 3;
    return {
      schema: 'aitm.ci-lane-results/v1',
      runId: '42',
      runAttempt: '2',
      sourceHead: head,
      lane,
      commit,
      shards: total,
      count: inventory.length,
      results: planShards(inventory, total).map((files, i) => ({
        exitCode: 0,
        timing: {
          schema: 6,
          lane,
          commit,
          generatedAt: '2026-10-04T21:00:00Z',
          runnerProfile: { platform: 'linux', nodeVersion: '24.0.0' },
          shard: { index: i + 1, total },
          count: files.length,
          discoveryInventory: files,
          executionSections: [{ name: 'serial', files: [...files], elapsedMs: 1 }],
          files: Object.fromEntries(files.map((file) => [file, { status: 0, wallMs: 1 }])),
        },
      })),
    };
  });
}
const options = { head, repository: 'owner/repo', commit, run, inventories };

test('cloud acceptance requires successful exact-head CI from the owning repository', () => {
  assert.equal(validateCloudRun(run, options).id, 42);
  for (const change of [
    { head_sha: commit },
    { conclusion: 'failure' },
    { status: 'in_progress' },
    { path: '.github/workflows/other.yml' },
    { repository: { full_name: 'foreign/repo' } },
  ])
    assert.throws(() => validateCloudRun({ ...run, ...change }, options), /cloud-receipt/);
});
test('all three lanes require exact attempt and complete successful test coverage', () => {
  assert.equal(validateCloudLanes(lanes(), options).count, 9);
  assert.throws(() => validateCloudLanes(lanes().slice(1), options), /lane/);
  for (const change of [
    { runId: '41' },
    { runAttempt: '1' },
    { sourceHead: commit },
    { commit: head },
  ]) {
    const records = lanes();
    Object.assign(records[0], change);
    assert.throws(() => validateCloudLanes(records, options), /cloud-receipt/);
  }
  const failed = lanes();
  failed[1].results[0].exitCode = 1;
  assert.throws(() => validateCloudLanes(failed, options), /exit/);
  const omitted = lanes();
  delete omitted[2].results[0].timing.files[omitted[2].results[0].timing.discoveryInventory[0]];
  assert.throws(() => validateCloudLanes(omitted, options), /inventory/);
  const duplicated = lanes();
  duplicated[1].results[1] = duplicated[1].results[0];
  assert.throws(() => validateCloudLanes(duplicated, options), /shard/);
});
