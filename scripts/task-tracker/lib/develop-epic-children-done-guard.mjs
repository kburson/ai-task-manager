// Develop-exit guard: epic-children done-admission (#337, parent epic #259).
//
// Wraps `developEpicTestChildrenGate` (scripts/task-tracker/lib/epic-children-
// gate.mjs) so the epic-children done rule reaches the registry through the
// existing `runGuards('develop', 'test', ctx)` call in
// scripts/gh/move-state.mjs.
//
// Rule: an EPIC moving develop → test is refused if any sub-issue is in any
// state other than `done`. Mirrors `planEpicChildrenGuard` (#277) shape, with
// the predicate flipped from "child at refine or later" to "child at done".
// Leaf issues (no `aitm-sub-issues` children) pass trivially.
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
    const reason = (result.blockers || []).join('; ') || 'epic-children-not-done';
    return { ok: false, reason, blockers: result.blockers || [] };
  },
};
