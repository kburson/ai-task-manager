// #501 — single source of truth for the markdown template files that are
// mirrored from `templates/` into a project's gitignored `.ai-task-manager/`
// runtime directory.
//
// `installTemplates()` (bin/cli.mjs) and the standalone `sync:templates`
// command (scripts/sync-templates.mjs) both import this list so the two copy
// paths can never diverge. Adding a runtime-mirrored template means editing
// this array and nothing else.
//
// Scope note: this is ONLY the markdown template set. The JSON config defaults
// (`project-fields.json`, `activity-policy.json`, etc.) have bespoke
// merge/preserve semantics in `installTemplates()` and are deliberately NOT
// listed here — they are not a flat overwrite-mirror.
export const TEMPLATE_FILES = [
  'pickup-directive.md',
  'definition-of-done.md',
  'epic-body.md',
  'sub-issue-body.md',
  'solo-issue-body.md',
  'session-boot.md',
  'session-state-template.md',
  'worker-report.md',
];

// #728 — the curated durable memory-seed group. Unlike TEMPLATE_FILES (a static
// hand-maintained list), the seed set is dynamic: it is sourced live from
// `docs/ai-memory/*.md` so a new durable memory the maintainer exports ships
// automatically without touching this file. `archive/` is a subdirectory and is
// never recursed; the parity `EXCLUDE_PATTERNS` (drive-tree / integrity-epic
// trackers) and the meta-docs (MEMORY.md index, EXCLUDED.md, DELIVERY.md) are
// filtered out via the shared `durableSeedFiles()` rule. The MEMORY.md index is
// managed separately by the installer, not returned here.
import { durableSeedFiles } from './memory-seed-set.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SEED_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'ai-memory');

// Returns the durable per-fact seed filenames (relative to the seed dir).
// Accepts an override dir for tests; defaults to the repo's docs/ai-memory.
export function memorySeedFiles(dir = SEED_DIR) {
  return durableSeedFiles(dir);
}
