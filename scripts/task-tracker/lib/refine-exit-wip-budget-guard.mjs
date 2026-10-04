// R4P-exit guard: sequential local epic WIP budget (#1216).
//
// Wraps `planRefineWipGate` (scripts/task-tracker/lib/epic-children-gate.mjs)
// so the R4P→Plan WIP budget reaches the registry through the central guard
// registry.
//
// Rule: at most one child per epic may occupy Plan/Develop/Test/Review. Blocked
// active children still count and dependencies provide no local parallel
// exception. Solo issues bypass; unreadable sibling state fails closed.
//
// Context contract:
//   { cfg: Config, issueNumber: number, deps?: { fetchParentIssue?, epicChildren? } }
//
// Fail-open when ctx is missing `cfg` or `issueNumber` (parity with other
// adapters; lets non-promote runGuards callers no-op safely).

import { planRefineWipGate } from './epic-children-gate.mjs';
import { fetchParentIssueStrict as defaultFetchParentIssue } from './fetch-parent-issue.mjs';

export const GUARD_ID = 'refine-exit-wip-budget';

export const refineExitWipBudgetGuard = {
  id: GUARD_ID,
  async run(ctx) {
    if (ctx?.toState && !['plan', 'develop'].includes(ctx.toState)) return { ok: true };
    if (!ctx || !ctx.cfg || ctx.issueNumber == null) return { ok: true };
    const result = await planRefineWipGate({
      cfg: ctx.cfg,
      issueNumber: ctx.issueNumber,
      projectDir: ctx.projectDir,
      readOnly: ctx.readOnly === true,
      toState: ctx.toState,
      deps: {
        fetchParentIssue: ctx.deps?.fetchParentIssue || defaultFetchParentIssue,
        ...(ctx.deps?.epicChildren || {}),
      },
    });
    if (result.ok) return { ok: true };
    if (result.code?.startsWith('rank-wave-'))
      return {
        ok: false,
        code: 'rank-wave-admission-refused',
        args: { reason: result.code },
        noAutomaticRemediation: { reason: 'operator-action-required' },
        reason: result.reason ?? result.code,
      };
    return {
      ok: false,
      reason: (result.blockers || []).join('; ') || 'wip-budget-exceeded',
      blockers: result.blockers || [],
    };
  },
};
