// State object: backlog (#292).
//
// Backlog is the entry state for every new issue. Exit-gates enforce that an
// issue cannot leave Backlog for Refine without the refine-entry Priority
// field set on the board (the #276 entry-field adapter).

import { blockedByGuard } from '../lib/blocked-by-guard.mjs';
import { refineEntryFieldsPriority } from '../lib/guard-adapters-entry-fields.mjs';
import { backlogExitChildParentStateGuard } from '../lib/backlog-exit-child-parent-state-guard.mjs';

export default Object.freeze({
  name: 'backlog',
  entryGuards: Object.freeze([]),
  exitGuards: Object.freeze([
    blockedByGuard,
    refineEntryFieldsPriority,
    backlogExitChildParentStateGuard,
  ]),
  onEnter: Object.freeze([]),
});
