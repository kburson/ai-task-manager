// State object: review (#292).
//
// Review→done close-gates migrated here via #279:
//   - reviewExitReviewApprovedGuard wraps the `aitm-review-approved` marker
//     regex that used to live inline at verbs/close.mjs:164.
//   - reviewExitCloseGatesGuard wraps `runCloseGates` (chain-integrity +
//     commits-on-trunk + issue-dirty + marker-present) that used to live
//     inline at verbs/close.mjs:284.
//   - Parent-admission (may this issue lead its own epic?) is covered by the
//     cross-cutting childCannotLeadEpicExitGuard (registered on all forward
//     states via #356). That guard inspects the issue's PARENT, not its
//     children — it is not a children-closed check.
//   - Children-closed (may this epic close while a sub-issue is open?) is
//     reviewExitEpicChildrenDoneGuard (#877). It is ordered ahead of
//     reviewExitCloseGatesGuard so the cheap structural refusal surfaces
//     before the expensive trunk/commit checks.

import { blockedByGuard } from '../lib/blocked-by-guard.mjs';
import { contiguityEntryGuard } from '../lib/contiguity-entry-guard.mjs';
import { childCannotLeadEpicExitGuard } from '../lib/child-cannot-lead-epic-exit-guard.mjs';
import { bodyGatesEntryGuardReview } from '../lib/body-gates-entry-guard.mjs';
import { reviewExitReviewApprovedGuard } from '../lib/review-exit-review-approved-guard.mjs';
import { reviewExitCloseGatesGuard } from '../lib/review-exit-close-gates-guard.mjs';
import { reviewExitEpicChildrenDoneGuard } from '../lib/review-exit-epic-children-done-guard.mjs';

export default Object.freeze({
  name: 'review',
  entryGuards: Object.freeze([contiguityEntryGuard, bodyGatesEntryGuardReview]),
  exitGuards: Object.freeze([
    blockedByGuard,
    reviewExitReviewApprovedGuard,
    reviewExitEpicChildrenDoneGuard,
    reviewExitCloseGatesGuard,
    childCannotLeadEpicExitGuard,
  ]),
  onEnter: Object.freeze([]),
});
