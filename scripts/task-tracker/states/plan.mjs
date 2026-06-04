// State object: plan (#292).
//
// Plan-stage entry/exit gates (Planned Estimate appendix, plan-approved
// marker, epic-children-cleared, deep-dive marker) currently live inline in
// `verbs/promote.mjs`. They migrate into this module's entry/exit lists via
// sub-issues #277 (plan→develop) and #279 (review→done parent admission).

import { blockedByGuard } from '../lib/blocked-by-guard.mjs';

export default Object.freeze({
  name: 'plan',
  entryGuards: Object.freeze([]),
  exitGuards: Object.freeze([blockedByGuard]),
  onEnter: Object.freeze([]),
});
