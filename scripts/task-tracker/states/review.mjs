// State object: review (#292).
//
// Review→done close-gates migrated here via #279:
//   - reviewExitReviewApprovedGuard wraps the `aitm-review-approved` marker
//     regex that used to live inline at verbs/close.mjs:164.
//   - reviewExitCloseGatesGuard wraps `runCloseGates` (chain-integrity +
//     commits-on-trunk + issue-dirty + marker-present) that used to live
//     inline at verbs/close.mjs:284.
//   - Parent-admission / children-closed is covered by the cross-cutting
//     childCannotLeadEpicExitGuard (registered on all forward states via
//     #356); no review-exit-specific clone needed.

import { blockedByGuard } from '../lib/blocked-by-guard.mjs';
import { contiguityEntryGuard } from '../lib/contiguity-entry-guard.mjs';
import { childCannotLeadEpicExitGuard } from '../lib/child-cannot-lead-epic-exit-guard.mjs';
import { bodyGatesEntryGuardReview } from '../lib/body-gates-entry-guard.mjs';
import { reviewExitReviewApprovedGuard } from '../lib/review-exit-review-approved-guard.mjs';
import { reviewExitCloseGatesGuard } from '../lib/review-exit-close-gates-guard.mjs';

export default Object.freeze({
  name: 'review',
  entryGuards: Object.freeze([contiguityEntryGuard, bodyGatesEntryGuardReview]),
  exitGuards: Object.freeze([
    blockedByGuard,
    reviewExitReviewApprovedGuard,
    reviewExitCloseGatesGuard,
    childCannotLeadEpicExitGuard,
  ]),
  onEnter: Object.freeze([]),
});
