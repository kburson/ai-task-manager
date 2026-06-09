// Review-exit guard: close-gate bundle (#279).
//
// Wraps `runCloseGates` (chain-integrity + commits-on-trunk + issue-dirty +
// marker-present) so the review→done transition refuses when any sub-check
// fails. Reached via `runGuards('review', 'done', ctx)` from
// `scripts/task-tracker/verbs/close.mjs` (and indirectly from
// `scripts/gh/move-state.mjs` for the promote-direct path).
//
// Context contract:
//   { cfg: Config, issueNumber: number, body: string, projectDir?: string,
//     deps?: { closeGates?: object } }
//
// The underlying `runCloseGates` is network-and-disk (reads git refs,
// commit graph, working tree). Fail-open when ctx lacks cfg / issueNumber /
// body — `move-state.mjs` populates all three at the registry call site.
//
// Scope: only fires for review → done. Other tos no-op.

import { runCloseGates } from './close-gates.mjs';

export const GUARD_ID = 'review-exit-close-gates';

export const reviewExitCloseGatesGuard = {
  id: GUARD_ID,
  async run(ctx) {
    if (ctx?.toState && ctx.toState !== 'done') return { ok: true };
    if (!ctx || !ctx.cfg || ctx.issueNumber == null || typeof ctx.body !== 'string') {
      return { ok: true };
    }
    const result = await runCloseGates({
      cfg: ctx.cfg,
      issueNumber: ctx.issueNumber,
      body: ctx.body,
      projectDir: ctx.projectDir,
      deps: ctx.deps?.closeGates,
    });
    if (result.ok) {
      // dirtyCheckSkipped is a soft signal (issue-scoped dirty check could
      // not run) — surface it via the guard registry's warn channel so the
      // caller (verbs/close.mjs) can console.warn it without re-running the
      // gate logic.
      if (result.dirtyCheckSkipped) {
        return { ok: true, warn: { dirtyCheckSkipped: result.dirtyCheckSkipped } };
      }
      return { ok: true };
    }
    return {
      ok: false,
      reason: (result.blockers || []).join('; ') || 'close-gates-failed',
      blockers: result.blockers || [],
    };
  },
};
