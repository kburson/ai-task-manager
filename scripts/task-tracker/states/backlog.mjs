// State object: backlog (#292).
//
// Backlog is the entry state for every new issue. Its only successor is the
// gateless Assigned waiting room (#433) — Backlog → Assigned carries no field
// gate. The refine-entry Priority gate and the child/parent contiguity floors
// that formerly fired on backlog-exit have relocated to `states/assigned.mjs`,
// so they now guard the Assigned → Refine boundary. Backlog keeps only the
// universally-applicable blocked-by guard on exit.

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
