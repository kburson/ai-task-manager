// draft-file.mjs — interim autosave for the in-progress /task discover bucket (#576).
//
// Companion to plan-file.mjs. Where `savePlanFile` writes the FINALIZED plan to
// a date-stamped, never-overwritten `docs/plans/YYYYMMDD-<slug>.md`, this module
// writes the NOT-YET-finalized brainstorm to a tracked, slug-keyed draft at
// `docs/plans/.drafts/<slug>.md` that is overwritten on every flush. That is the
// "autosave as the discovery accumulates" semantic from epic #571: repeated
// flushes accrete into one tracked file (which survives a commit/push on one
// machine and a pull on another) instead of spawning N dated files.
//
// `docs/plans/.drafts/` is git-trackable — it is not matched by `.gitignore`,
// and `docs/plans/` already carries tracked files. The dot-prefix keeps interim
// drafts visually grouped and out of the way of the finalized plans alongside
// them, without making them untracked.

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { extractTitle, titleToSlug } from './plan-file.mjs';

// Resolve the slug a draft (and its later finalized plan) is keyed by, using
// the same precedence `save-draft` and `save-plan` both honor so the two agree
// on which file to write/clear:
//   1. an explicit slug,
//   2. an explicit title,
//   3. the content's H1 title,
//   4. the `discover-<YYYYMMDD>` fallback derived from the bucket start date.
// Returns a normalized slug (via titleToSlug).
export function resolveDraftSlug({ slug, title, content, startedAt } = {}) {
  if (slug && String(slug).trim()) return titleToSlug(slug);
  if (title && String(title).trim()) return titleToSlug(title);
  const h1 = extractTitle(content);
  if (h1) return titleToSlug(h1);
  const date = String(startedAt || '')
    .slice(0, 10)
    .replace(/-/g, '');
  return titleToSlug(`discover-${date || 'untitled'}`);
}

// Directory (relative to projectDir) that holds interim discovery drafts.
export const DRAFTS_SUBDIR = path.join('docs', 'plans', '.drafts');

// Absolute drafts directory for a project.
export function draftsDir(projectDir) {
  return path.join(projectDir, DRAFTS_SUBDIR);
}

// Filename for a draft slug. Slug-keyed only (no date prefix) so repeated
// autosaves of the same discovery overwrite one file.
export function draftFileName(slug) {
  return `${titleToSlug(slug)}.md`;
}

// Absolute path of the draft file for a slug.
export function draftPathFor({ projectDir, slug }) {
  return path.join(draftsDir(projectDir), draftFileName(slug));
}

// Write (or overwrite) the draft for `slug` with `content`. Creates the drafts
// directory if needed. Idempotent on the same (slug, content): re-writing
// identical bytes reproduces the same file. Returns the absolute path written.
export function saveDraftFile({ projectDir, slug, content }) {
  if (!projectDir) throw new Error('saveDraftFile: projectDir is required');
  if (slug == null || String(slug).trim() === '') {
    throw new Error('saveDraftFile: slug is required');
  }
  const dir = draftsDir(projectDir);
  mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, draftFileName(slug));
  writeFileSync(dest, String(content ?? ''), 'utf8');
  return dest;
}

// Remove the draft for `slug`. Best-effort: a missing draft is a no-op.
// Returns true if a file was removed, false if there was nothing to remove.
export function clearDraftFile({ projectDir, slug }) {
  if (!projectDir) throw new Error('clearDraftFile: projectDir is required');
  if (slug == null || String(slug).trim() === '') return false;
  const dest = path.join(draftsDir(projectDir), draftFileName(slug));
  if (!existsSync(dest)) return false;
  rmSync(dest, { force: true });
  return true;
}
