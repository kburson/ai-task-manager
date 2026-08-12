// Review-exit guard: epic-children done-admission (#877).
//
// Wraps `reviewEpicDoneChildrenGate` (scripts/task-tracker/lib/epic-children-
// gate.mjs) so the epic-children done rule reaches the registry through the
// `runGuards('review', 'done', ctx)` call in scripts/gh/move-state.mjs.
//
// Rule: an EPIC moving review → done is refused unless every required child is
// terminally delivered. #1216 enforces the same terminal floor at Develop →
// Test; this guard remains the final defense at close.
//
// Before this guard existed the review → done arc had NO epic-side children
// check at all — `childCannotLeadEpicExitGuard` inspects the issue's own
// *parent*, not its children — so this file is the load-bearing half of #877,
// not a formality.
//
// Context contract:
//   { cfg: Config, issueNumber: number, toState: 'done', deps?: { epicChildren?: GhDeps } }
//
// Fail-open guard rails: when ctx is missing `cfg` or `issueNumber` (e.g. an
// offline parity test that intentionally omits them), return `{ ok: true }`
// rather than synthesizing a refusal — refusal here would mask whichever other
// guard genuinely caused the run to fail.

import { reviewEpicDoneChildrenGate } from './epic-children-gate.mjs';

export const GUARD_ID = 'review-exit-epic-children-done';

export const reviewExitEpicChildrenDoneGuard = {
  id: GUARD_ID,
  async run(ctx) {
    // Scoped to review → done. A bounce-back to develop/test must NOT trigger
    // an epic-children done check.
    if (ctx?.toState && ctx.toState !== 'done') return { ok: true };
    if (!ctx || !ctx.cfg || !ctx.issueNumber) return { ok: true };
    const gateFn = ctx.deps?.reviewEpicDoneChildrenGate || reviewEpicDoneChildrenGate;
    const result = await gateFn({
      cfg: ctx.cfg,
      issueNumber: ctx.issueNumber,
      deps: ctx.deps?.epicChildren,
    });
    if (result.ok) return { ok: true };
    const reason = (result.blockers || []).join('; ') || 'epic-children-not-done';
    return { ok: false, reason, blockers: result.blockers || [] };
  },
};
