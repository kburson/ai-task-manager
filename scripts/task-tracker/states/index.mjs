// State-object index (#292, parent epic #259).
//
// Each kanban state owns a raw `{ id, entryGuards, residentActions,
// exitGuards }` definition. This index builds the immutable machine once and
// projects the legacy `STATES` and `FORWARD_CHAIN` surfaces from it. Backward
// movement remains owned by the lifecycle policy package.
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
//     id: string,                    // unique within its residentActions list
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
// Deep work vs. resident actions
// ─────────────────────────────────────────────────────────────────────
//
// `residentActions` is NOT for the deep work of a state. Refining the issue body,
// writing code, running tests, reviewing changes — all of that is performed
// by `/task <verb>` sessions inhabiting the state. The verb commands are
// inhabitants of states, not parts of the state object.

import * as lifecyclePolicy from '../lib/lifecycle-policy/index.mjs';
import { createStateMachine } from '../lib/state-factory.mjs';

import backlog from './backlog.mjs';
import refine from './refine.mjs';
import readyForPlan from './ready-for-plan.mjs';
import plan from './plan.mjs';
import develop from './develop.mjs';
import test from './test.mjs';
import review from './review.mjs';
import done from './done.mjs';

export const STATE_MACHINE = createStateMachine({
  definitions: [backlog, refine, readyForPlan, plan, develop, test, review, done],
  policy: lifecyclePolicy,
});

const LEGACY_ON_ENTER = Object.freeze([]);

export const STATES = Object.freeze(
  Object.fromEntries(
    STATE_MACHINE.order.map((id) => {
      const definition = STATE_MACHINE.get(id);
      return [
        id,
        Object.freeze({
          name: id,
          entryGuards: definition.entryGuards,
          exitGuards: definition.exitGuards,
          onEnter: LEGACY_ON_ENTER,
        }),
      ];
    })
  )
);

// Canonical forward-walk table consumed by `/task promote`.
// Derived from lifecycle policy so the validator and direction picker cannot
// drift.
export const FORWARD_CHAIN = Object.freeze(
  Object.fromEntries(
    STATE_MACHINE.order.flatMap((state) => {
      const target = STATE_MACHINE.next(state);
      return target == null ? [] : [[state, target]];
    })
  )
);

const KNOWN = new Set(STATE_MACHINE.order);

export function getState(name) {
  if (!KNOWN.has(name)) {
    throw new Error(`getState: unknown state "${name}" (expected one of ${[...KNOWN].join(', ')})`);
  }
  return STATES[name];
}

// Exposed for tests.
export const __STATE_NAMES = [...STATE_MACHINE.order];
