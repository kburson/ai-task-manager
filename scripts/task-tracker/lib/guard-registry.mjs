// State-keyed exit/entry guard registry (#262, parent epic #259).
//
// Skeleton-only. No callers yet. Later children in the #259 epic will:
//   - register existing guards (assignee, activity, deep-dive-marker, ...)
//     into the appropriate slots via `registerGuard`, and
//   - call `runGuards(from, to, ctx)` from the state-mutator and `promote.mjs`.
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

const STATES = ['backlog', 'refine', 'plan', 'develop', 'test', 'review', 'done'];
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
    if (result && result.ok === true) return { ok: true };
    if (result && result.ok === false) {
      // #336 — adapters may include a `blockers: string[]` alongside `reason`
      // so verb-layer callers (promote.mjs) can preserve the array shape that
      // legacy structured-status tests pin (e.g. `r.blockers.length >= 2`).
      // Reason remains the canonical single-string surface.
      const out = { ok: false, reason: result.reason ?? '(no reason given)' };
      if (Array.isArray(result.blockers)) out.blockers = result.blockers;
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
  const fromSlot = GUARDS[fromState];
  const toSlot = GUARDS[toState];

  // Unknown states are *not* fatal here — runGuards is called from already-
  // validated state transitions. If a caller passes an unknown state we treat
  // it as "no guards" rather than throwing, so transition logging stays clean.
  if (fromSlot) {
    for (const g of fromSlot.exit) {
      const r = await invoke(g, ctx);
      if (!r.ok) {
        const entry = { id: g.id, reason: r.reason };
        if (r.blockers) entry.blockers = r.blockers;
        refusals.push(entry);
      }
    }
  }
  if (toSlot) {
    for (const g of toSlot.entry) {
      const r = await invoke(g, ctx);
      if (!r.ok) {
        const entry = { id: g.id, reason: r.reason };
        if (r.blockers) entry.blockers = r.blockers;
        refusals.push(entry);
      }
    }
  }

  return refusals.length === 0 ? { ok: true, refusals: [] } : { ok: false, refusals };
}

// Exposed for tests; not part of the public registration API.
export const __STATES = STATES;
export const __KINDS = KINDS;
