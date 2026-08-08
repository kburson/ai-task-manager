// #927 — one shared trunk-ref resolver for every consumer.
//
// The recurring desync: each trunk consumer independently bound to the LOCAL
// `trunk` branch. A scope-isolated task worktree cannot `git pull --ff-only`
// the main worktree's checked-out `trunk`; the only tool that will advance a
// branch checked out elsewhere is `git update-ref refs/heads/trunk`, which
// moves the ref but strands the main worktree's index/working-tree at the old
// commit → a persistent inverted staged diff.
//
// `git fetch` never touches any worktree's index/working-tree, so a
// fetch-then-read-`origin/trunk` policy is desync-proof BY CONSTRUCTION,
// regardless of what any worktree has checked out. This module makes the
// remote-tracking ref the default and the local branch a no-remote fallback,
// so local `trunk` becomes cosmetic: the main worktree can sit on any branch
// (e.g. `discovery/feature-B`) and every parallel task/epic worktree still
// integrates correctly through origin.
//
// Two exports:
//   - resolveTrunkRef({ cfg, projectDir, deps }) → the ref string to read, or null.
//   - fetchTrunk({ cfg, projectDir, deps })      → best-effort fetch before a read.
//
// Both take an injectable `deps.git(args) → stdout` (throws on non-zero) so the
// unit tests run pure. The CLI wiring passes a real `execFileSync`-backed git.

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

const pexecFile = promisify(execFile);

// Branch names probed, in order, when `cfg.trunkRef` is not set.
const TRUNK_BRANCHES = ['trunk', 'main', 'master'];

// Default git runner: resolves `git <args>` in `projectDir`, returns trimmed
// stdout, throws on a non-zero exit (so callers can `try/catch` a probe).
function defaultGit(projectDir) {
  return async (args) => {
    const { stdout } = await pexecFile('git', args, { cwd: projectDir, timeout: 15000 });
    return String(stdout).trim();
  };
}

// The configured remote to fetch from and prefix remote-tracking refs with.
function remoteName(cfg) {
  const r = cfg && typeof cfg.trunkRemote === 'string' ? cfg.trunkRemote.trim() : '';
  return r || 'origin';
}

// Resolve the trunk ref every consumer should read.
//
// Order:
//   1. `cfg.trunkRef` (explicit override, e.g. "origin/trunk") — wins outright.
//   2. First `<remote>/<branch>` among [trunk, main, master] that resolves as a
//      remote-tracking ref — the desync-proof default.
//   3. First local `refs/heads/<branch>` among the same list — the no-remote
//      (solo / local-only) fallback.
//   4. `null` — nothing resolved; the caller decides how to refuse.
export async function resolveTrunkRef({ cfg, projectDir, deps = {} } = {}) {
  const git = deps.git || defaultGit(projectDir);

  if (cfg && typeof cfg.trunkRef === 'string' && cfg.trunkRef.trim()) {
    return cfg.trunkRef.trim();
  }

  const remote = remoteName(cfg);

  // Prefer the remote-tracking ref.
  for (const branch of TRUNK_BRANCHES) {
    const remoteRef = `${remote}/${branch}`;
    try {
      await git(['rev-parse', '--verify', '--quiet', `refs/remotes/${remoteRef}`]);
      return remoteRef;
    } catch {
      // try next branch / fall through to the local probe
    }
  }

  // No remote-tracking ref exists (no remote configured, or never fetched):
  // fall back to the local branch so a solo / local-only repo still resolves.
  for (const branch of TRUNK_BRANCHES) {
    try {
      await git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
      return branch;
    } catch {
      // try next
    }
  }

  return null;
}

// Synchronous twin of `resolveTrunkRef`, for the ONE hot-path consumer that
// cannot await: the PreToolUse epic-base edit-guard runs on every file edit and
// must resolve WITHOUT a network round-trip. It never fetches — it reads whatever
// remote-tracking ref already exists (or the local fallback), honoring
// `cfg.trunkRef` exactly as the async form does. Same resolution order, sync git.
// Returns the ref string, or `null` when nothing resolves (the guard then fails
// open, its existing behavior).
export function resolveTrunkRefSync({ cfg, projectDir, deps = {} } = {}) {
  const git =
    deps.gitSync ||
    ((args) => execFileSync('git', args, { cwd: projectDir, encoding: 'utf8', timeout: 15000 }));

  if (cfg && typeof cfg.trunkRef === 'string' && cfg.trunkRef.trim()) {
    return cfg.trunkRef.trim();
  }

  const remote = remoteName(cfg);

  for (const branch of TRUNK_BRANCHES) {
    const remoteRef = `${remote}/${branch}`;
    try {
      git(['rev-parse', '--verify', '--quiet', `refs/remotes/${remoteRef}`]);
      return remoteRef;
    } catch {
      // try next branch / fall through to the local probe
    }
  }

  for (const branch of TRUNK_BRANCHES) {
    try {
      git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
      return branch;
    } catch {
      // try next
    }
  }

  return null;
}

// Best-effort fetch of the trunk ref before a consumer reads it, so the
// remote-tracking ref is authoritative. NEVER fatal: an offline run, a repo
// with no remote, or a fetch error all fall through to whatever the local
// remote-tracking ref (or local branch) already holds. Returns a small status
// object for logging; callers do not branch on it for correctness.
export async function fetchTrunk({ cfg, projectDir, deps = {} } = {}) {
  const git = deps.git || defaultGit(projectDir);
  const remote = remoteName(cfg);

  // If cfg pins an explicit non-remote ref (e.g. a bare local branch), there is
  // nothing to fetch — the read target is local by construction.
  const pinned = cfg && typeof cfg.trunkRef === 'string' ? cfg.trunkRef.trim() : '';
  const pinnedBranch = pinned.startsWith(`${remote}/`) ? pinned.slice(remote.length + 1) : null;

  // Fetch the specific branch(es) we might read. A pinned origin ref narrows to
  // one; otherwise refresh all candidate branches so resolveTrunkRef sees fresh
  // remote-tracking refs.
  const branches = pinnedBranch ? [pinnedBranch] : TRUNK_BRANCHES;

  for (const branch of branches) {
    try {
      await git(['fetch', remote, branch]);
      return { fetched: true, remote, branch };
    } catch {
      // try the next candidate; offline / no-remote / no-such-branch is fine
    }
  }

  return { fetched: false, remote };
}
