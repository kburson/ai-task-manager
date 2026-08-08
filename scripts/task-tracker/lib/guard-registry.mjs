// State-keyed exit/entry guard registry (#262, parent epic #259).
//
// FULLY WIRED — fires on every state transition. Do NOT read this registry as
// inert or bypass it. The #259 epic completed the inline-gate → registry
// migration (closed at #360); the flow is:
//
//   state-bootstrap.mjs  — registers every guard into its state slot via
//                          `registerGuard`, walking the per-state container
//                          modules in `scripts/task-tracker/states/` (#292).
//                          `guard-bootstrap.mjs` is a deprecation shim that
//                          re-exports `bootstrapGuards` from here.
//   runGuards(from,to,ctx) — executed at EVERY transition by the callers below,
//                          iterating `GUARDS[from].exit` then `GUARDS[to].entry`.
//
// Call sites that invoke `runGuards` (the enforcement surface): `move-state.mjs`
// (the single state-mutator, line ~345), `promote.mjs`, `close.mjs`, and
// `review.mjs`. There is no transition path that skips the registry.
//
// Contract:
//   guard = { id: string, run(ctx) -> { ok: true } | { ok: false, reason }
//                              | Promise<{ ok, reason? }> }
//
// `run` may be sync OR async — `runGuards` awaits the result either way, so
// guards that shell out to git/gh can coexist with pure-data guards.
//
// runGuards is async. It iterates `GUARDS[fromState].exit` then
// `GUARDS[toState].entry`, awaiting each `run(ctx)`. Refusals are aggregated
// across both lists; there is no short-circuit. A guard that throws is
// treated as a refusal whose `reason` is the stringified error — one buggy
// guard must not crash the whole pipeline.
//
// registerGuard is idempotent on `guard.id`: re-registering the same id is a
// no-op (returns false). Unknown state or unknown kind throw.
//
// Registration policy: this module ships with an EMPTY registry on import.
// Callers (state-mutator, promote.mjs, close-gates) register guards
// explicitly — there is no auto-registration from the registry's side. Tests
// that assert "empty registry" import this module without calling any
// register-side-effect module. Production CLI entry-points import the
// guard-bootstrap module (or call registerGuard themselves) before invoking
// runGuards.
//
// Registered-guard inventory (current as of #360 close, after #259 epic
// completed the inline-gate → registry migration). Source of truth is the
// per-state container modules in `scripts/task-tracker/states/`; this table
// is a maintenance index so a single grep on this file reveals what each
// state enforces. To verify, run:
//   grep -E "^import |entryGuards|exitGuards" scripts/task-tracker/states/*.mjs
//
//   State    | Entry guards                          | Exit guards
//   ---------|---------------------------------------|------------------------------------------------------------
//   backlog  | contiguity                            | blocked-by, refine-entry-fields-priority,
//            |                                       | backlog-exit-child-parent-state, child-cannot-lead-epic
//   on-deck  | contiguity                            | blocked-by, refine-entry-fields-priority,
//            |                                       | backlog-exit-child-parent-state, child-cannot-lead-epic,
//            |                                       | user-story-warn (non-blocking)
//   refine   | contiguity                            | refine-exit-complete-marker, refine-exit-stub-placeholder,
//            |                                       | blocked-by, plan-entry-fields (body + board adapters),
//            |                                       | refine-exit-wip-budget, refine-exit-child-parent-state,
//            |                                       | child-cannot-lead-epic, user-story-block
//   plan     | contiguity                            | blocked-by, plan-approved, plan-epic-children,
//            |                                       | plan-exit-planned-estimate, plan-exit-deep-dive,
//            |                                       | plan-exit-plan-metadata, child-cannot-lead-epic
//   develop  | contiguity                            | blocked-by, develop-exit-code-complete,
//            |                                       | develop-exit-sandbox-proof,
//            |                                       | develop-exit-commit-trail-head,
//            |                                       | develop-epic-children-done (children at review+),
//            |                                       | child-cannot-lead-epic
//   test     | contiguity, body-gates                | blocked-by, test-exit-dod-verified,
//            |                                       | test-exit-pre-close-completeness, child-cannot-lead-epic
//   review   | contiguity, body-gates                | blocked-by, review-exit-review-approved,
//            |                                       | review-exit-epic-children-done (children at done),
//            |                                       | review-exit-close-gates, child-cannot-lead-epic
//   done     | body-gates                            | (none — terminal state)
//
// `contiguity`, `child-cannot-lead-epic`, `body-gates`, `refine-exit-complete`
// (the `refine-complete` marker exit gate) and the structural body gates are
// the four cross-cutting families exercised by every transition path. New
// guards belong here too — register them in the matching state module and
// append a row above.

