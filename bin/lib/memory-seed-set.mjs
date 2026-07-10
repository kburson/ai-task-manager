// #728 — single source of truth for which `docs/ai-memory/*.md` files make up
// the curated durable memory seed shipped downstream.
//
// Both the install-time manifest (`template-manifest.mjs` →
// `memorySeedFiles()`) and the maintainer parity tool
// (`scripts/inspect/ai-memory-parity.mjs`) import these constants so the
// "what counts as a durable seed file" rule can never diverge between the
// shipping path and the drift lint. The parity script cannot be imported
// directly (it runs `process.exit(main())` at module load), which is exactly
// why the shared rule lives here rather than there.

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Ephemeral, non-reusable trackers excluded from the durable seed (#518).
// Drive-tree and integrity-epic project memories are point-in-time task logs,
// not reusable lessons — they never ship.
export const EXCLUDE_PATTERNS = [/^project_drive_.*_tree\.md$/, /^project_integrity_epic_.*\.md$/];

// Meta-docs live in the seed dir but are not memory facts. MEMORY.md is the
// always-loaded index (handled separately by the installer); EXCLUDED.md and
// DELIVERY.md are prose about the seed, not seed content.
export const META_DOCS = new Set(['MEMORY.md', 'EXCLUDED.md', 'DELIVERY.md']);

export const isEphemeral = (name) => EXCLUDE_PATTERNS.some((re) => re.test(name));
export const isMetaDoc = (name) => META_DOCS.has(name);

// Non-recursive list of top-level `*.md` files in `dir`. archive/ is a
// subdirectory and is therefore excluded by construction (never recursed).
export function listMd(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.md') && statSync(join(dir, f)).isFile());
}

// The durable memory-fact set: every top-level `*.md` minus meta-docs and
// ephemeral trackers, sorted for determinism. Excludes MEMORY.md (the index)
// and archive/ (non-top-level). This is the toggleable per-fact seed set.
export function durableSeedFiles(dir) {
  return listMd(dir)
    .filter((f) => !isMetaDoc(f) && !isEphemeral(f))
    .sort();
}
