// @story #1872
// CI grouping keeps each file and its directory-local suite family together.
import path from 'node:path';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { laneFiles } from '../run-tests-lanes.mjs';

export function planShards(inventory, count) {
  if (!Number.isInteger(count) || count < 1 || count > 32) throw new Error('shard count invalid');
  if (new Set(inventory).size !== inventory.length) throw new Error('duplicate inventory file');
  const families = new Map();
  for (const file of [...inventory].sort()) {
    const stem = path.posix.basename(file).replace(/\.test\.mjs$/, '');
    const family = `${path.posix.dirname(file)}/${stem.split('-')[0]}`;
    if (!families.has(family)) families.set(family, []);
    families.get(family).push(file);
  }
  const groups = Array.from({ length: count }, () => []);
  const ordered = [...families.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'en')
  );
  for (const [, files] of ordered) {
    const smallest = groups.reduce(
      (best, group, index) => (group.length < groups[best].length ? index : best),
      0
    );
    groups[smallest].push(...files);
  }
  return groups.map((files) => files.sort());
}

export function validateShardReceipts(receipts, { inventory, lane, commit, total }) {
  if (receipts.length !== total) throw new Error('missing shard receipt');
  const expected = planShards(inventory, total);
  const seen = new Set();
  for (const { timing, exitCode } of receipts) {
    if (exitCode !== 0) throw new Error('runner exit was not zero');
    if (timing.schema !== 5 || timing.lane !== lane) throw new Error('receipt lane/schema invalid');
    if (timing.commit !== commit) throw new Error('receipt commit mismatch');
    if (
      !Number.isFinite(Date.parse(timing.generatedAt)) ||
      !timing.runnerProfile?.platform ||
      !timing.runnerProfile?.nodeVersion
    )
      throw new Error('receipt environment invalid');
    const { index, total: recordedTotal } = timing.shard || { index: 1, total: 1 };
    if (
      recordedTotal !== total ||
      !Number.isInteger(index) ||
      index < 1 ||
      index > total ||
      seen.has(index)
    )
      throw new Error('duplicate or invalid shard');
    seen.add(index);
    const files = Object.keys(timing.files || {}).sort();
    const selected = [...(timing.discoveryInventory || [])].sort();
    if (
      timing.count !== selected.length ||
      JSON.stringify(selected) !== JSON.stringify(expected[index - 1]) ||
      JSON.stringify(files) !== JSON.stringify(selected)
    )
      throw new Error('receipt inventory mismatch');
    if (files.some((file) => timing.files[file].status !== 0)) throw new Error('test file failed');
  }
  return { lane, commit, shards: total, count: inventory.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, lane, countText, receiptDir] = process.argv.slice(2);
  const total = Number(countText);
  const inventory = laneFiles(lane);
  const groups = planShards(inventory, total);
  if (mode === 'plan') {
    console.log(JSON.stringify({ lane, total, inventory, groups }, null, 2));
  } else if (mode === 'verify' && receiptDir) {
    const receipts = readdirSync(receiptDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map(({ name }) => {
        const dir = path.join(receiptDir, name);
        const exitText = readFileSync(path.join(dir, 'exit-code.txt'), 'utf8').trim();
        if (!/^\d+$/.test(exitText)) throw new Error('runner exit evidence invalid');
        return {
          timing: JSON.parse(readFileSync(path.join(dir, 'test-timing.json'), 'utf8')),
          exitCode: Number(exitText),
        };
      });
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const result = validateShardReceipts(receipts, { inventory, lane, commit, total });
    const receipt = {
      schema: 'aitm.ci-lane-results/v1',
      ...result,
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT,
      sourceHead: process.env.AITM_SOURCE_HEAD,
      results: receipts,
    };
    writeFileSync(
      path.join(receiptDir, 'lane-receipt.json'),
      `${JSON.stringify(receipt, null, 2)}\n`
    );
    console.log(JSON.stringify(result));
  } else {
    throw new Error('usage: test-shards.mjs plan|verify <lane> <count> [receipt-directory]');
  }
}
