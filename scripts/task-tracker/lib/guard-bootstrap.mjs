// Guard registration bootstrap (#286, parent epic #280).
//
// Imported by production CLI entry-points (state-mover, /task verbs) so that
// the universal exit-guards are present in the registry before any
// `runGuards(...)` call. The registry itself ships empty (per
// guard-registry.mjs docstring) — registration is explicit.
//
// Registration is idempotent: re-importing this module is safe.
// `registerGuard` returns `false` when the same `guard.id` is already present
// in the slot, so duplicate imports do not duplicate work.
//
// Today this module wires the `blocked-by-not-done` guard at every exit slot
// except `done` (which has no exit). Future universal guards register here as
// well — keep the registration list small and obvious.

import { registerGuard } from './guard-registry.mjs';
import { blockedByGuard } from './blocked-by-guard.mjs';

// All board states that have an `exit` transition. `done` is terminal so it
// has no exit slot — registering there would be a no-op but we omit it
// explicitly to keep intent clear.
export const EXIT_STATES = ['backlog', 'refine', 'plan', 'develop', 'test', 'review'];

let booted = false;

export function bootstrapGuards() {
  if (booted) return;
  for (const state of EXIT_STATES) {
    registerGuard(state, 'exit', blockedByGuard);
  }
  booted = true;
}

// Eager boot on import. Callers may also call `bootstrapGuards()` explicitly
// (e.g. tests that need to control timing).
bootstrapGuards();
