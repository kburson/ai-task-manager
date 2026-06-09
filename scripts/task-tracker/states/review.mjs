// State object: review (#292).
//
// Review→done close-gates (lifecycle DoD ticked, dirty-workspace block,
// parent-admission / children-closed) currently live in `verbs/close.mjs`
// and `close-gate.mjs`. They migrate into this module's exit list via
// sub-issue #279.

import { blockedByGuard } from '../lib/blocked-by-guard.mjs';
import { contiguityEntryGuard } from '../lib/contiguity-entry-guard.mjs';
import { childCannotLeadEpicExitGuard } from '../lib/child-cannot-lead-epic-exit-guard.mjs';
import { bodyGatesEntryGuardReview } from '../lib/body-gates-entry-guard.mjs';

export default Object.freeze({
  name: 'review',
  entryGuards: Object.freeze([contiguityEntryGuard, bodyGatesEntryGuardReview]),
  exitGuards: Object.freeze([blockedByGuard, childCannotLeadEpicExitGuard]),
  onEnter: Object.freeze([]),
});
