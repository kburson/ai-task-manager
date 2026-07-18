// @story #448
/**
 * Source-to-unit-test mapper for the Develop phase (C2 of #431).
 *
 * Convention (ADR 0001 §2): each source module <name>.mjs has a unit test at
 * scripts/task-tracker/tests/unit/<name>.test.mjs. Discovery is best-effort —
 * source files with no matching test are silently skipped.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverTestFiles } from './lib/discover-test-files.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));

// Repo root inferred from this file's location (scripts/task-tracker/find-unit-tests.mjs)
const DEFAULT_PROJECT_ROOT = path.resolve(__dir, '../..');
const UNIT_TEST_REL_PREFIX = 'scripts/task-tracker/tests/unit';

/**
 * Pure mapping: returns the repo-root-relative **conventional** unit-test path
 * (ADR-0001 §2: `tests/unit/<name>.test.mjs`) for a source file, or null if
 * srcPath is already a test file.
 *
 * @param {string} srcPath - any path ending in .mjs
 * @returns {string|null}
 */
export function unitTestPath(srcPath) {
  if (srcPath.endsWith('.test.mjs')) return null;
  const base = path.basename(srcPath, '.mjs');
  return `${UNIT_TEST_REL_PREFIX}/${base}.test.mjs`;
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
 * Discovery reconciled with the canonical walker (#875): for each source, take
 * the co-located test next to it if one exists, else the ADR-0001 conventional
 * `tests/unit/<name>.test.mjs`. "Exists" is membership in the canonical
 * `discoverTestFiles()` set — the same ground truth the runner uses — so a
 * co-located unit test the single-directory mapper used to miss is now found.
 *
 * @param {string[]} sourcePaths - repo-root-relative source file paths
 * @param {{ projectRoot?: string, discovered?: string[] }} [opts]
 * @returns {string[]} repo-root-relative unit-test paths that exist
 */
export function findUnitTests(
  sourcePaths,
  { projectRoot = DEFAULT_PROJECT_ROOT, discovered } = {}
) {
  const known = new Set(discovered || discoverTestFiles({ projectRoot }));
  const seen = new Set();
  const results = [];
  for (const src of sourcePaths) {
    // Co-located preferred, conventional as fallback. First existing hit wins.
    for (const rel of [coLocatedTestPath(src), unitTestPath(src)]) {
      if (!rel || seen.has(rel) || !known.has(rel)) continue;
      seen.add(rel);
      results.push(rel);
      break;
    }
  }
  return results;
}
