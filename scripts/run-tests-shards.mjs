// @story #1872
// Pure collection grouping and complete-lane result validation.
import path from 'node:path';

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
