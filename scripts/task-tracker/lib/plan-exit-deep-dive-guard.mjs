// Plan-exit guard: deep-dive analysis recorded (#336, #297).
//
// Wraps `planDeepDiveGate` so the plan→develop transition refuses when the
// body lacks deep-dive markers / section / ticked Pickup Directive checkbox.
// Reached via `runGuards('plan', 'develop', ctx)` at
// scripts/gh/move-state.mjs:394.
//
// Context contract:
//   { body: string }
//
// The underlying gate is body-only (no network); ctx.body comes from the
// runGuards call site. Fail-open when ctx.body is undefined (other guards
// will surface the real reason; we don't want to mask).

import { planDeepDiveGate } from './deep-dive-gate.mjs';

export const GUARD_ID = 'plan-exit-deep-dive';

export const planExitDeepDiveGuard = {
  id: GUARD_ID,
  async run(ctx) {
    if (ctx?.toState && ctx.toState !== 'develop') return { ok: true };
    if (!ctx || typeof ctx.body !== 'string') return { ok: true };
    const result = planDeepDiveGate({ body: ctx.body });
    if (result.ok) return { ok: true };
    return {
      ok: false,
      reason: (result.blockers || []).join('; ') || 'deep-dive-missing',
      blockers: result.blockers || [],
    };
  },
};
