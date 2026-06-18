// @story #448
/**
 * Source-to-unit-test mapper for the Develop phase (C2 of #431).
 *
 * Convention (ADR 0001 §2): each source module <name>.mjs has a unit test at
 * scripts/task-tracker/tests/unit/<name>.test.mjs. Discovery is best-effort —
 * source files with no matching test are silently skipped.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));

// Repo root inferred from this file's location (scripts/task-tracker/find-unit-tests.mjs)
const DEFAULT_PROJECT_ROOT = path.resolve(__dir, '../..');
const UNIT_TEST_REL_PREFIX = 'scripts/task-tracker/tests/unit';

/**
 * Pure mapping: returns the repo-root-relative unit-test path for a source
 * file, or null if srcPath is already a test file.
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
 * Filesystem-checked discovery: filters to candidates that exist on disk.
 *
 * @param {string[]} sourcePaths - repo-root-relative source file paths
 * @param {{ projectRoot?: string }} [opts]
 * @returns {string[]} repo-root-relative unit-test paths that exist
 */
export function findUnitTests(sourcePaths, { projectRoot = DEFAULT_PROJECT_ROOT } = {}) {
  const seen = new Set();
  const results = [];
  for (const src of sourcePaths) {
    const rel = unitTestPath(src);
    if (!rel || seen.has(rel)) continue;
    seen.add(rel);
    if (existsSync(path.join(projectRoot, rel))) {
      results.push(rel);
    }
  }
  return results;
}
