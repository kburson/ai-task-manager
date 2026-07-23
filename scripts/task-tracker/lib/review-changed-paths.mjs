// #940 — compute the `trunk...HEAD` changed-path set for the Agent Review Gate.
//
// The Review-layer "New Automated Tests" required-comment is diff-aware
// (`natCommentRequired`): a `docs-only`-marked issue skips the NAT summary only
// when its diff is provably documentation-only. To decide that, the `/task
// review` verb needs the set of paths its branch changed relative to trunk. This
// helper resolves the trunk ref (shared `resolveTrunkRef`) and runs
// `git diff --name-only <trunk>...HEAD` (three-dot: changes on HEAD since the
// merge-base, excluding trunk-only commits).
//
// BEST-EFFORT / DEFAULT-DENY: any failure — trunk unresolvable, git error, empty
// output — returns `[]`. An empty set is default-deny at `diffIsDocsOnly`
// (empty → NOT provably docs-only), so an unresolvable diff KEEPS the NAT
// requirement. The gate never silently drops a requirement because the diff
// could not be computed.

import { resolveTrunkRef } from './trunk-ref.mjs';

/**
 * @returns {Promise<string[]>} changed paths on `trunk...HEAD`, or `[]` on any
 *   failure (default-deny).
 */
export async function computeReviewChangedPaths({ cfg, projectDir, deps = {} } = {}) {
  const pexec = deps.pexec;
  if (typeof pexec !== 'function') return [];
  let trunkRef;
  try {
    trunkRef = await resolveTrunkRef({ cfg, projectDir, deps });
  } catch {
    return [];
  }
  if (!trunkRef) return [];
  try {
    const { stdout } = await pexec('git', ['diff', '--name-only', `${trunkRef}...HEAD`], {
      cwd: projectDir,
      timeout: 10_000,
    });
    return String(stdout || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}
