// State object: refine (#292).
//
// Refine is the issue-shaping state: scope, ACs, plan metadata, board
// fields (Rank, Labels, Start time). Exit-gates enforce the
// plan-entry contract via the #276 body + board adapters.

import { blockedByGuard } from '../lib/blocked-by-guard.mjs';
import { planEntryFieldsBody, planEntryFieldsBoard } from '../lib/guard-adapters-entry-fields.mjs';
import { refineExitWipBudgetGuard } from '../lib/refine-exit-wip-budget-guard.mjs';
import { refineExitChildParentStateGuard } from '../lib/refine-exit-child-parent-state-guard.mjs';
import { contiguityEntryGuard } from '../lib/contiguity-entry-guard.mjs';
import { childCannotLeadEpicExitGuard } from '../lib/child-cannot-lead-epic-exit-guard.mjs';
import { refineExitCompleteMarkerGuard } from '../lib/refine-exit-complete-marker-guard.mjs';
import { refineExitStubPlaceholderGuard } from '../lib/refine-exit-stub-placeholder-guard.mjs';
import { userStoryBlockGuard } from '../lib/user-story-guard.mjs';

export default Object.freeze({
  name: 'refine',
  entryGuards: Object.freeze([contiguityEntryGuard]),
  exitGuards: Object.freeze([
    // #357 — the `aitm-refine-complete` marker is the user's "refine is done"
    // signal; check it FIRST so the absence surfaces before downstream gates
    // (matches the original inline pre-flight ordering at promote.mjs L270-285).
    refineExitCompleteMarkerGuard,
    // #450 — stub TBD placeholders must be replaced before advancing to plan.
    refineExitStubPlaceholderGuard,
    blockedByGuard,
    planEntryFieldsBody,
    planEntryFieldsBoard,
    refineExitWipBudgetGuard,
    refineExitChildParentStateGuard,
    childCannotLeadEpicExitGuard,
    // #432 — hard-refuse if ## User Story is missing or still a placeholder.
    userStoryBlockGuard,
  ]),
  onEnter: Object.freeze([]),
});
