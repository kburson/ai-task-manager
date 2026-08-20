// State object: refine (#292).
//
// Refine is the issue-shaping state: scope, ACs, plan metadata, board
// fields (Rank, Labels, Start time). Exit-gates enforce the
// R4P-entry contract via the #276 body + board adapters.

import { planEntryFieldsBody, planEntryFieldsBoard } from '../lib/guard-adapters-entry-fields.mjs';
import { contiguityEntryGuard } from '../lib/contiguity-entry-guard.mjs';
import { refineExitCompleteMarkerGuard } from '../lib/refine-exit-complete-marker-guard.mjs';
import { refineExitStubPlaceholderGuard } from '../lib/refine-exit-stub-placeholder-guard.mjs';
import { userStoryBlockGuard } from '../lib/user-story-guard.mjs';
import { userStoryWarnGuard } from '../lib/user-story-guard.mjs';
import { backlogExitChildParentStateGuard } from '../lib/backlog-exit-child-parent-state-guard.mjs';
import { refinementSnapshotGuard } from '../lib/refinement-snapshot-guard.mjs';

export default Object.freeze({
  name: 'refine',
  entryGuards: Object.freeze([
    contiguityEntryGuard,
    backlogExitChildParentStateGuard,
    userStoryWarnGuard,
  ]),
  exitGuards: Object.freeze([
    // #357 — the `aitm-refine-complete` marker is the user's "refine is done"
    // signal; check it FIRST so the absence surfaces before downstream gates
    // (matches the original inline pre-flight ordering at promote.mjs L270-285).
    refineExitCompleteMarkerGuard,
    // #450 — stub TBD placeholders must be replaced before advancing to plan.
    refineExitStubPlaceholderGuard,
    refinementSnapshotGuard,
    planEntryFieldsBody,
    planEntryFieldsBoard,
    // #432 — hard-refuse if ## User Story is missing or still a placeholder.
    userStoryBlockGuard,
  ]),
  onEnter: Object.freeze([]),
});
