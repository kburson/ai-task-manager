// @story #864
/**
 * Per-section wall-time ceiling (#864 / half B of epic #859's test-architecture).
 *
 * The standing directive is absolute: **never a test run over ten minutes.** Once
 * `test:all` is retired the suite runs only in bounded sections (`unit`,
 * `integration`, `fast`, `slow`), and each of those is fail-closed against this
 * ceiling — a section that regrows past the budget exits non-zero rather than
 * being quietly tolerated. The overage is then handed to the #945 describe-fixture
 * refactor; the ceiling is never relaxed to accommodate a slow section.
 *
 * This module is a pure seam so the guard is unit-testable without a real
 * ten-minute sleep: {@link evaluateCeiling} takes an already-measured elapsed time
 * and decides. `run-tests.mjs` measures the wall time and feeds it in.
 *
 * `all` is exempt: it is not an exposed run-script but the internal union consumed
 * by the divergence guard and `test:coverage` (one c8 process over every file),
 * which legitimately spans the whole suite.
 */

/** Default section ceiling: ten minutes, in milliseconds. */
export const DEFAULT_SECTION_CEILING_MS = 10 * 60 * 1000;

/** Env var that overrides the default ceiling (milliseconds); used by tests. */
export const CEILING_ENV = 'AITM_TEST_CEILING_MS';

/** Lanes exempt from the section ceiling — the internal full-suite union only. */
export const CEILING_EXEMPT_LANES = Object.freeze(new Set(['all']));

/**
 * The ceiling (ms) that applies to a lane, or `null` when the lane is exempt.
 *
 * @param {string} lane
 * @param {Record<string,string|undefined>} [env]
 * @returns {number|null}
 */
export function ceilingMsForLane(lane, env = process.env) {
  if (CEILING_EXEMPT_LANES.has(lane)) return null;
  const raw = env?.[CEILING_ENV];
  if (raw !== undefined && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_SECTION_CEILING_MS;
}

/**
 * Decide whether a measured section run breached its wall-time ceiling.
 *
 * @param {object} args
 * @param {string} args.lane            - the run-lane that executed
 * @param {number} args.elapsedMs       - measured wall time of the section
 * @param {Record<string,string|undefined>} [args.env]
 * @returns {{breached: boolean, exempt: boolean, ceilingMs: number|null, elapsedMs: number, message?: string}}
 */
export function evaluateCeiling({ lane, elapsedMs, env = process.env }) {
  const ceilingMs = ceilingMsForLane(lane, env);
  if (ceilingMs === null) {
    return { breached: false, exempt: true, ceilingMs: null, elapsedMs };
  }
  const breached = elapsedMs > ceilingMs;
  const result = { breached, exempt: false, ceilingMs, elapsedMs };
  if (breached) {
    result.message =
      `run-tests: lane '${lane}' ran ${(elapsedMs / 1000).toFixed(1)}s, over the ` +
      `${(ceilingMs / 1000).toFixed(0)}s section ceiling (fail-closed). Split the ` +
      `section (see #945) — do not relax the ceiling.`;
  }
  return result;
}
