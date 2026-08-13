// State object: backlog (#292).
//
// Backlog is the entry state for every new issue. Its successor is Refine;
// assignment is ownership metadata rather than a lifecycle column. Backlog
// keeps the universal blocked-by/discussion gates on exit, while Refine entry
// owns the child/parent contiguity floor.

import { blockedByGuard } from '../lib/blocked-by-guard.mjs';
import { contiguityEntryGuard } from '../lib/contiguity-entry-guard.mjs';
import { discussBlockGuard } from '../lib/discuss-block-guard.mjs';

export default Object.freeze({
  name: 'backlog',
  entryGuards: Object.freeze([contiguityEntryGuard]),
  // #473 — an unresolved `{discuss}` directive hard-blocks the first forward
  // promotion out of Backlog, regardless of TT_FULL_AUTO.
  exitGuards: Object.freeze([blockedByGuard, discussBlockGuard]),
  onEnter: Object.freeze([]),
});
