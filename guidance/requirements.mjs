// @story #1671

import { listLifecycleActions } from '../scripts/task-tracker/lib/lifecycle-policy/actions.mjs';
import { listRemediations } from '../scripts/task-tracker/lib/action-decision/remediations.mjs';
import { STATE_MACHINE } from '../scripts/task-tracker/states/index.mjs';

export const CATALOG_SCHEMA = 'aitm.guidance-catalog/v1';
export const VALIDATION_SCHEMA = 'aitm.guidance-validation/v1';

export const AGENT_OPERATIONS = Object.freeze([
  'query',
  'require_status',
  'if_blocked',
  'execute',
  'never',
  'execution_revalidates',
  'terminal_state',
  'navigation',
  'recommendation',
]);

export const PROHIBITION_IDS = Object.freeze([
  'bypass_guard',
  'execute_free_text',
  'reuse_stale_decision',
  'invoke_internal_mutator',
]);

// Protocol obligations have no executable action binding. Requiring their
// entries prevents a valid catalog from silently dropping guidance that still
// belongs in the installed agent adapters until the later migration child.
export const REQUIRED_PROTOCOL_GUIDANCE_IDS = Object.freeze([
  'protocol.session',
  'protocol.receipts',
  'protocol.pickup',
  'protocol.commit-trail',
]);

// The retained rule inventory is a closed release input. A recheck cannot
// certify a shortened map merely because the remaining rows are internally
// consistent.
export const REQUIRED_RULE_OBLIGATION_IDS = Object.freeze([
  'session.timer',
  'session.pause',
  'session.preferences',
  'session.compaction',
  'session.track',
  'session.issue-create',
  'session.close-route',
  'session.role',
  'binding.identity',
  'binding.drift',
  'binding.workspace',
  'binding.discussion',
  'binding.deferred-pickup',
  'binding.session-recovery',
  'pickup.deep-dive',
  'pickup.per-ac',
  'pickup.bootstrap',
  'pickup.checkboxes',
  'pickup.epic',
  'pickup.checkpoint',
  'pickup.mistake',
  'pickup.body',
  'pickup.agent-terminal',
  'state.contiguous',
  'state.exceptions',
  'state.plan-approval',
  'state.reconcile',
  'test.exact-receipt',
  'review.reuse',
  'review.no-verifier',
  'review.approval',
  'review.prompt',
  'review.reject',
  'review.dismiss',
  'delivery.envelope',
  'delivery.no-shell',
  'delivery.reconcile',
  'close.approval',
  'close.human-instruction',
  'close.dirty',
  'commit.trace',
]);

export const GUIDANCE_LIMITS = Object.freeze({
  normalizedSourceBytes: 1024 * 1024,
  entries: 512,
  idCharacters: 128,
  instructionsPerEntry: 64,
  bindingsPerList: 64,
  explanationCharacters: 32 * 1024,
  diagnosticExcerptCharacters: 2 * 1024,
  agentProxy: 1000,
  humanProxy: 16000,
  entryProxy: 17000,
  aggregateAgentProxy: 64000,
  aggregateHumanProxy: 160000,
  catalogProxy: 240000,
});

export function coreGuidanceRequirements() {
  const actions = listLifecycleActions();
  const remediations = listRemediations();
  const guardIds = new Set();
  for (const stateName of STATE_MACHINE.order) {
    const state = STATE_MACHINE.get(stateName);
    for (const guard of [...state.entryGuards, ...state.exitGuards]) guardIds.add(guard.id);
  }
  return {
    actionIds: new Set(actions.map(({ id }) => id)),
    guardIds,
    remediationIds: new Set(remediations.map(({ id }) => id)),
    requiredEntries: [
      ...actions.map(({ id, guidanceId }) => ({ id: guidanceId, actionId: id })),
      ...remediations.map(({ id, guidanceId }) => ({ id: guidanceId, remediationId: id })),
      ...REQUIRED_PROTOCOL_GUIDANCE_IDS.map((id) => ({ id })),
    ],
  };
}
