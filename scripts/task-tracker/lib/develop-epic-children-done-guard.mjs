// Develop-exit guard: epic-children review-admission (#337, parent epic #259;
// predicate relaxed by #877).
//
// Wraps `developEpicTestChildrenGate` (scripts/task-tracker/lib/epic-children-
// gate.mjs) so the epic-children rule reaches the registry through the
// existing `runGuards('develop', 'test', ctx)` call in
// scripts/gh/move-state.mjs.
//
// Rule: an EPIC moving develop → test is refused if any sub-issue has not yet
// reached `review`. Mirrors `planEpicChildrenGuard` (#277) shape with a later
// floor. Leaf issues (no `aitm-sub-issues` children) pass trivially.
//
// #877 moved the stricter child-`done` requirement to the review → done arc;
// it lives in `reviewExitEpicChildrenDoneGuard`. The guard id and export name
// here are deliberately unchanged — this is still "the develop-exit epic
// children guard", and the id is referenced by the guard-registry doc table
// and by existing tests.
//
// Context contract:
//   { cfg: Config, issueNumber: number, toState: 'test', deps?: { epicChildren?: GhDeps } }
//
// Fail-open guard rails: when ctx is missing `cfg` or `issueNumber` (e.g.
// offline parity test that intentionally omits them), return `{ ok: true }`
// rather than synthesizing a refusal — refusal here would mask whichever
// other guard genuinely caused the run to fail.

import { developEpicTestChildrenGate } from './epic-children-gate.mjs';

export const GUARD_ID = 'develop-exit-epic-children-done';

export const developExitEpicChildrenDoneGuard = {
  id: GUARD_ID,
  async run(ctx) {
    // Scoped to develop → test. Rollbacks and bounce-backs to other states
    // must NOT trigger an epic-children done check.
    if (ctx?.toState && ctx.toState !== 'test') return { ok: true };
    if (!ctx || !ctx.cfg || !ctx.issueNumber) return { ok: true };
    const gateFn = ctx.deps?.developEpicTestChildrenGate || developEpicTestChildrenGate;
    const result = await gateFn({
      cfg: ctx.cfg,
      issueNumber: ctx.issueNumber,
      deps: ctx.deps?.epicChildren,
    });
    if (result.ok) return { ok: true };
    const reason = (result.blockers || []).join('; ') || 'epic-children-not-in-review';
    return { ok: false, reason, blockers: result.blockers || [] };
  },
};
