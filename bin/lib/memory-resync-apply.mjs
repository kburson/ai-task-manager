// #978 — atomic apply of a confirmed resync decision set. Given the
// classification + per-file decisions (accept / skip / keep / remove), copy
// accepted new/changed files, delete accepted-for-removal deprecated files,
// rewrite MEMORY.md to the resulting accepted set, and refresh the baseline
// manifest — reusing the same MEMORY.md filter shape `writeMemorySeed`
// already uses so resync and fresh install never diverge in output.

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { durableSeedFiles } from './memory-seed-set.mjs';
import { recordSeedState } from './memory-resync-state.mjs';

// `decisions`: Map or plain object of { [file]: 'accept' | 'skip' | 'keep' | 'remove' }
// keyed by the file names returned from classifySeed. 'accept' on a `new`/
// `changed`/`locally-modified` item copies the upstream file in; 'remove' on
// a `deprecated` item deletes the local copy; 'skip'/'keep' (and any other
// decision, or an item with no decision) leaves the local file untouched.
export function applyResync({ seedDir, memoryDir, classification, decisions }) {
  const decisionFor = (file) =>
    decisions instanceof Map ? decisions.get(file) : (decisions || {})[file];

  mkdirSync(memoryDir, { recursive: true });

  const copied = [];
  const removed = [];

  for (const { file, status } of classification) {
    const decision = decisionFor(file);
    if (
      decision === 'accept' &&
      (status === 'new' || status === 'changed' || status === 'locally-modified')
    ) {
      copyFileSync(join(seedDir, file), join(memoryDir, file));
      copied.push(file);
    } else if (decision === 'remove' && status === 'deprecated') {
      const p = join(memoryDir, file);
      if (existsSync(p)) rmSync(p);
      removed.push(file);
    }
  }

  const removedSet = new Set(removed);
  const finalAccepted = durableSeedFiles(memoryDir).filter((f) => !removedSet.has(f));
  const finalAcceptedSet = new Set(finalAccepted);

  // Bullets come from the upstream MEMORY.md, not the local one: a
  // newly-accepted file has no bullet in the local copy yet (it was never
  // installed before), so filtering the local file would silently drop it.
  const upstreamMemoryMdPath = join(seedDir, 'MEMORY.md');
  const upstreamMemoryMd = existsSync(upstreamMemoryMdPath)
    ? readFileSync(upstreamMemoryMdPath, 'utf8')
    : '';
  const kept = upstreamMemoryMd.split('\n').filter((line) => {
    const m = line.match(/\]\(([^)]+\.md)\)/);
    if (!m) return true; // non-bullet line (header / blank) — keep
    return finalAcceptedSet.has(m[1].trim());
  });
  writeFileSync(join(memoryDir, 'MEMORY.md'), kept.join('\n'), 'utf8');

  recordSeedState({ memoryDir, files: finalAccepted });

  return { copied, removed, accepted: finalAccepted };
}
