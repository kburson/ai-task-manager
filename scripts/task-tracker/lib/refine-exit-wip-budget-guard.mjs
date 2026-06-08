// Refine-exit guard: epic WIP budget (#336, parent epic #340).
//
// Wraps `planRefineWipGate` (scripts/task-tracker/lib/epic-children-gate.mjs)
// so the refine→plan WIP budget reaches the registry through the existing
// `runGuards('refine', 'plan', ctx)` call at scripts/gh/move-state.mjs:394.
//
// Rule: at most one child per epic may advance out of Refine at a time
// (parked-on-dependency children excepted; a blocker may run ahead of the
// sibling it unblocks). Solo issues bypass; fetch failures fail open.
//
// Soft-off knob: `cfg.gatePlanRefineWip === false` skips the guard for the
// whole project — mirror of the inline branch retired from promote.mjs:321.
//
// Context contract:
//   { cfg: Config, issueNumber: number, deps?: { fetchParentIssue?, epicChildren? } }
//
// Fail-open when ctx is missing `cfg` or `issueNumber` (parity with other
// adapters; lets non-promote runGuards callers no-op safely).

import { planRefineWipGate } from './epic-children-gate.mjs';
import { fetchParentIssue as defaultFetchParentIssue } from './fetch-parent-issue.mjs';

export const GUARD_ID = 'refine-exit-wip-budget';

export const refineExitWipBudgetGuard = {
  id: GUARD_ID,
  async run(ctx) {
    if (ctx?.toState && ctx.toState !== 'plan') return { ok: true };
    if (!ctx || !ctx.cfg || ctx.issueNumber == null) return { ok: true };
    if (ctx.cfg.gatePlanRefineWip === false) return { ok: true };
    const result = await planRefineWipGate({
      cfg: ctx.cfg,
      issueNumber: ctx.issueNumber,
      deps: {
        fetchParentIssue: ctx.deps?.fetchParentIssue || defaultFetchParentIssue,
        ...(ctx.deps?.epicChildren || {}),
      },
    });
    if (result.ok) return { ok: true };
    return {
      ok: false,
      reason: (result.blockers || []).join('; ') || 'wip-budget-exceeded',
      blockers: result.blockers || [],
    };
  },
};
