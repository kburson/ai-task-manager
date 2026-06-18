// State object: on-deck (#433).
//
// On Deck is an inert, gateless waiting room between Backlog and Refine — a
// positional tranche filter whose issue content is identical to Backlog.
// Entering On Deck from Backlog has no field gate. The long-standing
// refine-entry Priority gate, and the child/parent contiguity floors that
// previously fired on backlog-exit, relocate here so they now guard entry
// into Refine (on-deck → refine), keeping the gate semantics unchanged while
// the new state stays free to enter.

import { blockedByGuard } from '../lib/blocked-by-guard.mjs';
import { refineEntryFieldsPriority } from '../lib/guard-adapters-entry-fields.mjs';
import { backlogExitChildParentStateGuard } from '../lib/backlog-exit-child-parent-state-guard.mjs';
import { contiguityEntryGuard } from '../lib/contiguity-entry-guard.mjs';
import { childCannotLeadEpicExitGuard } from '../lib/child-cannot-lead-epic-exit-guard.mjs';
import { userStoryWarnGuard } from '../lib/user-story-guard.mjs';

export default Object.freeze({
  name: 'on-deck',
  entryGuards: Object.freeze([contiguityEntryGuard]),
  exitGuards: Object.freeze([
    blockedByGuard,
    refineEntryFieldsPriority,
    backlogExitChildParentStateGuard,
    childCannotLeadEpicExitGuard,
    // #432 — warn (non-blocking) if ## User Story is missing or still a placeholder.
    userStoryWarnGuard,
  ]),
  onEnter: Object.freeze([]),
});
