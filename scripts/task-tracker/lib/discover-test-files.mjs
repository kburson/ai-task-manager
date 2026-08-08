// @story #872
/**
 * Canonical test-file discovery (#872 / C1 of sub-epic #860).
 *
 * The single source of truth for "which `*.test.mjs` files exist under
 * `scripts/`". It replaces the repo's five divergent enumerators — the four
 * flat `readdirSync` directories in `run-tests.mjs`, the recursive walk in
 * `audit-story-tags.mjs`, the `find` scan in `lint-fleet-sandbox-isolation.mjs`,
 * and the ADR-0001 source→test mapper in `find-unit-tests.mjs` — which today
 * disagree about the file set (614 / 618 / 630 / 642 in the #860 audit) and so
 * let co-located tests run nowhere while `test:all` prints a false green.
 *
 * Library only: consumers are migrated onto this module in siblings C2 (#873),
 * C3 (#874) and C4 (#875). No consumer is touched here.
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
// scripts/task-tracker/lib/discover-test-files.mjs → repo root is three up.
const DEFAULT_PROJECT_ROOT = path.resolve(__dir, '../../..');
const DEFAULT_ROOT = 'scripts';
const TEST_FILE_RE = /\.test\.mjs$/;

// Directory names never descended into, matched per path segment (not
// substring): a directory literally named `fixtures` is skipped, while a real
// file such as `fixtures-helpers.mjs` is never misclassified.
export const DEFAULT_EXCLUDES = Object.freeze(['node_modules', 'fixtures', '__fixtures__']);

function isExcludedDirectory(rel, name, excludeSet) {
  if (!excludeSet.has(name)) return false;
  if (name === 'fixtures' && /(?:^|\/)tests\/(?:unit|integration|slow)\/fixtures$/.test(rel)) {
    return false;
  }
  return true;
}

function walk(absDir, relDir, excludeSet, match, out) {
  let entries;
  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch {
    return out; // an absent or unreadable directory contributes nothing
  }
  for (const entry of entries) {
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (isExcludedDirectory(rel, entry.name, excludeSet)) continue;
      walk(path.join(absDir, entry.name), rel, excludeSet, match, out);
    } else if (entry.isFile() && match.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * Recursively discover every file whose basename matches `match` under `root`.
 *
 * The single recursive walker in the repo (#875, C4). `discoverTestFiles` is a
 * thin `match: TEST_FILE_RE` view over this; consumers that need a wider set —
 * e.g. the fleet-sandbox lint scans **all** `.mjs` under `/tests/`, a superset
 * of `*.test.mjs` — pass their own `match` and `excludes` rather than keeping a
 * private `find`/`readdirSync` walk that could drift from ground truth.
 *
 * @param {object} [opts]
 * @param {RegExp} [opts.match=/\.mjs$/] - tested against each file's basename
 * @param {string} [opts.root='scripts'] - repo-relative (or absolute) start dir
 * @param {string[]} [opts.excludes] - directory names to skip (segment match)
 * @param {string} [opts.projectRoot] - repo root; inferred from this file's path
 * @returns {string[]} sorted, repo-relative paths with POSIX separators
 */
export function discoverFiles({
  match = /\.mjs$/,
  root = DEFAULT_ROOT,
  excludes = DEFAULT_EXCLUDES,
  projectRoot = DEFAULT_PROJECT_ROOT,
} = {}) {
  const excludeSet = new Set(excludes);
  const abs = path.isAbsolute(root) ? root : path.join(projectRoot, root);
  const relRoot = path.isAbsolute(root) ? path.relative(projectRoot, root) : root;
  const out = walk(abs, relRoot, excludeSet, match, []);
  return out.sort();
}

/**
 * Recursively discover every `*.test.mjs` file under `root`. A `match`-fixed
 * view over {@link discoverFiles}, kept as the named primitive most callers use.
 *
 * @param {object} [opts]
 * @param {string} [opts.root='scripts'] - repo-relative (or absolute) start dir
 * @param {string[]} [opts.excludes] - directory names to skip (segment match)
 * @param {string} [opts.projectRoot] - repo root; inferred from this file's path
 * @returns {string[]} sorted, repo-relative paths with POSIX separators
 */
export function discoverTestFiles(opts = {}) {
  return discoverFiles({ ...opts, match: TEST_FILE_RE });
}

/**
 * The on-disk ground-truth count of `*.test.mjs` files under `root`, backed by
 * the same walk as {@link discoverTestFiles} so the two can never drift.
 *
 * @param {object} [opts] - same shape as {@link discoverTestFiles}
 * @returns {number}
 */
export function onDiskTestFileCount(opts = {}) {
  return discoverTestFiles(opts).length;
}

/**
 * Delta between a caller-supplied discovered set and the on-disk ground truth.
 * A non-empty `missing` means a co-located test is absent from the caller's set
 * and would silently vanish; a non-empty `extra` means the caller lists a path
 * that is not on disk. The runner (C3) turns a non-empty delta into a non-zero
 * exit, so a green run provably ran every on-disk test file.
 *
 * @param {object} args
 * @param {string[]} args.discovered - repo-relative paths the caller will run
 * @param {string} [args.root] - see {@link discoverTestFiles}
 * @param {string[]} [args.excludes] - see {@link discoverTestFiles}
 * @param {string} [args.projectRoot] - see {@link discoverTestFiles}
 * @returns {{missing: string[], extra: string[]}} sorted deltas
 */
export function divergence({ discovered, ...opts } = {}) {
  if (!Array.isArray(discovered)) {
    throw new TypeError('divergence: `discovered` must be an array of repo-relative paths');
  }
  const truth = new Set(discoverTestFiles(opts));
  const claimed = new Set(discovered);
  const missing = [...truth].filter((f) => !claimed.has(f)).sort();
  const extra = [...claimed].filter((f) => !truth.has(f)).sort();
  return { missing, extra };
}
