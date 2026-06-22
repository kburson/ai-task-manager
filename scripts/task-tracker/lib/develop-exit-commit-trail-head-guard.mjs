// Develop-exit guard: commit-trail-contains-HEAD (#336, #155).
//
// Wraps `gateCommitTrailContainsHead` so the develop→test transition refuses
// when the `### 🔗 Commits` comment's `aitm-commits` marker does not contain
// the current outer-HEAD SHA. Reached via `runGuards('develop', 'test', ctx)`
// at scripts/gh/move-state.mjs:394.
//
// Context contract:
//   { cfg: Config, issueNumber: number, projectDir?: string,
//     deps?: { commitTrailHead?: GhDeps } }
//
// Scope: only fires for develop → test. Fail-open when ctx missing
// cfg/issueNumber. projectDir defaults to TASK_TRACKER_PROJECT_DIR or cwd
// inside the underlying gate's deps factory.

import { gateCommitTrailContainsHead } from './code-complete-gate.mjs';
import { isNoCommitKind } from './issue-kind.mjs';

export const GUARD_ID = 'develop-exit-commit-trail-head';

export const developExitCommitTrailHeadGuard = {
  id: GUARD_ID,
  async run(ctx) {
    if (ctx?.toState && ctx.toState !== 'test') return { ok: true };
    if (!ctx || !ctx.cfg || ctx.issueNumber == null) return { ok: true };
    // #494, #500 — no-commit-lane issues (audit/research/spike/epic) carry no
    // `### 🔗 Commits` trail (their evidence is an `aitm-deliverable-posted`
    // marker checked by `gateCodeComplete`), so a HEAD-in-trail requirement is
    // inapplicable. Skip when no-commit-kind.
    if (isNoCommitKind(ctx.body)) return { ok: true };
    const projectDir = ctx.projectDir || process.env.TASK_TRACKER_PROJECT_DIR || process.cwd();
    const gateFn = ctx.deps?.commitTrailHeadGate || gateCommitTrailContainsHead;
    const result = await gateFn({
      cfg: ctx.cfg,
      issueNumber: ctx.issueNumber,
      projectDir,
      deps: ctx.deps?.commitTrailHead,
    });
    if (result.ok) return { ok: true };
    const reason = result.blocker || 'commit-trail-stale';
    return {
      ok: false,
      reason,
      blockers: [reason],
    };
  },
};
