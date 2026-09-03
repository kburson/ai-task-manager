// @story #1496
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { rehearsalRefusal } from '../../../task-tracker/lib/evidence-v2/execution-context.mjs';

// Explicit pinned inputs only. Pack/unpack copies object bytes without sharing
// storage, changing source refs, or copying source runtime state/configuration.
export function importSnapshots({ sourceSnapshots, sourceRoot, env }) {
  return sourceSnapshots.map(({ sourceRoot: from, commitSha }) => {
    if (
      typeof from !== 'string' ||
      !path.isAbsolute(from) ||
      !/^[0-9a-f]{40}$/.test(commitSha || '')
    )
      throw rehearsalRefusal('snapshot-input');
    const original = realpathSync(from);
    const options = {
      env,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 128 * 1024 * 1024,
    };
    const resolved = execFileSync(
      'git',
      ['-C', original, 'rev-parse', '--verify', `${commitSha}^{commit}`],
      options
    ).trim();
    if (resolved !== commitSha) throw rehearsalRefusal('snapshot-not-commit');
    const pack = execFileSync('git', ['-C', original, 'pack-objects', '--stdout', '--revs'], {
      ...options,
      encoding: null,
      input: Buffer.from(`${commitSha}\n`),
    });
    execFileSync('git', ['-C', sourceRoot, 'unpack-objects', '-q'], { ...options, input: pack });
    const copied = execFileSync(
      'git',
      ['-C', sourceRoot, 'rev-parse', '--verify', `${commitSha}^{commit}`],
      options
    ).trim();
    if (copied !== commitSha) throw rehearsalRefusal('snapshot-import');
    return Object.freeze({ sourceRoot: original, commitSha });
  });
}
