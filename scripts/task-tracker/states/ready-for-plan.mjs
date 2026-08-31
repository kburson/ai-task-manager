// State object: Ready for Planning (#1211; the second slot was introduced in #433).
//
// Ready for Planning is the durable parking state between active Refine work
// and short-lived JIT Plan. Refinement-completion guards remain on Refine;
// admission controls that constrain entry to Plan live here.

import { blockedByGuard } from '../lib/blocked-by-guard.mjs';
import { contiguityEntryGuard } from '../lib/contiguity-entry-guard.mjs';
import { refineExitWipBudgetGuard } from '../lib/refine-exit-wip-budget-guard.mjs';
import { refineExitChildParentStateGuard } from '../lib/refine-exit-child-parent-state-guard.mjs';
import { childCannotLeadEpicExitGuard } from '../lib/child-cannot-lead-epic-exit-guard.mjs';
import { r4pEpicChildrenGuard } from '../lib/plan-epic-children-guard.mjs';

export default Object.freeze({
  id: 'ready-for-plan',
  entryGuards: Object.freeze([contiguityEntryGuard]),
  residentActions: Object.freeze([]),
  exitGuards: Object.freeze([
    blockedByGuard,
    r4pEpicChildrenGuard,
    refineExitWipBudgetGuard,
    refineExitChildParentStateGuard,
    childCannotLeadEpicExitGuard,
  ]),
});
