// @story #888
// Review-exit guard: epic child-disposition (#888).
//
// Wraps `reviewEpicChildDispositionGate` so the check reaches the registry
// through `runGuards('review', 'done', ctx)`.
//
// Deliberately a SEPARATE guard from `reviewExitEpicChildrenDoneGuard` rather
// than a widening of it. That gate is network-only and body-blind; this check is
// a join over children AND body. Making the old gate body-dependent would
// quietly change its fail-open surface. Registered immediately after it in
// `states/review.mjs`: children-not-done is the cheaper and more fundamental
// refusal, and an epic with an open child should hear about the open child, not
// about the dispositions of the ones that closed.
//
// Fail-open guard rails match `reviewExitReviewApprovedGuard` — when ctx lacks
// `cfg`, `issueNumber`, or `body`, return ok rather than synthesizing a refusal
// that would mask whichever guard genuinely failed.

import { reviewEpicChildDispositionGate } from './epic-child-disposition-gate.mjs';

export const GUARD_ID = 'review-exit-epic-child-disposition';

export const reviewExitEpicChildDispositionGuard = {
  id: GUARD_ID,
  async run(ctx) {
    // Scoped to review → done. A bounce-back to develop/test must not trigger it.
    if (ctx?.toState && ctx.toState !== 'done') return { ok: true };
    if (!ctx || !ctx.cfg || !ctx.issueNumber) return { ok: true };
    if (typeof ctx.body !== 'string' || ctx.body === '') return { ok: true };
    const gateFn = ctx.deps?.reviewEpicChildDispositionGate || reviewEpicChildDispositionGate;
    const result = await gateFn({
      cfg: ctx.cfg,
      issueNumber: ctx.issueNumber,
      body: ctx.body,
      deps: ctx.deps?.epicChildren,
    });
    if (result.ok) return { ok: true };
    const reason = (result.blockers || []).join('; ') || 'epic-child-disposition-unstruck';
    return { ok: false, reason, blockers: result.blockers || [] };
  },
};
