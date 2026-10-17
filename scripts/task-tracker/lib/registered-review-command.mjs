// @story #2020
// Read-only recognition of an already registered review command. This grants
// neither participant identity nor any write permission and executes no package code.
import { closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import path from 'node:path';

function readJson(file, limit) {
  if (!lstatSync(file).isFile()) throw new Error('not an ordinary registration file');
  const fd = openSync(file, 'r');
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw new Error('registration file too large');
    const bytes = Buffer.alloc(limit + 1);
    const count = readSync(fd, bytes, 0, bytes.length, 0);
    if (count > limit) throw new Error('registration file too large');
    return JSON.parse(bytes.subarray(0, count).toString('utf8'));
  } finally {
    closeSync(fd);
  }
}

function physicalPath(value, directory = false) {
  return (
    typeof value === 'string' &&
    path.isAbsolute(value) &&
    path.normalize(value) === value &&
    realpathSync(value) === value &&
    (directory ? lstatSync(value).isDirectory() : lstatSync(value).isFile())
  );
}

export function registeredReviewCommandPaths(command, { homeDir }) {
  const none = new Set();
  // Only a single direct invocation: no wrappers, Node flags before the script,
  // shell expansions, aliases, redirections or compound commands gain permission.
  if (typeof command !== 'string' || /[;&|<>`$\\\r\n'"()*?{}!~]/.test(command)) return none;
  const [node, entrypoint] = command.trim().split(/\s+/);
  if (!path.isAbsolute(node || '') || !path.isAbsolute(entrypoint || '')) return none;
  try {
    const directory = path.join(
      homeDir,
      ...(process.platform === 'win32' ? ['AppData', 'Local'] : ['.config']),
      'ai-peer-review'
    );
    const record = readJson(path.join(directory, 'runtime-selection.json'), 8192);
    const keys = [
      'schema',
      'selection_id',
      'package_root',
      'node_executable',
      'package_name',
      'registered_at',
    ];
    if (
      !record ||
      Object.keys(record).sort().join(',') !== keys.sort().join(',') ||
      record.schema !== 'ai-peer-review.runtime-selection/v1' ||
      record.package_name !== '@kburson/ai-peer-review' ||
      typeof record.selection_id !== 'string' ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(record.selection_id) ||
      typeof record.registered_at !== 'string' ||
      !Number.isFinite(Date.parse(record.registered_at)) ||
      new Date(record.registered_at).toISOString() !== record.registered_at ||
      node !== record.node_executable ||
      !physicalPath(record.package_root, true) ||
      entrypoint !== path.join(record.package_root, 'bin', 'peer-review.mjs') ||
      !physicalPath(node) ||
      !physicalPath(entrypoint)
    )
      return none;
    const manifest = readJson(path.join(record.package_root, 'package.json'), 65536);
    if (
      manifest?.name !== '@kburson/ai-peer-review' ||
      !['./bin/peer-review.mjs', 'bin/peer-review.mjs'].includes(manifest.bin?.['peer-review'])
    )
      return none;
    return new Set([node, entrypoint]);
  } catch {
    // Missing, stale or malformed data supplies no exception to normal policy.
    return none;
  }
}