import { stateIds } from './lifecycle-policy/index.mjs';

const STATES = stateIds();
const KINDS = ['exit', 'entry'];

function makeEmptyRegistry() {
  const out = {};
  for (const s of STATES) {
    out[s] = { exit: [], entry: [] };
  }
  return out;
}

export const GUARDS = makeEmptyRegistry();

export function registerGuard(state, kind, guard) {
  if (!Object.prototype.hasOwnProperty.call(GUARDS, state)) {
    throw new Error(
      `registerGuard: unknown state "${state}" (expected one of ${STATES.join(', ')})`
    );
  }
  if (!KINDS.includes(kind)) {
    throw new Error(`registerGuard: unknown kind "${kind}" (expected one of ${KINDS.join(', ')})`);
  }
  if (!guard || typeof guard.id !== 'string' || typeof guard.run !== 'function') {
    throw new Error('registerGuard: guard must be { id: string, run(ctx) -> { ok, reason? } }');
  }
  const slot = GUARDS[state][kind];
  if (slot.some((g) => g.id === guard.id)) {
    return false; // idempotent no-op
  }
  slot.push(guard);
  return true;
}

// Guards may be sync OR return a Promise. invoke awaits either uniformly so a
// guard that shells out to git/gh can be registered alongside pure-data
// guards without callers needing to know which is which.
async function invoke(guard, ctx) {
  try {
    const result = await guard.run(ctx);
    if (result && result.ok === true) {
      // #359 — guards may attach a non-refusing `warn` payload (e.g. the
      // lifecycle warn-only path on done-entry when
      // lifecycleCheckboxesRequired=false). The host can read it from
      // `guardResult.warns` and emit a side effect (timing row, log line,
      // etc.) without the guard itself doing I/O.
      const out = { ok: true };
      if (result.warn != null) out.warn = result.warn;
      return out;
    }
    if (result && result.ok === false) {
      // #336 — adapters may include a `blockers: string[]` alongside `reason`
      // so verb-layer callers (promote.mjs) can preserve the array shape that
      // legacy structured-status tests pin (e.g. `r.blockers.length >= 2`).
      // Reason remains the canonical single-string surface.
      const out = { ok: false, reason: result.reason ?? '(no reason given)' };
      if (Array.isArray(result.blockers)) out.blockers = result.blockers;
      if (result.warn != null) out.warn = result.warn;
      return out;
    }
    return {
      ok: false,
      reason: `guard "${guard.id}" returned malformed result: ${JSON.stringify(result)}`,
    };
  } catch (err) {
    return { ok: false, reason: `guard "${guard.id}" threw: ${err?.message ?? String(err)}` };
  }
}

export async function runGuards(fromState, toState, ctx) {
  const refusals = [];
  const warns = [];
  const fromSlot = GUARDS[fromState];
  const toSlot = GUARDS[toState];

  function consume(g, r) {
    if (!r.ok) {
      const entry = { id: g.id, reason: r.reason };
      if (r.blockers) entry.blockers = r.blockers;
      refusals.push(entry);
    }
    if (r.warn != null) warns.push({ id: g.id, warn: r.warn });
  }

  // Unknown states are *not* fatal here — runGuards is called from already-
  // validated state transitions. If a caller passes an unknown state we treat
  // it as "no guards" rather than throwing, so transition logging stays clean.
  if (fromSlot) {
    for (const g of fromSlot.exit) {
      consume(g, await invoke(g, ctx));
    }
  }
  if (toSlot) {
    for (const g of toSlot.entry) {
      consume(g, await invoke(g, ctx));
    }
  }

  if (refusals.length === 0) {
    const out = { ok: true, refusals: [] };
    if (warns.length > 0) out.warns = warns;
    return out;
  }
  const out = { ok: false, refusals };
  if (warns.length > 0) out.warns = warns;
  return out;
}

// Exposed for tests; not part of the public registration API.
export const __STATES = STATES;
export const __KINDS = KINDS;
