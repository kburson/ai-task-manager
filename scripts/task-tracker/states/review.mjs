// State object: review (#292).
//
// Review→done close-gates (lifecycle DoD ticked, dirty-workspace block,
// parent-admission / children-closed) currently live in `verbs/close.mjs`
// and `close-gate.mjs`. They migrate into this module's exit list via
// sub-issue #279.

import { blockedByGuard } from '../lib/blocked-by-guard.mjs';

export default Object.freeze({
  name: 'review',
  entryGuards: Object.freeze([]),
  exitGuards: Object.freeze([blockedByGuard]),
  onEnter: Object.freeze([]),
});
