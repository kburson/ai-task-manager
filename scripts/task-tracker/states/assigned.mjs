// State object: assigned (#1206; the second slot was introduced in #433).
//
// Assigned is an inert, gateless waiting room between Backlog and Refine — a
// positional tranche filter whose issue content is identical to Backlog.
// Entering Assigned from Backlog has no field gate. The long-standing
// refine-entry Priority gate, and the child/parent contiguity floors that
// previously fired on backlog-exit, relocate here so they now guard entry
// into Refine (assigned → refine), keeping the gate semantics unchanged while
// the second state stays free to enter.

import { blockedByGuard } from '../lib/blocked-by-guard.mjs';
import { refineEntryFieldsPriority } from '../lib/guard-adapters-entry-fields.mjs';
import { backlogExitChildParentStateGuard } from '../lib/backlog-exit-child-parent-state-guard.mjs';
import { contiguityEntryGuard } from '../lib/contiguity-entry-guard.mjs';
import { childCannotLeadEpicExitGuard } from '../lib/child-cannot-lead-epic-exit-guard.mjs';
import { userStoryWarnGuard } from '../lib/user-story-guard.mjs';
import { discussBlockGuard } from '../lib/discuss-block-guard.mjs';

export default Object.freeze({
  name: 'assigned',
  entryGuards: Object.freeze([contiguityEntryGuard]),
  exitGuards: Object.freeze([
    blockedByGuard,
    refineEntryFieldsPriority,
    backlogExitChildParentStateGuard,
    childCannotLeadEpicExitGuard,
    // #432 — warn (non-blocking) if ## User Story is missing or still a placeholder.
    userStoryWarnGuard,
    // #473 — an unresolved `{discuss}` directive hard-blocks Assigned → Refine,
    // covering issues that start in Assigned. Resolution strips the token, so it
    // fires at most once across the Backlog/Assigned boundary.
    discussBlockGuard,
  ]),
  onEnter: Object.freeze([]),
});
