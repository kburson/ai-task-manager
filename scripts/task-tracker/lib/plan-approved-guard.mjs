// Plan-exit guard: human plan-approval marker (#277, parent epic #259).
//
// Refuses plan → develop unless `ctx.body` carries `<!-- aitm-plan-approved:
// <ts> -->`. `/task plan-approve #<N>` stamps the marker after a human signs
// off on the plan. Before #277 this check lived inline in
// `scripts/gh/move-state.mjs:423-486` (the `fromAnalyze` block); migrating
// into the registry collapses both call sites into the existing
// `runGuards('plan', 'develop', ctx)` invocation at move-state.mjs:394.
//
// Slot semantics: plan-EXIT, not develop-ENTRY. A `test → develop` bounce-back
// (test fails, code revises) must NOT require a fresh plan-approval marker;
// firing on develop entry would re-block that case. Plan-exit fires exactly
// when the issue is leaving plan, mirroring the historical `fromAnalyze`
// condition.
//
// Context contract: `{ body: string }`. No I/O. Fail-closed when body is
// empty or undefined (treat as "marker not present"), matching the inline
// check's behavior.

import { hasPlanApprovedMarker } from './markers.mjs';

export const GUARD_ID = 'plan-exit-plan-approved';

export const planApprovedGuard = {
  id: GUARD_ID,
  async run(ctx) {
    // Scoped to plan → develop. Bounce-backs to other states (refine rollback,
    // backlog drop) must NOT require a fresh plan-approval marker.
    if (ctx?.toState && ctx.toState !== 'develop') return { ok: true };
    const body = ctx?.body ?? '';
    if (hasPlanApprovedMarker(body)) return { ok: true };
    return {
      ok: false,
      reason:
        'plan -> develop requires <!-- aitm-plan-approved: <ts> --> marker in the body (run `/task plan-approve #<N>` to record human approval)',
    };
  },
};
