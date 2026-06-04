// State-object → guard-registry bootstrap (#292, parent epic #259).
//
// Replaces the legacy `guard-bootstrap.mjs` "enumerate every guard inline"
// approach. Each kanban state owns its own `{ entryGuards, exitGuards,
// onEnter }` in `scripts/task-tracker/states/*.mjs`. This module walks
// `STATES` once at import and feeds the flat guard-registry from the
// declared lists, so existing `runGuards(from, to, ctx)` callers (the
// central state-mover) continue to operate without change.
//
// Registration is idempotent — `registerGuard` returns `false` when the
// same `guard.id` is already present, so re-importing this module is safe.
//
// `guard-bootstrap.mjs` is preserved as a deprecation shim that re-exports
// `bootstrapGuards` from here; existing imports keep working.

import { registerGuard } from './guard-registry.mjs';
import { STATES } from '../states/index.mjs';

let booted = false;

export function bootstrapGuards() {
  if (booted) return;
  for (const [stateName, stateObj] of Object.entries(STATES)) {
    for (const guard of stateObj.exitGuards) {
      registerGuard(stateName, 'exit', guard);
    }
    for (const guard of stateObj.entryGuards) {
      registerGuard(stateName, 'entry', guard);
    }
  }
  booted = true;
}

// Test affordance — lets the parity-test suite reset and re-boot in
// isolation. Production callers never use this; it is a no-op in normal
// operation because the registry already enforces idempotency.
export function __resetBootstrap() {
  booted = false;
}

// Eager boot on import. Mirrors the legacy guard-bootstrap behavior so a
// single `import` triggers registration.
bootstrapGuards();
