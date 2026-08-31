// State object: test (#292, #267).
//
// Test→review gates live in the exit list and are evaluated by
// `runGuards('test', 'review', ctx)` from both `verbs/promote.mjs` and
// `verbs/review.mjs`. The two former-inline call-sites in those verbs are
// retired by #267 in favor of these registry entries (single source of
// truth, parity across both promote and review paths).

import { blockedByGuard } from '../lib/blocked-by-guard.mjs';
import { testExitDodVerifiedGuard } from '../lib/test-exit-dod-verified-guard.mjs';
import { testExitPreCloseCompletenessGuard } from '../lib/test-exit-pre-close-completeness-guard.mjs';
import { contiguityEntryGuard } from '../lib/contiguity-entry-guard.mjs';
import { childCannotLeadEpicExitGuard } from '../lib/child-cannot-lead-epic-exit-guard.mjs';
import { bodyGatesEntryGuardTest } from '../lib/body-gates-entry-guard.mjs';

export default Object.freeze({
  id: 'test',
  entryGuards: Object.freeze([contiguityEntryGuard, bodyGatesEntryGuardTest]),
  residentActions: Object.freeze([]),
  exitGuards: Object.freeze([
    blockedByGuard,
    testExitDodVerifiedGuard,
    testExitPreCloseCompletenessGuard,
    childCannotLeadEpicExitGuard,
  ]),
});
