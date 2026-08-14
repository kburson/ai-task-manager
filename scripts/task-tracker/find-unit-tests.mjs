// @story #448
/**
 * Source-to-unit-test mapper for the Develop phase (C2 of #431).
 *
 * The canonical unit-test location mirrors a source's complete path relative
 * to scripts/. Root modules use the core bucket. Discovery is best-effort:
 * source files with no matching test are silently skipped.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverTestFiles } from './lib/discover-test-files.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));

// Repo root inferred from this file's location (scripts/task-tracker/find-unit-tests.mjs)
const DEFAULT_PROJECT_ROOT = path.resolve(__dir, '../..');
const UNIT_TEST_REL_PREFIX = 'scripts/tests/unit';

/**
 * Pure mapping: returns the repo-root-relative **flat conventional** unit-test
 * path (`tests/unit/<name>.test.mjs`) for a source file, or null if srcPath is
 * already a test file.
 *
 * NOTE (#868): this is the *pre-nesting* flat location. It is retained as the
 * documented naming convention (`<module>` ↔ `<module>.test.mjs`) and for the
 * degenerate flat case, but real discovery is nesting-aware — `findUnitTests`
 * resolves the actual (possibly subsystem-nested) path by basename. Do not use
 * this function's return value as a filesystem path assumption.
 *
 * @param {string} srcPath - any path ending in .mjs
 * @returns {string|null}
 */
export function unitTestPath(srcPath) {
  if (srcPath.endsWith('.test.mjs')) return null;
  const normalized = String(srcPath).replaceAll('\\', '/');
  if (!normalized.startsWith('scripts/') || !normalized.endsWith('.mjs')) return null;
  const sourceRelative = normalized.slice('scripts/'.length, -'.mjs'.length);
  const dirname = path.posix.dirname(sourceRelative);
  const base = path.basename(srcPath, '.mjs');
  if (dirname === '.') return `${UNIT_TEST_REL_PREFIX}/core/${base}.test.mjs`;
  if (dirname === 'task-tracker') {
    return `${UNIT_TEST_REL_PREFIX}/task-tracker/core/${base}.test.mjs`;
  }
  return `${UNIT_TEST_REL_PREFIX}/${dirname}/${base}.test.mjs`;
}

/**
 * Builds a basename → repo-relative-path index over the discovered test files
 * that live anywhere under the unit tree (`tests/unit/**`). First hit wins;
 * `discoverTestFiles` returns a sorted list, so the choice is deterministic when
 * a basename appears in more than one subsystem subdir (which the layout
 * verifier forbids, but the index stays total regardless).
 *
 * @param {string[]} known - repo-relative discovered test paths
 * @returns {Map<string,string>} basename (e.g. `foo.test.mjs`) → its unit path
 */
function unitTreeIndex(known) {
  const prefix = `${UNIT_TEST_REL_PREFIX}/`;
  const byBase = new Map();
  for (const rel of known) {
    if (!rel.startsWith(prefix)) continue;
    const base = rel.slice(rel.lastIndexOf('/') + 1);
    const matches = byBase.get(base) || [];
    matches.push(rel);
    byBase.set(base, matches);
  }
  return byBase;
}

/**
 * Pure mapping: returns the repo-root-relative **co-located** test path
 * (`<dir>/<name>.test.mjs`, next to the source) for a source file, or null if
 * srcPath is already a test file.
 *
 * @param {string} srcPath - any path ending in .mjs
 * @returns {string|null}
 */
export function coLocatedTestPath(srcPath) {
  if (srcPath.endsWith('.test.mjs')) return null;
  const dir = path.posix.dirname(srcPath);
  const base = path.basename(srcPath, '.mjs');
  return dir === '.' ? `${base}.test.mjs` : `${dir}/${base}.test.mjs`;
}

/**
 * Discovery reconciled with the canonical walker (#875) and nesting-aware after
 * #868: for each source `<dir>/<name>.mjs`, take the co-located test
 * `<dir>/<name>.test.mjs` if it exists, else the unit-tree test named
 * `<name>.test.mjs` wherever it now lives under `tests/unit/**` (flat root or a
 * subsystem subdir). "Exists" is membership in the canonical
 * `discoverTestFiles()` set — the same ground truth the runner uses.
 *
 * @param {string[]} sourcePaths - repo-root-relative source file paths
 * @param {{ projectRoot?: string, discovered?: string[] }} [opts]
 * @returns {string[]} repo-root-relative unit-test paths that exist
 */
export function findUnitTestMatches(
  sourcePaths,
  { projectRoot = DEFAULT_PROJECT_ROOT, discovered } = {}
) {
  const known = discovered || discoverTestFiles({ projectRoot });
  const knownSet = new Set(known);
  const byBase = unitTreeIndex(known);
  const results = [];
  for (const src of sourcePaths) {
    if (src.endsWith('.test.mjs')) continue;
    const expected = unitTestPath(src);
    const base = `${path.basename(src, '.mjs')}.test.mjs`;
    const fallback = byBase.get(base) || [];
    const rel =
      (expected && knownSet.has(expected) && expected) ||
      (fallback.length === 1 ? fallback[0] : null);
    if (!rel) continue;
    results.push({ source: src, test: rel });
  }
  return results;
}

export function findUnitTests(sourcePaths, opts = {}) {
  return [...new Set(findUnitTestMatches(sourcePaths, opts).map(({ test }) => test))];
}
