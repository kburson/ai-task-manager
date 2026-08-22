// @story #908 (epic #912)
// Full-Auto delivery mechanism policy + desync-safe local-trunk re-sync.
//
// The original PR-close path planned a GitHub-native auto-merge command here.
// Provider delivery retires that configuration mechanism in favor of a
// structured action emitted by `/task deliver`. Configuration resolution and
// command planning both refuse the retired mechanism without silently migrating
// it or returning executable arguments.
//
// Fast-forwarding the LOCAL `trunk` ref from a linked worktree still desyncs the
// main worktree. Re-sync therefore points the close attribution query at
// `origin/trunk`, a remote-tracking ref that is never checked out, when running
// inside a linked worktree. Local `trunk` is never touched, and an explicit
// `cfg.trunkRef` override always wins.
//
// Everything here is a PURE decision function: no child_process, no `gh`, no git.
// The close verb supplies the resolved config and worktree flag and executes the
// returned command plan itself. This keeps the policy unit-testable and the
// side effects auditable at the call site.

// Config lives under `cfg.fullAutoMerge` in `.ai-task-manager/task-tracker.json`:
//
//   "fullAutoMerge": {
//     "mechanism": "provider-action" | "local-trunk-lane",
//     "mergeMethod": "merge" | "squash" | "rebase",   // provider-action only
//     "operatorAuthorized": true                        // local-trunk-lane only
//   }

const VALID_MECHANISMS = ['provider-action', 'local-trunk-lane'];
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
  if (mechanism === 'gh-auto-merge') {
    return {
      ok: false,
      message:
        'full-auto-merge-retired-mechanism: fullAutoMerge.mechanism=gh-auto-merge is retired — ' +
        `set fullAutoMerge.mechanism=provider-action. See ${SETTINGS_DOC}.`,
    };
  }
  if (!VALID_MECHANISMS.includes(mechanism)) {
    return {
      ok: false,
      message:
        `full-auto-merge-bad-mechanism: fullAutoMerge.mechanism=${JSON.stringify(mechanism)} is not one of ` +
        `[${VALID_MECHANISMS.join(', ')}]. See ${SETTINGS_DOC}.`,
    };
  }

  if (mechanism === 'provider-action') {
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

// Produce the remaining legacy command-plan decision without executing it.
// Provider delivery and retired auto-merge both return refusals with no argv;
// only the explicitly authorized local lane returns its existing sentinel.
export function planFullAutoMerge({ cfg = {} } = {}) {
  const resolved = resolveMergeMechanism(cfg);
  if (!resolved.ok) return resolved;

  if (resolved.mechanism === 'provider-action') {
    return {
      ok: false,
      message:
        'full-auto-merge-provider-action-required: provider-action delivery must run through `/task deliver`.',
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
