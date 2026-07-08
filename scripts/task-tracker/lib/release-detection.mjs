// #734 — opt-in, default-off release/branch-topology detection.
//
// This module is a deliberately STRUCTURAL separation from the universal
// issue↔commit attribution engine (`lib/commit-attribution.mjs`), which stays
// topology-agnostic and always-on. It imports NOTHING from that engine and is
// purely additive: toggling `config.releaseDetection` changes ONLY the result
// of `detectRelease` here — it never feeds into or alters any attribution input.
//
// `detectRelease` is pure: no git shelling, no I/O, no globals. It classifies a
// supplied `branch` string against a small, deterministic release-topology
// heuristic. When the flag is off (the default) it is a genuine no-op — it does
// not consult or compute topology at all.

// Branch-name prefixes that denote a release/hotfix branch under the common
// GitFlow / release-branch conventions. Matched case-insensitively.
const RELEASE_PREFIXES = ['release/', 'hotfix/'];

// Exact branch names that are conventionally release refs.
const RELEASE_EXACT = new Set(['release', 'main', 'master']);

// Classify a branch name against the release-topology heuristic. Pure string
// logic — deterministic, no external state.
function isReleaseBranch(branch) {
  if (typeof branch !== 'string' || branch.length === 0) return false;
  const name = branch.trim().toLowerCase();
  if (name.length === 0) return false;
  if (RELEASE_EXACT.has(name)) return true;
  return RELEASE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

// Detect whether the given branch is a release/topology branch, gated on the
// opt-in `config.releaseDetection` flag.
//
// - Flag falsy (default): disabled no-op → { enabled: false, isRelease: false }.
//   The `branch` input is never inspected.
// - Flag true: enabled → { enabled: true, isRelease: <boolean> } where
//   `isRelease` is the heuristic classification of `branch`.
export function detectRelease({ config, branch } = {}) {
  if (!config?.releaseDetection) {
    return { enabled: false, isRelease: false };
  }
  return { enabled: true, isRelease: isReleaseBranch(branch) };
}
