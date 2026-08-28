// @story #874
/**
 * Runner lane selection (#874 / C3 of sub-epic #860).
 *
 * The testable seam extracted from `run-tests.mjs`, which executes on import and
 * so cannot be unit-tested directly. Every file the runner runs is sourced here
 * from the canonical discovery (C1, #872) and lane taxonomy (C2, #873) — there
 * is no independent `readdirSync` of hardcoded directories left in the runner.
 *
 * The runner's `fast | slow | all` **run**-lanes are a view over the taxonomy:
 *   fast = unit   integration = CI-only   slow = slow   all = every lane
 * (see docs/guides/test-lane-taxonomy.md). Because the union of the run-lanes is
 * exactly `discoverTestFiles()`, {@link discoveryDivergence} against the on-disk
 * ground truth is empty by construction — and a future edit that re-introduced a
 * hardcoded sub-list would make it non-empty and trip the runner's guard, so the
 * 624-vs-652 false green cannot recur.
 */

import { discoverTestFiles, divergence } from './task-tracker/lib/discover-test-files.mjs';
import { laneManifest } from './task-tracker/lib/test-lanes.mjs';

/**
 * The runner's selectable run-lanes.
 *
 * `unit` and `integration` are the bounded sections (#864): each runs one half of
 * the former `fast` lane on its own so integration tests stop interleaving with
 * unit tests. `all` remains a valid lane value — but only as an **internal** union
 * consumed by {@link discoveryDivergence} and `test:coverage` (one c8 process over
 * every file); it is deliberately no longer exposed as a `test:all` npm script,
 * because a single unbounded run breaches the 10-minute wall-time ceiling.
 */
export const RUN_LANES = Object.freeze(['unit', 'integration', 'fast', 'slow', 'all']);

/**
 * Tests skipped due to unrelated tracked bugs. Keyed by **repo-relative path**;
 * every value MUST reference an issue (e.g. `#123`). Empty today: a file that is
 * merely absent from disk is caught by the divergence guard, never silently
 * skipped, so SKIP is reserved for a present-but-known-broken file only.
 * @type {Map<string, string>}
 */
export const SKIP = new Map([]);

/**
 * The sorted repo-relative test paths for a run-lane, sourced entirely from the
 * canonical lane manifest.
 *
 * @param {'unit'|'integration'|'fast'|'slow'|'all'} lane
 * @param {object} [opts] - forwarded to {@link laneManifest}/{@link discoverTestFiles}
 * @returns {string[]} sorted, repo-relative POSIX paths
 */
export function laneFiles(lane, opts = {}) {
  const manifest = laneManifest(opts);
  const unit = [...manifest.unit].sort();
  const integration = [...manifest.integration].sort();
  // #1413 — `fast` is unit-only. The integration lane is CI-only under the
  // 2026-08-24 test-architecture direction: it holds the tests that touch live
  // systems, and running them locally is what made the lane nondeterministic
  // (1976 git spawns / ~900s per run, unrelated tests tripping GIT_TIMEOUT_MS).
  // "CI-only" means the local composite lanes stop including it — `integration`
  // is still directly selectable, and TIA still resolves individual files from
  // it, so a story touching heavy-system code runs those tests in Develop.
  const fast = [...manifest.unit].sort();
  const slow = [...manifest.slow].sort();
  if (lane === 'unit') return unit;
  if (lane === 'integration') return integration;
  if (lane === 'fast') return fast;
  if (lane === 'slow') return slow;
  // `all` is an EXPLICIT three-lane union, not `fast ∪ slow`. Deriving it from a
  // now-narrower `fast` would drop every integration file, and
  // `discoveryDivergence` compares this selection against on-disk ground truth
  // and fails the runner closed on any gap.
  if (lane === 'all') return [...manifest.unit, ...manifest.integration, ...manifest.slow].sort();
  throw new Error(`run-tests: --lane must be one of ${RUN_LANES.join('|')} (got: ${lane})`);
}

/**
 * Delta between the runner's full (`all`-lane) selection and the on-disk
 * `*.test.mjs` ground truth. A non-empty result means the runner would omit (or
 * over-claim) a file; the runner turns it into a non-zero exit so the complete
 * lane union accounts for every discovered committed test file. This does not
 * imply that one selected lane executed the other lanes.
 *
 * @param {object} [opts] - forwarded to discovery
 * @returns {{missing: string[], extra: string[]}}
 */
export function discoveryDivergence(opts = {}) {
  return divergence({ discovered: laneFiles('all', opts), ...opts });
}

/** Re-export so callers reach the on-disk truth through this module too. */
export { discoverTestFiles };
