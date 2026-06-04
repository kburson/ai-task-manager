// State object: test (#292).
//
// Test→review gates (verification-command pass-list, AC-evidence
// completeness, dod-verified marker) currently live in the test verb and
// `verbs/promote.mjs`. They migrate into this module's exit list via
// sub-issue #267, which folds in #257's completeness check and dedupes
// `aitm-dod-verified`.

import { blockedByGuard } from '../lib/blocked-by-guard.mjs';

export default Object.freeze({
  name: 'test',
  entryGuards: Object.freeze([]),
  exitGuards: Object.freeze([blockedByGuard]),
  onEnter: Object.freeze([]),
});
