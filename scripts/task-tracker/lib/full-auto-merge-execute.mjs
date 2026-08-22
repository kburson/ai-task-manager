// @story #908 (epic #912)
// Legacy adapter retained for linked-worktree attribution and local-lane
// classification. Provider-mediated PR delivery no longer executes here:
//
//   - detect a linked worktree (so the close-attribution query can target
//     `origin/trunk` and never touch the shared local `trunk` ref);
//   - resolve the open PR for legacy callers;
//   - fail CLOSED when a caller requests provider-mediated PR mutation.
//
// Every side effect funnels through an injected `pexec(cmd, args, opts)` so the
// The close verb imports only the linked-worktree helpers. The legacy exported
// classifier remains unit-testable for callers that have not migrated yet.

import { planFullAutoMerge, resolveCloseTrunkRef } from './full-auto-merge.mjs';
import { fetchParentIssueStrict } from './fetch-parent-issue.mjs';

// A linked worktree's git-dir is `…/.git/worktrees/<name>`; the main worktree's
// is a plain `.git`. That path segment is the reliable signal (a remote-tracking
// `origin/trunk` read from a linked worktree can never dirty the main worktree).
// Fail-safe: any error or missing pexec resolves to `false` (main-worktree
// behavior — read local `trunk`), the pre-#908 default.
export async function detectLinkedWorktree({ pexec, cwd } = {}) {
  if (typeof pexec !== 'function') return false;
  try {
    const { stdout } = await pexec('git', ['rev-parse', '--git-dir'], { cwd });
    return /[/\\]worktrees[/\\]/.test(String(stdout || '').trim());
  } catch {
    return false;
  }
}

// Adapter matching `lineageDoneGate`'s `resolveTrunkRef({ cfg, projectDir })`
// contract (close-gates-lineage.mjs), backed by the pure `resolveCloseTrunkRef`.
// Injected as `deps.closeGates.resolveTrunkRef` at the close verb's
// `runGuards('review','done', …)` call so a worktree close attributes against
// `origin/trunk`. An explicit `cfg.trunkRef` still wins (handled in the pure fn).
export function makeCloseTrunkRefResolver({ inWorktree = false, remoteTrunk } = {}) {
  return async ({ cfg } = {}) => resolveCloseTrunkRef({ cfg, inWorktree, remoteTrunk });
}

// Resolve the single open PR whose head is `branch`, or null when there is none
// (the local / interactive close path — no PR to auto-merge). Fail-safe: any
// error resolves to null, so a gh/network hiccup degrades to the unchanged
// no-PR close path rather than blocking the close.
export async function resolveOpenPrNumber({ branch, cfg = {}, pexec } = {}) {
  if (typeof pexec !== 'function' || !branch) return null;
  const args = ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number'];
  if (cfg.repo) args.push('-R', cfg.repo);
  try {
    const { stdout } = await pexec('gh', args, {});
    const list = JSON.parse(String(stdout || '[]'));
    const n = Array.isArray(list) && list.length ? Number(list[0].number) : null;
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

// Legacy close-time executor retained only as a classification surface. PR
// mutation is retired; provider-mediated delivery is owned by `/task deliver`.
//
//   { status: 'skipped-not-full-auto' }  interactive close — unchanged behavior
//   { status: 'skipped-parent-branch' }  child/nested epic delivers to its parent branch
//   { status: 'skipped-no-pr' }          no open PR for the branch — local close path
//   { status: 'fail-closed', message }   PR present under Full-Auto but `fullAutoMerge`
//                                         is unconfigured/invalid → caller HALTS, issue
//                                         stays OPEN (actionable message names the key)
//   { status: 'local-lane', prNumber }   operator-authorized no-PR local-trunk lane
export async function enableFullAutoMergeForClose({
  cfg = {},
  branch,
  issueNumber,
  isFullAuto,
  pexec,
  resolveParentIssue = fetchParentIssueStrict,
} = {}) {
  if (!isFullAuto) return { status: 'skipped-not-full-auto' };

  // #1196 — a child (including a nested epic) reaches Axis-1 Done on its
  // immediate parent branch. An open PR on that branch belongs to the parent
  // epic and must not be enabled while closing one child. Resolve lineage
  // before PR discovery; an unknown parent is unsafe to classify as top-level.
  if (issueNumber != null) {
    let parentIssueNumber;
    try {
      parentIssueNumber = await resolveParentIssue({ issueNumber, repo: cfg.repo });
    } catch (err) {
      return {
        status: 'fail-closed',
        message: `full-auto-merge-lineage-unresolved: ${err?.message || String(err)}`,
      };
    }
    if (parentIssueNumber != null) {
      return { status: 'skipped-parent-branch', parentIssueNumber };
    }
  }

  const prNumber = await resolveOpenPrNumber({ branch, cfg, pexec });
  if (prNumber == null) return { status: 'skipped-no-pr' };

  const plan = planFullAutoMerge({ prNumber, cfg });
  if (!plan.ok) return { status: 'fail-closed', message: plan.message };

  if (plan.mechanism === 'local-trunk-lane') {
    return { status: 'local-lane', prNumber };
  }

  return {
    status: 'fail-closed',
    message:
      'full-auto-merge-direct-executor-retired: PR mutation is owned by the host provider action; run `/task deliver #N`',
  };
}
