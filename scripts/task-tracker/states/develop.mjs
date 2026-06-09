// State object: develop (#292).
//
// Develop→test gates (CODE_COMPLETE marker, AC-verification, commit-trail
// containment) currently live inline in `verbs/promote.mjs` and the test
// verb. They migrate into this module's exit list via sub-issue #278.

import { blockedByGuard } from '../lib/blocked-by-guard.mjs';
import { developExitCodeCompleteGuard } from '../lib/develop-exit-code-complete-guard.mjs';
import { developExitCommitTrailHeadGuard } from '../lib/develop-exit-commit-trail-head-guard.mjs';
import { developExitEpicChildrenDoneGuard } from '../lib/develop-epic-children-done-guard.mjs';
import { developExitSandboxProofGuard } from '../lib/develop-exit-sandbox-proof-guard.mjs';
import { contiguityEntryGuard } from '../lib/contiguity-entry-guard.mjs';
import { childCannotLeadEpicExitGuard } from '../lib/child-cannot-lead-epic-exit-guard.mjs';

export default Object.freeze({
  name: 'develop',
  entryGuards: Object.freeze([contiguityEntryGuard]),
  exitGuards: Object.freeze([
    blockedByGuard,
    developExitCodeCompleteGuard,
    developExitSandboxProofGuard,
    developExitCommitTrailHeadGuard,
    developExitEpicChildrenDoneGuard,
    childCannotLeadEpicExitGuard,
  ]),
  onEnter: Object.freeze([]),
});
