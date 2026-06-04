// Universal blocked-by-not-done exit-guard (#286, parent epic #280).
//
// Registers at every exit slot in the guard-registry (backlog, refine, plan,
// develop, test, review — done has no exit slot). When invoked, the guard:
//
//   1. Reads the active issue's body for the `aitm-blocked-by` marker.
//   2. Looks up each blocker's kanban state via `ctx.fetchBlockerState(n)`.
//   3. Refuses the transition if ANY blocker is not in `done`.
//
// The guard does NOT itself enforce the refusal — it returns
// `{ ok: false, reason }` and the state-mover lifts that into the existing
// `BLOCKED:` stderr-line aggregation. This keeps the registry pure-data and
// reuses the existing refusal format.
//
// Contract:
//
//   ctx = {
//     issueNumber: number,     // the active issue (the one trying to exit)
//     repo: string,            // <owner>/<name>
//     body: string,            // active issue body (may be empty)
//     fetchBlockerState: async (blockerNumber) =>
//       'backlog'|'refine'|'plan'|'develop'|'test'|'review'|'done'|null,
//     // ^ null when the blocker has no project-status / cannot be resolved.
//   }
//
//   guard.run(ctx) → { ok: true } | { ok: false, reason: string }
//
// Refusal `reason` shape:
//   `cannot exit because blockers are open: #M (refine), #P (test)`
// (issue number + current state are prefixed by the state-mover when it
// formats the final `BLOCKED:` line — see scripts/gh/move-state.mjs.)

import { parseBlockedBy } from './blocked-marker.mjs';

export const GUARD_ID = 'blocked-by-not-done';

// States that count as "open" (i.e. NOT done) for guard purposes.
// Anything other than `done` blocks. Unknown/null state also blocks — we
// refuse rather than silently let through a blocker we couldn't classify.
function isOpen(state) {
  if (state == null) return true;
  return String(state).toLowerCase() !== 'done';
}

function formatRefusal(openBlockers) {
  const parts = openBlockers.map(({ ref, state }) => `#${ref} (${state ?? 'unknown'})`);
  return `cannot exit because blockers are open: ${parts.join(', ')}`;
}

export const blockedByGuard = {
  id: GUARD_ID,
  async run(ctx) {
    if (!ctx || typeof ctx !== 'object') {
      return { ok: false, reason: `${GUARD_ID}: missing ctx` };
    }
    const { body = '', fetchBlockerState } = ctx;
    if (typeof fetchBlockerState !== 'function') {
      // No way to resolve blocker states — fail open (no refusal) rather than
      // hard-block every transition when callers haven't wired the lookup yet.
      return { ok: true };
    }
    const refs = parseBlockedBy(body);
    if (refs.length === 0) return { ok: true };

    const openBlockers = [];
    for (const ref of refs) {
      let state = null;
      try {
        state = await fetchBlockerState(ref);
      } catch {
        state = null;
      }
      if (isOpen(state)) openBlockers.push({ ref, state });
    }
    if (openBlockers.length === 0) return { ok: true };
    return { ok: false, reason: formatRefusal(openBlockers) };
  },
};
