// #728 — install-time opt-in memory-seed delivery. Pure, side-effect-scoped
// helpers so the acceptance logic is unit-testable independent of the readline
// prompt. `bin/cli.mjs` owns the interactive I/O (the TTY menu); everything that
// decides WHAT ships and writes it to disk lives here.
//
// Modes (`--memory-seed=all|choose|none`, or the interactive prompt):
//   all    — every durable seed file
//   choose — a selectable list, one item per MEMORY.md bullet → its linked file
//   none   — nothing (also the non-TTY default)
//
// Selected files copy into the downstream `.ai-task-manager/memory/`, alongside a
// `MEMORY.md` filtered to the accepted set. The installer registers the
// always-loaded index hook only when at least one file is accepted.

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { durableSeedFiles } from './memory-seed-set.mjs';

export const MEMORY_SEED_MODES = ['all', 'choose', 'none'];

// Parse the non-interactive flag. Supports both `--memory-seed=all` and
// `--memory-seed all`. Returns 'all'|'choose'|'none', or null when absent (the
// caller then falls back to the interactive prompt / non-TTY `none` default).
export function parseMemorySeedFlag(args = []) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--memory-seed') {
      const v = args[i + 1];
      return MEMORY_SEED_MODES.includes(v) ? v : null;
    }
    if (a.startsWith('--memory-seed=')) {
      const v = a.slice('--memory-seed='.length);
      return MEMORY_SEED_MODES.includes(v) ? v : null;
    }
  }
  return null;
}

// Parse MEMORY.md bullets into selectable menu items. Each durable bullet is
// `- [Title](file.md) — hook`. Only bullets whose link target is a durable seed
// member (present on disk, not a meta-doc / ephemeral tracker) become items.
export function parseMemoryBullets(memoryMd, seedFiles = null) {
  const durable = seedFiles ? new Set(seedFiles) : null;
  const items = [];
  for (const line of String(memoryMd).split('\n')) {
    const m = line.match(/^\s*-\s*\[([^\]]+)\]\(([^)]+\.md)\)\s*(?:[—-]+\s*(.*))?$/);
    if (!m) continue;
    const file = m[2].trim();
    if (durable && !durable.has(file)) continue;
    items.push({ title: m[1].trim(), file, hook: (m[3] || '').trim() });
  }
  return items;
}

// Resolve the file list for a non-choose mode. `choose` is resolved by the
// interactive layer (which produces an explicit file list passed to writeMemorySeed).
export function filesForMode(seedDir, mode) {
  if (mode === 'all') return durableSeedFiles(seedDir);
  return [];
}

// Copy `selectedFiles` from `seedDir` into `memoryDir`, then write a MEMORY.md
// filtered to the accepted set (bullet lines whose target was not accepted are
// dropped; headers/blank lines are preserved). Returns { accepted, count }.
export function writeMemorySeed({ seedDir, memoryDir, selectedFiles }) {
  const selected = (selectedFiles || []).filter((f) => existsSync(join(seedDir, f)));
  if (selected.length === 0) return { accepted: [], count: 0 };

  mkdirSync(memoryDir, { recursive: true });
  const accepted = [];
  for (const file of selected) {
    copyFileSync(join(seedDir, file), join(memoryDir, file));
    accepted.push(file);
  }

  const acceptedSet = new Set(accepted);
  const memoryMdPath = join(seedDir, 'MEMORY.md');
  const memoryMd = existsSync(memoryMdPath) ? readFileSync(memoryMdPath, 'utf8') : '';
  const kept = memoryMd.split('\n').filter((line) => {
    const m = line.match(/\]\(([^)]+\.md)\)/);
    if (!m) return true; // non-bullet line (header / blank) — keep
    return acceptedSet.has(m[1].trim());
  });
  writeFileSync(join(memoryDir, 'MEMORY.md'), kept.join('\n'), 'utf8');

  return { accepted, count: accepted.length };
}
