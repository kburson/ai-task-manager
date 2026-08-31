// State object: backlog (#292).
//
// Backlog is the entry state for every new issue. Its successor is Refine;
// assignment is ownership metadata rather than a lifecycle column. Backlog
// keeps the discussion gate on exit, while Refine entry owns the child/parent
// contiguity floor. Open blockers first refuse at Ready for Planning -> Plan so
// dependency-ordered work can still be shaped and parked (#1339).

import { contiguityEntryGuard } from '../lib/contiguity-entry-guard.mjs';
import { discussBlockGuard } from '../lib/discuss-block-guard.mjs';

export default Object.freeze({
  id: 'backlog',
  entryGuards: Object.freeze([contiguityEntryGuard]),
  residentActions: Object.freeze([]),
  // #473 — an unresolved `{discuss}` directive hard-blocks the first forward
  // promotion out of Backlog, regardless of TT_FULL_AUTO.
  exitGuards: Object.freeze([discussBlockGuard]),
});
