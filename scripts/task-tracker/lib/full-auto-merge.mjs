// @story #908 (epic #912)
// Full-Auto PR merge path + desync-safe local-trunk re-sync.
//
// Two steps in the PR-based close flow cannot be completed by the agent in
// Full-Auto today:
//
//   1. `gh pr merge <N> --merge` is an immediate outward, irreversible merge — a
//      step an auto-mode run should not fire blind, and one an auto-mode safety
//      classifier may refuse outright.
//   2. Fast-forwarding the LOCAL `trunk` ref from a linked worktree desyncs the
//      main worktree (durable memory: "update-ref trunk desyncs main tree").
//
// This module encodes the sanctioned way around both WITHOUT bypassing the
// classifier and WITHOUT mutating local `trunk`:
//
//   - Merge: request GitHub-native auto-merge (`gh pr merge <N> --auto --merge`).
//     Enabling auto-merge is an idempotent request; GitHub performs the actual
//     merge once required checks pass. That is not the classifier-blocked local
//     merge. An operator-authorized `local-trunk-lane` (no push/PR) is the
//     explicit fallback for local-only batches.
//   - Re-sync: point the close attribution query at `origin/trunk` (a
//     remote-tracking ref that is never checked out) when running inside a linked
//     worktree, so local `trunk` is never touched and the main worktree never
//     desyncs. An explicit `cfg.trunkRef` override always wins.
//
// Everything here is a PURE decision function: no child_process, no `gh`, no git.
// The close verb supplies the resolved config and worktree flag and executes the
// returned command plan itself. This keeps the policy unit-testable and the
// side effects auditable at the call site.

// Config lives under `cfg.fullAutoMerge` in `.ai-task-manager/task-tracker.json`:
//
//   "fullAutoMerge": {
//     "mechanism": "gh-auto-merge" | "local-trunk-lane",
//     "mergeMethod": "merge" | "squash" | "rebase",   // gh-auto-merge only
//     "operatorAuthorized": true                        // local-trunk-lane only
//   }

const VALID_MECHANISMS = ['gh-auto-merge', 'local-trunk-lane'];
const VALID_MERGE_METHODS = ['merge', 'squash', 'rebase'];
const SETTINGS_DOC = 'docs/guides/settings-guide.md';

// Resolve the sanctioned merge mechanism from config. Returns a discriminated
// result; on failure the message names the missing key AND points at the guide,
// so a Full-Auto batch halts with an actionable error rather than a mid-drive
// classifier denial (AC2).
export function resolveMergeMechanism(cfg = {}) {
  const fa = cfg && cfg.fullAutoMerge;
  if (!fa || typeof fa !== 'object') {
    return {
      ok: false,
      message:
        'full-auto-merge-unconfigured: no `fullAutoMerge` block in task-tracker.json — ' +
        `set fullAutoMerge.mechanism to one of [${VALID_MECHANISMS.join(', ')}]. See ${SETTINGS_DOC}.`,
    };
  }

  const mechanism = fa.mechanism;
  if (!VALID_MECHANISMS.includes(mechanism)) {
    return {
      ok: false,
      message:
        `full-auto-merge-bad-mechanism: fullAutoMerge.mechanism=${JSON.stringify(mechanism)} is not one of ` +
        `[${VALID_MECHANISMS.join(', ')}]. See ${SETTINGS_DOC}.`,
    };
  }

  if (mechanism === 'gh-auto-merge') {
    const mergeMethod = fa.mergeMethod || 'merge';
    if (!VALID_MERGE_METHODS.includes(mergeMethod)) {
      return {
        ok: false,
        message:
          `full-auto-merge-bad-method: fullAutoMerge.mergeMethod=${JSON.stringify(mergeMethod)} is not one of ` +
          `[${VALID_MERGE_METHODS.join(', ')}]. See ${SETTINGS_DOC}.`,
      };
    }
    return { ok: true, mechanism, mergeMethod };
  }

  // local-trunk-lane — must be explicitly operator-authorized (it merges to
  // trunk with no PR / no CI, so it cannot be the silent default).
  if (fa.operatorAuthorized !== true) {
    return {
      ok: false,
      message:
        'full-auto-merge-lane-unauthorized: fullAutoMerge.mechanism=local-trunk-lane requires ' +
        `fullAutoMerge.operatorAuthorized=true (no-PR local merge is opt-in). See ${SETTINGS_DOC}.`,
    };
  }
  return { ok: true, mechanism };
}

// Produce the command PLAN (argv, not executed) for the resolved mechanism.
// For gh-auto-merge this is the `pr merge <N> --auto --<method>` argv, which the
// classifier permits because it only ENABLES auto-merge — GitHub performs the
// merge. For the local lane it returns a sentinel the close verb maps onto the
// existing merge-to-trunk close path. Refuses (with an actionable message) when a
// PR number is missing for a PR-based mechanism.
export function planFullAutoMerge({ prNumber, cfg = {} } = {}) {
  const resolved = resolveMergeMechanism(cfg);
  if (!resolved.ok) return resolved;

  if (resolved.mechanism === 'gh-auto-merge') {
    if (prNumber == null || `${prNumber}`.trim() === '') {
      return {
        ok: false,
        message:
          'full-auto-merge-missing-pr: gh-auto-merge needs a PR number to enable auto-merge on.',
      };
    }
    const n = String(prNumber).replace(/^#/, '');
    return {
      ok: true,
      mechanism: resolved.mechanism,
      // Non-classifier-blocked: `--auto` enables auto-merge rather than merging now.
      argv: ['pr', 'merge', n, '--auto', `--${resolved.mergeMethod}`],
      requiresPr: true,
    };
  }

  // local-trunk-lane: no PR, no gh command — the close verb runs its existing
  // local merge-to-trunk lane.
  return {
    ok: true,
    mechanism: resolved.mechanism,
    argv: null,
    requiresPr: false,
    localLane: true,
  };
}

// Resolve the desync-safe trunk ref for the close attribution query.
//   explicit cfg.trunkRef  → honored (operator override wins)
//   inWorktree === true    → 'origin/trunk' (never checked out → no desync)
//   otherwise              → 'trunk' (main worktree; local ref is safe to read)
// `remoteTrunk` overrides the 'origin/trunk' default (e.g. a non-`origin` remote
// or a differently-named trunk).
export function resolveCloseTrunkRef({ cfg = {}, inWorktree = false, remoteTrunk } = {}) {
  if (cfg && typeof cfg.trunkRef === 'string' && cfg.trunkRef.trim()) {
    return cfg.trunkRef.trim();
  }
  if (inWorktree) {
    return (remoteTrunk && remoteTrunk.trim()) || 'origin/trunk';
  }
  return 'trunk';
}
