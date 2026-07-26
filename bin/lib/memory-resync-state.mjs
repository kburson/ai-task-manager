// #978 — per-file content-hash baseline for the memory-seed resync command.
//
// `writeMemorySeed` (memory-seed-install.mjs) copies accepted seed files into
// `.ai-task-manager/memory/` but never records what was actually written. The
// resync classifier needs a baseline of "what did this project last accept"
// to tell an upstream-only content change (`changed`) apart from a user's own
// edit to their local copy (`locally-modified`) — a plain local-vs-upstream
// diff alone can't distinguish the two. This module is that baseline.
//
// The manifest is intentionally NOT part of the durable seed set itself (it's
// bookkeeping, not a lesson) and lives alongside MEMORY.md in `memoryDir`.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export const SEED_STATE_FILE = '.seed-state.json';

export function sha256(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

// Tolerant read: missing or corrupt manifest is treated as "no baseline for
// any file" rather than an error — every classification then falls back to
// the conservative locally-modified default (see memory-resync-classify.mjs).
export function readSeedState(memoryDir) {
  const p = join(memoryDir, SEED_STATE_FILE);
  if (!existsSync(p)) return {};
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Hash the current on-disk content of each file in `files` (relative to
// `memoryDir`) and persist the result as the new baseline. Call after any
// write that changes what's in `memoryDir` (fresh install or resync apply)
// so the next resync has an accurate "last accepted" snapshot. Files that no
// longer exist (e.g. a deprecated file removed by apply) are dropped from the
// manifest rather than carried forward stale.
export function recordSeedState({ memoryDir, files }) {
  const state = {};
  for (const file of files || []) {
    const p = join(memoryDir, file);
    if (!existsSync(p)) continue;
    state[file] = sha256(readFileSync(p, 'utf8'));
  }
  writeFileSync(join(memoryDir, SEED_STATE_FILE), JSON.stringify(state, null, 2) + '\n', 'utf8');
  return state;
}
