// State object: develop (#292).
//
// Develop→test gates (CODE_COMPLETE marker, AC-verification, commit-trail
// containment) currently live inline in `verbs/promote.mjs` and the test
// verb. They migrate into this module's exit list via sub-issue #278.

import { blockedByGuard } from '../lib/blocked-by-guard.mjs';

export default Object.freeze({
  name: 'develop',
  entryGuards: Object.freeze([]),
  exitGuards: Object.freeze([blockedByGuard]),
  onEnter: Object.freeze([]),
});
