// State object: plan (#292).
//
// Plan-stage exit-guards consolidated here via #277 (plan → develop). The
// human-approval marker check and the epic-children admission check used to
// live inline at `scripts/gh/move-state.mjs:423-486` and
// `scripts/task-tracker/verbs/promote.mjs:367`; both have been collapsed into
// `runGuards('plan', 'develop', ctx)` (already called at move-state.mjs:394).
//
// Remaining inline gates not yet migrated:
//   - planPlannedEstimateGate (refine-estimate comment appendix; needs comment-
//     listing deps that ctx doesn't carry today).
//   - planDeepDiveGate (deep-dive marker / heading / posted trio; deep-dive
//     half stays inline at move-state.mjs:434+ until a dedicated child story).
//   - #279 parent-admission gate (review → done).

import { blockedByGuard } from '../lib/blocked-by-guard.mjs';
import { planApprovedGuard } from '../lib/plan-approved-guard.mjs';
import { planEpicChildrenGuard } from '../lib/plan-epic-children-guard.mjs';
import { planExitPlannedEstimateGuard } from '../lib/plan-exit-planned-estimate-guard.mjs';
import { planExitDeepDiveGuard } from '../lib/plan-exit-deep-dive-guard.mjs';
import { planExitPlanMetadataGuard } from '../lib/plan-exit-plan-metadata-guard.mjs';
import { planExitVcPresenceGuard } from '../lib/plan-exit-vc-presence-guard.mjs';
import { decompositionPlanExitGuard } from '../lib/decomposition-plan-exit-guard.mjs';
import { contiguityEntryGuard } from '../lib/contiguity-entry-guard.mjs';
import { childCannotLeadEpicExitGuard } from '../lib/child-cannot-lead-epic-exit-guard.mjs';
import { planExitOwnershipGuard } from '../lib/plan-exit-ownership-guard.mjs';

export default Object.freeze({
  name: 'plan',
  entryGuards: Object.freeze([contiguityEntryGuard]),
  exitGuards: Object.freeze([
    blockedByGuard,
    planApprovedGuard,
    planExitPlannedEstimateGuard,
    planExitDeepDiveGuard,
    planExitPlanMetadataGuard,
    planExitVcPresenceGuard,
    planExitOwnershipGuard,
    decompositionPlanExitGuard,
    planEpicChildrenGuard,
    childCannotLeadEpicExitGuard,
  ]),
  onEnter: Object.freeze([]),
});
