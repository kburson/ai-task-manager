// State object: refine (#292).
//
// Refine is the issue-shaping state: scope, ACs, plan metadata, board
// fields (Sequence, Labels, Start time). Exit-gates enforce the
// plan-entry contract via the #276 body + board adapters.

import { blockedByGuard } from '../lib/blocked-by-guard.mjs';
import { planEntryFieldsBody, planEntryFieldsBoard } from '../lib/guard-adapters-entry-fields.mjs';
import { refineExitWipBudgetGuard } from '../lib/refine-exit-wip-budget-guard.mjs';

export default Object.freeze({
  name: 'refine',
  entryGuards: Object.freeze([]),
  exitGuards: Object.freeze([
    blockedByGuard,
    planEntryFieldsBody,
    planEntryFieldsBoard,
    refineExitWipBudgetGuard,
  ]),
  onEnter: Object.freeze([]),
});
