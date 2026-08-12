// Guard registration bootstrap — DEPRECATION SHIM (#292).
//
// Original (#286, parent epic #280) responsibility: register the universal
// `blocked-by-not-done` exit guard plus the #276 entry-field adapters into
// the flat guard-registry as a side-effect on import.
//
// Replaced by `state-bootstrap.mjs` (#292): each kanban state now owns its
// own `{ entryGuards, exitGuards, onEnter }` container in
// `scripts/task-tracker/states/*.mjs`, and `state-bootstrap` walks those
// containers to populate the flat registry. This file is preserved as a
// re-export shim so existing callers (central state-mover side-effect
// import, parity tests, future external integrations) keep working
// unchanged. Remove this shim only after every importer has been migrated
// to `state-bootstrap.mjs` directly.

import './state-bootstrap.mjs';
export { bootstrapGuards } from './state-bootstrap.mjs';

// All board states that have an `exit` transition (`done` is terminal).
// Re-exported for back-compat with callers that iterated the list
// directly to mirror the old registration loop.
export const EXIT_STATES = [
  'backlog',
  'refine',
  'ready-for-plan',
  'plan',
  'develop',
  'test',
  'review',
];
