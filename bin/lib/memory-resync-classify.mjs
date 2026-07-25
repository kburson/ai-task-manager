// #978 — classify every durable memory-seed file into exactly one status by
// comparing the upstream package seed against the project's locally-installed
// copy, using the recorded baseline (memory-resync-state.mjs) to tell an
// upstream content change apart from a local edit. No separate/duplicate
// classification rule: the file universe is `durableSeedFiles()`
// (memory-seed-set.mjs), the same source of truth install-time and
// maintainer-parity tooling already use.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { durableSeedFiles } from './memory-seed-set.mjs';
import { readSeedState, sha256 } from './memory-resync-state.mjs';

export const STATUSES = ['new', 'changed', 'unchanged', 'locally-modified', 'deprecated'];

function readIfExists(dir, file) {
  const p = join(dir, file);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

// Returns [{ file, status }], sorted by file for determinism.
export function classifySeed({ seedDir, memoryDir }) {
  const upstreamFiles = new Set(durableSeedFiles(seedDir));
  const localFiles = new Set(durableSeedFiles(memoryDir));
  const baseline = readSeedState(memoryDir);

  const allFiles = new Set([...upstreamFiles, ...localFiles]);
  const results = [];

  for (const file of allFiles) {
    const inUpstream = upstreamFiles.has(file);
    const inLocal = localFiles.has(file);

    if (inUpstream && !inLocal) {
      results.push({ file, status: 'new' });
      continue;
    }
    if (!inUpstream && inLocal) {
      results.push({ file, status: 'deprecated' });
      continue;
    }

    // Present on both sides — three-way compare against the recorded baseline.
    const upstreamContent = readIfExists(seedDir, file);
    const localContent = readIfExists(memoryDir, file);
    const upstreamHash = sha256(upstreamContent ?? '');
    const localHash = sha256(localContent ?? '');
    const baselineHash = baseline[file];

    if (localHash === upstreamHash) {
      results.push({ file, status: 'unchanged' });
      continue;
    }

    if (baselineHash === undefined) {
      // No recorded baseline (pre-#978 install, or first run) — never assume
      // a diff is a safe upstream update without proof the local copy is
      // untouched. Conservative fallback: treat as locally-modified.
      results.push({ file, status: 'locally-modified' });
      continue;
    }

    if (localHash === baselineHash) {
      // Local copy matches what was last accepted; the diff is entirely
      // upstream's doing.
      results.push({ file, status: 'changed' });
      continue;
    }

    // Local copy diverges from the baseline — the user edited it. Never
    // silently overwrite, regardless of whether upstream also changed.
    results.push({ file, status: 'locally-modified' });
  }

  return results.sort((a, b) => a.file.localeCompare(b.file));
}
