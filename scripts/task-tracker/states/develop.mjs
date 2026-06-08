// State object: develop (#292).
//
// Develop→test gates (CODE_COMPLETE marker, AC-verification, commit-trail
// containment) currently live inline in `verbs/promote.mjs` and the test
// verb. They migrate into this module's exit list via sub-issue #278.

import { blockedByGuard } from '../lib/blocked-by-guard.mjs';
import { developExitCodeCompleteGuard } from '../lib/develop-exit-code-complete-guard.mjs';
import { developExitCommitTrailHeadGuard } from '../lib/develop-exit-commit-trail-head-guard.mjs';

export default Object.freeze({
  name: 'develop',
  entryGuards: Object.freeze([]),
  exitGuards: Object.freeze([
    blockedByGuard,
    developExitCodeCompleteGuard,
    developExitCommitTrailHeadGuard,
  ]),
  onEnter: Object.freeze([]),
});
