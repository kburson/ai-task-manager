// State object: refine (#292).
//
// Refine is the issue-shaping state: scope, ACs, plan metadata, board
// fields (Sequence, Labels, Start time). Exit-gates enforce the
// plan-entry contract via the #276 body + board adapters.

import { blockedByGuard } from '../lib/blocked-by-guard.mjs';
import { planEntryFieldsBody, planEntryFieldsBoard } from '../lib/guard-adapters-entry-fields.mjs';
import { refineExitWipBudgetGuard } from '../lib/refine-exit-wip-budget-guard.mjs';
import { refineExitChildParentStateGuard } from '../lib/refine-exit-child-parent-state-guard.mjs';
import { contiguityEntryGuard } from '../lib/contiguity-entry-guard.mjs';
import { childCannotLeadEpicExitGuard } from '../lib/child-cannot-lead-epic-exit-guard.mjs';
import { refineExitCompleteMarkerGuard } from '../lib/refine-exit-complete-marker-guard.mjs';

export default Object.freeze({
  name: 'refine',
  entryGuards: Object.freeze([contiguityEntryGuard]),
  exitGuards: Object.freeze([
    // #357 — the `aitm-refine-complete` marker is the user's "refine is done"
    // signal; check it FIRST so the absence surfaces before downstream gates
    // (matches the original inline pre-flight ordering at promote.mjs L270-285).
    refineExitCompleteMarkerGuard,
    blockedByGuard,
    planEntryFieldsBody,
    planEntryFieldsBoard,
    refineExitWipBudgetGuard,
    refineExitChildParentStateGuard,
    childCannotLeadEpicExitGuard,
  ]),
  onEnter: Object.freeze([]),
});
