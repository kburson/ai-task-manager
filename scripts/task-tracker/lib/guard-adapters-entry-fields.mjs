// Guard-registry adapters for refinement entry/completion fields (#276,
// parent epic #259). Canonical Refine completion advances to R4P.
//
// These adapters present existing gate-library functions as
// `{ id, run(ctx) }` guards so the guard-registry (`./guard-registry.mjs`)
// can drive them. No gate logic is duplicated or rewritten — each adapter
// is a thin wrapper that:
//
//   1. Calls the underlying gate with `cfg`, `issueNumber`, `body`, `deps`
//      pulled from `ctx`.
//   2. Translates the gate's `{ ok: false, blockers: string[] }` shape into
//      the registry's `{ ok: false, reason: string }` shape per AC #276:
//      "one guard refusal per gate, preserving original messages" via
//      `blockers.join('; ')`.
//   3. On the `plan-entry-fields-body` adapter, returns the resolved `plan` as
//      derived data. The registry temporarily mirrors it to
//      `ctx.refinementPlan` for the legacy refine post-success hook.
//
// Note on `plan-entry-fields-children-cleared`: the #276 body lists this as
// a refine.exit guard wrapping "the epic-children recursion." In the
// CURRENT codebase, `planEpicDevelopChildrenGate` fires at plan→develop
// (not refine→plan), and `gateRefineToPlan` does NOT recurse into
// children. Registering a children-cleared guard at refine.exit would be a
// behavior CHANGE, violating this epic's "no behavior regression"
// invariant. To preserve parity, this adapter is NOT registered at
// refine.exit. The plan→develop epic-children check stays inline at
// promote.mjs until #277 migrates plan→develop entry gates into the
// registry as `plan.exit` guards. The body of #276 will carry a deviation
// note documenting this.

import { planPriorityGate, planRefinementEstimate } from './apply-refinement-estimate.mjs';
import { gateRefineToPlan } from './refine-to-plan-gate.mjs';

function joinBlockers(blockers) {
  if (!Array.isArray(blockers) || blockers.length === 0) return '(no reason given)';
  return blockers.join('; ');
}

// Historical Priority adapter retained for compatibility consumers.
export const refineEntryFieldsPriority = {
  id: 'refine-entry-fields-priority',
  async run(ctx) {
    if (!ctx || !ctx.cfg || ctx.issueNumber == null) {
      return {
        ok: false,
        reason: 'refine-entry-fields-priority: missing ctx.cfg / ctx.issueNumber',
      };
    }
    const deps = ctx.deps?.refinementEstimate || ctx.deps?.groomEstimate;
    const r = await planPriorityGate({
      cfg: ctx.cfg,
      issueNumber: ctx.issueNumber,
      deps,
    });
    if (r.ok) return { ok: true };
    return { ok: false, reason: joinBlockers(r.blockers), blockers: r.blockers || [] };
  },
};

// refine.exit #1 — Size / Estimate / Priority / AC items / rationale before R4P.
// On success, returns the resolved `plan` as derived data. The registry owns
// the temporary legacy context mirror.
export const planEntryFieldsBody = {
  id: 'plan-entry-fields-body',
  async run(ctx) {
    if (!ctx || !ctx.cfg || ctx.issueNumber == null) {
      return { ok: false, reason: 'plan-entry-fields-body: missing ctx.cfg / ctx.issueNumber' };
    }
    const deps = ctx.deps?.refinementEstimate || ctx.deps?.groomEstimate;
    const r = await planRefinementEstimate({
      cfg: ctx.cfg,
      issueNumber: ctx.issueNumber,
      body: ctx.body,
      deps,
    });
    if (r.ok) {
      return { ok: true, derived: { refinementPlan: r.plan } };
    }
    return { ok: false, reason: joinBlockers(r.blockers), blockers: r.blockers || [] };
  },
};

// refine.exit #2 — Rank / Labels / Start time on the board, plus
// AC-command lint.
export const planEntryFieldsBoard = {
  id: 'plan-entry-fields-board',
  async run(ctx) {
    if (!ctx || !ctx.cfg || ctx.issueNumber == null) {
      return { ok: false, reason: 'plan-entry-fields-board: missing ctx.cfg / ctx.issueNumber' };
    }
    const deps = ctx.deps?.refineToPlanGateDeps;
    const gateFn = ctx.deps?.refineToPlanGate || gateRefineToPlan;
    const r = await gateFn({
      cfg: ctx.cfg,
      issueNumber: ctx.issueNumber,
      deps,
    });
    if (r.ok) return { ok: true };
    return { ok: false, reason: joinBlockers(r.blockers), blockers: r.blockers || [] };
  },
};

// Exposed for #277 to compose against once plan→develop entry gates move
// into the registry. Not registered by guard-bootstrap today.
export const ENTRY_FIELD_GUARDS = {
  backlogExit: [refineEntryFieldsPriority],
  refineExit: [planEntryFieldsBody, planEntryFieldsBoard],
};
