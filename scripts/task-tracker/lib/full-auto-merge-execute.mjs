// @story #908 (epic #912)
// Impure EXECUTOR that wires the pure `full-auto-merge.mjs` policy into the close
// verb. `full-auto-merge.mjs` decides (mechanism, argv, trunk ref); this module
// performs the side effects the close verb needs and nothing more:
//
//   - detect a linked worktree (so the close-attribution query can target
//     `origin/trunk` and never touch the shared local `trunk` ref);
//   - resolve the open PR for the branch being closed;
//   - enable GitHub-native auto-merge (`gh pr merge <N> --auto --<method>`), or
//     fail CLOSED with the pure layer's actionable message.
//
// Every side effect funnels through an injected `pexec(cmd, args, opts)` so the
// wiring is unit-testable without git/gh. The close verb owns the control-flow
// consequences (halt vs continue); this module only reports a discriminated
// status.

import { planFullAutoMerge, resolveCloseTrunkRef } from './full-auto-merge.mjs';
import { isGovernedAuthorityError } from './work-lease/governed-effect.mjs';

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
  } catch (error) {
    if (isGovernedAuthorityError(error)) throw error;
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
  } catch (error) {
    if (isGovernedAuthorityError(error)) throw error;
    return null;
  }
}

// Enable GitHub-native auto-merge for the close flow. Called after the close
// gates pass. Discriminated result (the close verb owns the reaction):
//
//   { status: 'skipped-not-full-auto' }  interactive close — unchanged behavior
//   { status: 'skipped-no-pr' }          no open PR for the branch — local close path
//   { status: 'fail-closed', message }   PR present under Full-Auto but `fullAutoMerge`
//                                         is unconfigured/invalid → caller HALTS, issue
//                                         stays OPEN (actionable message names the key)
//   { status: 'local-lane', prNumber }   operator-authorized no-PR local-trunk lane →
//                                         caller runs its existing merge-to-trunk path
//   { status: 'enabled', prNumber, argv } auto-merge enabled via the permitted `--auto`
//                                         command (GitHub merges once checks pass)
//   { status: 'exec-failed', prNumber, argv, message }  the `gh` enable call errored
export async function enableFullAutoMergeForClose({
  cfg = {},
  branch,
  isFullAuto,
  pexec,
  issueNumber,
  operation = 'close',
  withGovernedEffect,
} = {}) {
  if (!isFullAuto) return { status: 'skipped-not-full-auto' };

  const prNumber = await resolveOpenPrNumber({ branch, cfg, pexec });
  if (prNumber == null) return { status: 'skipped-no-pr' };

  const plan = planFullAutoMerge({ prNumber, cfg });
  if (!plan.ok) return { status: 'fail-closed', message: plan.message };

  if (plan.mechanism === 'local-trunk-lane') {
    return { status: 'local-lane', prNumber };
  }

  // gh-auto-merge: execute the classifier-permitted `--auto` ENABLE. This does
  // not merge now; GitHub performs the merge once required checks pass.
  const argv = [...plan.argv];
  if (cfg.repo) argv.push('-R', cfg.repo);
  try {
    if (typeof withGovernedEffect === 'function') {
      await withGovernedEffect({ issueId: String(issueNumber), operation, heartbeat: true }, () =>
        pexec('gh', argv, {})
      );
    } else {
      await pexec('gh', argv, {});
    }
    return { status: 'enabled', prNumber, argv: plan.argv };
  } catch (err) {
    if (isGovernedAuthorityError(err)) throw err;
    return {
      status: 'exec-failed',
      prNumber,
      argv: plan.argv,
      message: err?.message || String(err),
    };
  }
}
