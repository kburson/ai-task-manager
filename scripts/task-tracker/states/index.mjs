// State-object index (#292, parent epic #259).
//
// Each kanban state owns a module that exports its `{ name, entryGuards,
// exitGuards, onEnter }` container. This index re-exports a `STATES` map
// keyed by state name plus `FORWARD_CHAIN` / `BACKWARD_CHAIN` tables that
// `/task promote` and `/task demote` consume as their only source of
// directional truth.
//
// ─────────────────────────────────────────────────────────────────────
// Contract: Guard
// ─────────────────────────────────────────────────────────────────────
//
//   Guard = {
//     id: string,                    // unique within its slot; idempotency key
//     run(ctx) -> { ok: true }
//              | { ok: false, reason: string }
//              | Promise<{ ok, reason? }>,
//   }
//
// A guard may refuse a transition; refusing returns `{ ok: false, reason }`.
// Guards may shell out (async) or be pure-data (sync) — the registry awaits
// either uniformly. A guard that throws is treated as a refusal whose reason
// is the stringified error. Guards do NOT mutate state on success; the only
// sanctioned side-effect is stashing a value on `ctx` (the body-fields
// adapter side-channels its resolved `refinementPlan` this way).
//
// ─────────────────────────────────────────────────────────────────────
// Contract: Action
// ─────────────────────────────────────────────────────────────────────
//
//   Action = {
//     id: string,                    // unique within its onEnter list
//     run(ctx) -> void | Promise<void>,
//   }
//
// Actions fire AFTER a successful Status write into the target state. They
// are short, idempotent setup hooks (stamp entry timestamp, post pickup
// directive, write timing-log entry row). They never refuse a transition —
// failures are logged and the transition stands. Re-firing an action on a
// subsequent move into the same state must be safe.
//
// ─────────────────────────────────────────────────────────────────────
// Deep work vs. onEnter
// ─────────────────────────────────────────────────────────────────────
//
// `onEnter` is NOT for the deep work of a state. Refining the issue body,
// writing code, running tests, reviewing changes — all of that is performed
// by `/task <verb>` sessions inhabiting the state. The verb commands are
// inhabitants of states, not parts of the state object.

import { FORWARD } from '../state-machine.mjs';

import backlog from './backlog.mjs';
import refine from './refine.mjs';
import plan from './plan.mjs';
import develop from './develop.mjs';
import test from './test.mjs';
import review from './review.mjs';
import done from './done.mjs';

export const STATES = Object.freeze({
  backlog,
  refine,
  plan,
  develop,
  test,
  review,
  done,
});

// Canonical forward-walk table consumed by `/task promote`.
// Mirrors `state-machine.mjs`'s `FORWARD` to avoid drift between the
// validateTransition matrix and the promote direction-picker.
export const FORWARD_CHAIN = Object.freeze({ ...FORWARD });

// Documented backward edges consumed by `/task demote` and (in the future)
// lateral-move callers. Each entry is `state -> target[]`; index-0 is the
// canonical default (what /task demote with no explicit target picks). The
// extra entries beyond index-0 document edges that are architecturally
// supported (the target state's entry guards decide whether to accept from
// a non-canonical direction) but require explicit caller intent — the
// runtime `validateTransition` matrix in `state-machine.mjs` continues to
// gate which edges are walkable today.
//
// Canonical defaults match the existing `BACKWARD` map in
// `state-machine.mjs` (`test → develop`, `review → develop`); additional
// targets (`review → test`, `review → plan`, `done → plan`) are
// non-walkable until a future issue widens `validateTransition`.
export const BACKWARD_CHAIN = Object.freeze({
  test: Object.freeze(['develop']),
  review: Object.freeze(['develop', 'test', 'plan']),
  done: Object.freeze(['plan']),
});

const KNOWN = new Set(Object.keys(STATES));

export function getState(name) {
  if (!KNOWN.has(name)) {
    throw new Error(`getState: unknown state "${name}" (expected one of ${[...KNOWN].join(', ')})`);
  }
  return STATES[name];
}

// Exposed for tests.
export const __STATE_NAMES = [...KNOWN];
