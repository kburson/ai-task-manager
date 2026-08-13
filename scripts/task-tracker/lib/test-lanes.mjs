// @story #873
/**
 * Test-lane taxonomy (#873 / C2 of sub-epic #860).
 *
 * The single classifier that assigns every discovered `*.test.mjs` file to
 * exactly one lane. It replaces the legacy "a file's lane is whichever
 * hand-listed directory `run-tests.mjs` read it from" coupling, which left
 * C1's co-located tests (discovered but in no `tests/{unit,integration,slow}/`
 * directory) with no lane at all — the false-green failure mode in the lane
 * dimension.
 *
 * The rule is TOTAL and MUTUALLY EXCLUSIVE: `slow` wins, then `integration`,
 * else `unit`. Because `unit` is the catch-all default, no discovered file can
 * be unassigned or ambiguous. The written contract these criteria implement
 * lives in `docs/guides/test-lane-taxonomy.md`.
 *
 * Consumed by C3 (#874): the runner imports `laneManifest`/`laneOf` instead of
 * re-deriving lanes from a directory list, so discovery and lane assignment
 * share one source of truth and cannot drift.
 */

import { discoverTestFiles } from './discover-test-files.mjs';

export const CANONICAL_TEST_ROOT = 'scripts/tests';
export const CANONICAL_LANES = Object.freeze(['unit', 'integration', 'slow']);

export function parseCanonicalTestPath(relPath) {
  const normalized = String(relPath).replaceAll('\\', '/');
  const match = /^scripts\/tests\/(unit|integration|slow)\/(.+\.test\.mjs)$/.exec(normalized);
  if (!match || match[2].split('/').includes('..')) return null;
  return { lane: match[1], relative: match[2] };
}

export function canonicalLayoutViolations(files) {
  return files.filter((file) => parseCanonicalTestPath(file) === null).sort();
}

/** The three lanes, in fast→slow order. */
export const LANES = Object.freeze(['unit', 'integration', 'slow']);

/**
 * Classify a repo-relative test path into exactly one lane.
 *
 * A `slow` or `integration` directory segment appearing after a `tests`
 * ancestor selects that lane; everything else — co-located `foo.test.mjs` next
 * to its source, and anything under `tests/unit/` — is a unit test by
 * construction. Matching is on whole path segments, so a file merely *named*
 * `slow.test.mjs` is never misclassified.
 *
 * @param {string} relPath - repo-relative POSIX path to a `*.test.mjs` file
 * @returns {'unit'|'integration'|'slow'} exactly one lane; never undefined
 */
export function laneOf(relPath) {
  const segments = String(relPath).split('/');
  const testsIdx = segments.indexOf('tests');
  if (testsIdx !== -1) {
    const after = segments.slice(testsIdx + 1);
    if (after.includes('slow')) return 'slow';
    if (after.includes('integration')) return 'integration';
  }
  return 'unit';
}

/**
 * Partition every discovered test file into its lane.
 *
 * Runs {@link discoverTestFiles} and buckets the result by {@link laneOf}, so
 * the union of the three lists is exactly the discovered set and the lists are
 * pairwise disjoint. This is the manifest the runner (C3) selects lanes from.
 *
 * @param {object} [opts] - forwarded to {@link discoverTestFiles}
 * @returns {{unit: string[], integration: string[], slow: string[]}}
 */
export function laneManifest(opts = {}) {
  const manifest = { unit: [], integration: [], slow: [] };
  for (const file of discoverTestFiles(opts)) {
    manifest[laneOf(file)].push(file);
  }
  return manifest;
}
