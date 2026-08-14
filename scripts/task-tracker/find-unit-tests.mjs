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
 * Return the exact canonical unit-test path for a supported source path.
 *
 * A source below `scripts/` keeps its complete directory path below
 * `scripts/tests/unit/`. Package-root modules use `unit/core/`; modules at the
 * task-tracker root use `unit/task-tracker/core/`. Tests and unsupported paths
 * return null.
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
 * Build a basename → canonical-paths index over discovered unit tests. Keeping
 * every match lets the compatibility fallback reject ambiguity.
 *
 * @param {string[]} known - repo-relative discovered test paths
 * @returns {Map<string,string[]>} basename → all matching canonical unit paths
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

/** @deprecated Compatibility-only string helper; use {@link unitTestPath}. */
export function coLocatedTestPath(srcPath) {
  if (srcPath.endsWith('.test.mjs')) return null;
  const dir = path.posix.dirname(srcPath);
  const base = path.basename(srcPath, '.mjs');
  return dir === '.' ? `${base}.test.mjs` : `${dir}/${base}.test.mjs`;
}

/**
 * Match each source to its full source-relative canonical unit path when that
 * path is discovered. If the exact path is absent, a basename compatibility
 * fallback is accepted only when exactly one discovered unit test has that
 * basename; zero or multiple matches produce no mapping. Discovery membership
 * is the same canonical ground truth used by the runner.
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
