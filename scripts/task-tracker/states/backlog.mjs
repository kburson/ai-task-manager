// State object: backlog (#292).
//
// Backlog is the entry state for every new issue. Its only successor is the
// gateless On Deck waiting room (#433) — Backlog → On Deck carries no field
// gate. The refine-entry Priority gate and the child/parent contiguity floors
// that formerly fired on backlog-exit have relocated to `states/on-deck.mjs`,
// so they now guard the On Deck → Refine boundary. Backlog keeps only the
// universally-applicable blocked-by guard on exit.

import { blockedByGuard } from '../lib/blocked-by-guard.mjs';
import { contiguityEntryGuard } from '../lib/contiguity-entry-guard.mjs';

export default Object.freeze({
  name: 'backlog',
  entryGuards: Object.freeze([contiguityEntryGuard]),
  exitGuards: Object.freeze([blockedByGuard]),
  onEnter: Object.freeze([]),
});
