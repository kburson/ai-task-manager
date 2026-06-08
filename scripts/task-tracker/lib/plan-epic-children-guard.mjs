// Plan-exit guard: epic-children admission (#277, parent epic #259).
//
// Wraps `planEpicDevelopChildrenGate` (scripts/task-tracker/lib/epic-children-
// gate.mjs) so the epic-children admission rule reaches the registry through
// the existing `runGuards('plan', 'develop', ctx)` call at
// scripts/gh/move-state.mjs:394.
//
// Rule: an EPIC moving plan → develop is refused if any sub-issue is still in
// a pre-refine state (currently only `backlog`). Children that have been
// refined OR have advanced past refine (plan/develop/test/review/done) all
// satisfy the admission rule — children may legitimately lead the parent.
// Solo issues (no `aitm-sub-issues` children) pass trivially — the underlying
// gate returns `{ ok: true, children: [] }` when GraphQL reports zero children.
//
// Context contract:
//   { cfg: Config, issueNumber: number, deps?: { epicChildren?: GhDeps } }
//
// `cfg` and `issueNumber` are populated by move-state.mjs at the runGuards
// call site (line 394). `deps.epicChildren` is reserved for tests that want
// to inject `fetchEpicChildren`; production calls leave it undefined and the
// underlying gate falls back to a live `gh` shell-out.
//
// Fail-open guard rails: when ctx is missing `cfg` or `issueNumber` (e.g.
// offline parity test that intentionally omits them), return `{ ok: true }`
// rather than synthesizing a refusal — refusal here would mask whichever
// other guard genuinely caused the run to fail.

import { planEpicDevelopChildrenGate } from './epic-children-gate.mjs';

export const GUARD_ID = 'plan-exit-epic-children-refine-or-beyond';

export const planEpicChildrenGuard = {
  id: GUARD_ID,
  async run(ctx) {
    // Scoped to plan → develop. Rollbacks and bounce-backs to other states
    // must NOT trigger an epic-children admission check.
    if (ctx?.toState && ctx.toState !== 'develop') return { ok: true };
    if (!ctx || !ctx.cfg || !ctx.issueNumber) return { ok: true };
    const gateFn = ctx.deps?.planEpicDevelopChildrenGate || planEpicDevelopChildrenGate;
    const result = await gateFn({
      cfg: ctx.cfg,
      issueNumber: ctx.issueNumber,
      deps: ctx.deps?.epicChildren,
    });
    if (result.ok) return { ok: true };
    const reason = (result.blockers || []).join('; ') || 'epic-children-not-refined';
    return { ok: false, reason, blockers: result.blockers || [] };
  },
};
