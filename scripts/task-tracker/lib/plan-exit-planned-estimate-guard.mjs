// Plan-exit guard: planned-estimate appendix (#336).
//
// Wraps `planPlannedEstimateGate` so the plan→develop transition refuses
// when the `### 🛠 Refine estimate` comment lacks a `### Planned Estimate`
// appendix. Reached via `runGuards('plan', 'develop', ctx)` at
// scripts/gh/move-state.mjs:394.
//
// Context contract:
//   { cfg: Config, issueNumber: number, deps?: { plannedEstimate?: GhDeps } }
//
// Scope: only fires for plan → develop (other tos no-op). Fail-open when
// ctx is missing cfg/issueNumber.

import { planPlannedEstimateGate } from './refine-estimate-comment.mjs';

export const GUARD_ID = 'plan-exit-planned-estimate';

export const planExitPlannedEstimateGuard = {
  id: GUARD_ID,
  async run(ctx) {
    if (ctx?.toState && ctx.toState !== 'develop') return { ok: true };
    if (!ctx || !ctx.cfg || ctx.issueNumber == null) return { ok: true };
    const result = await planPlannedEstimateGate({
      cfg: ctx.cfg,
      issueNumber: ctx.issueNumber,
      deps: ctx.deps?.plannedEstimate,
    });
    if (result.ok) return { ok: true };
    return {
      ok: false,
      reason: (result.blockers || []).join('; ') || 'planned-estimate-missing',
      blockers: result.blockers || [],
    };
  },
};
