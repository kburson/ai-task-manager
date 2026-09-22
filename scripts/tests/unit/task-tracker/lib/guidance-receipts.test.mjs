// @story #1675
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildExplanationEnvelope,
  parseKnownGuidanceReceipts,
  projectGuidance,
} from '../../../../../guidance/protocol.mjs';
import { ACTION_DECISION_SCHEMA } from '../../../../task-tracker/lib/action-decision/contract.mjs';
import { EXPLANATION_SCHEMA } from '../../../../task-tracker/lib/action-decision/presentation.mjs';
import { actionDecisionSnapshot } from '../../../helpers/action-decision-fixtures.mjs';

const DIGEST = `sha256:${'a'.repeat(64)}`;
const SOURCE_DIGEST = `sha256:${'b'.repeat(64)}`;
const SOURCE_RECEIPT = `aitm-guidance-source:project-owned-diverged:${SOURCE_DIGEST}`;

function decision({ warnings = [] } = {}) {
  return {
    schema: ACTION_DECISION_SCHEMA,
    issue: 1675,
    actionId: 'promote',
    status: 'ready',
    snapshot: actionDecisionSnapshot({
      state: 'plan',
      head: '1234567890abcdef1234567890abcdef12345678',
      observations: [
        {
          source: 'issue-body',
          identity: 'issue:1675',
          observedAt: '2026-09-20T15:00:00.500Z',
          digest: `sha256:${'c'.repeat(64)}`,
        },
      ],
    }),
    blockers: [],
    normalizations: [],
    warnings,
    humanDecision: null,
    guidanceIds: ['action.promote'],
  };
}

function agentIndex({ digest = DIGEST } = {}) {
  return {
    schema: 'aitm.guidance-agent-index/v1',
    catalogDigest: `sha256:${'d'.repeat(64)}`,
    byId: {
      'action.promote': {
        id: 'action.promote',
        revision: 1,
        binds: ['promote'],
        instruction: [
          { query: 'promote' },
          { require_status: 'ready' },
          { execute: 'promote' },
          { execution_revalidates: true },
        ],
        agentDigest: digest,
        entryDigest: `sha256:${'e'.repeat(64)}`,
      },
    },
  };
}

test('known guidance receipts are closed attestations and malformed values never suppress', () => {
  const known = parseKnownGuidanceReceipts([
    `action.promote@${DIGEST}`,
    `action.promote@${DIGEST}`,
    'action.promote@sha256:ABC',
    `action.close@${DIGEST}`,
    'free text',
  ]);
  assert.deepEqual(known, [
    { id: 'action.promote', digest: DIGEST },
    { id: 'action.close', digest: DIGEST },
  ]);

  const expanded = projectGuidance({
    guidanceIds: ['action.promote'],
    agentIndex: agentIndex(),
    known: ['action.promote@sha256:ABC'],
  });
  assert.equal(expanded[0].status, 'expanded');
  assert.ok(expanded[0].agent.instruction.length > 0);

  const suppressed = projectGuidance({
    guidanceIds: ['action.promote'],
    agentIndex: agentIndex(),
    known: [`action.promote@${DIGEST}`],
  });
  assert.deepEqual(suppressed, [{ id: 'action.promote', digest: DIGEST, status: 'not-modified' }]);
});

test('human-only changes preserve suppression while agent digest changes expand', () => {
  const known = [`action.promote@${DIGEST}`];
  assert.equal(
    projectGuidance({ guidanceIds: ['action.promote'], agentIndex: agentIndex(), known })[0].status,
    'not-modified'
  );
  assert.equal(
    projectGuidance({
      guidanceIds: ['action.promote'],
      agentIndex: agentIndex({ digest: `sha256:${'f'.repeat(64)}` }),
      known,
    })[0].status,
    'expanded'
  );
});

test('source receipt is emitted iff the typed source warning is unsuppressed', () => {
  const admissionWarnings = [
    {
      code: 'guidance-source-diverged',
      args: { source: '.ai-task-manager/aitm-guidance.yml', digest: SOURCE_DIGEST },
    },
  ];
  const first = buildExplanationEnvelope({
    decision: decision(),
    agentIndex: agentIndex(),
    admissionWarnings,
  });
  assert.equal(first.schema, EXPLANATION_SCHEMA);
  assert.equal(first.sourceReceipt, SOURCE_RECEIPT);
  assert.equal(first.result.warnings[0].code, 'guidance-source-diverged');

  const repeat = buildExplanationEnvelope({
    decision: decision(),
    agentIndex: agentIndex(),
    admissionWarnings,
    knownSource: SOURCE_RECEIPT,
  });
  assert.equal(Object.hasOwn(repeat, 'sourceReceipt'), false);
  assert.deepEqual(repeat.result.warnings, []);

  const mismatch = buildExplanationEnvelope({
    decision: decision(),
    agentIndex: agentIndex(),
    admissionWarnings,
    knownSource: `aitm-guidance-source:project-owned-diverged:sha256:${'0'.repeat(64)}`,
  });
  assert.equal(mismatch.sourceReceipt, SOURCE_RECEIPT);
});

test('routine and diagnostic envelopes reuse identical operational projection', () => {
  const input = {
    decision: decision(),
    agentIndex: agentIndex(),
    known: [`action.promote@${DIGEST}`],
  };
  const routine = buildExplanationEnvelope(input);
  const diagnostic = buildExplanationEnvelope({
    ...input,
    diagnostic: true,
    diagnosticMessages: [],
  });
  assert.deepEqual(diagnostic.result, routine.result);
  assert.deepEqual(diagnostic.guidance, routine.guidance);
  assert.equal(diagnostic.fullDecision, input.decision);
  assert.deepEqual(diagnostic.diagnosticMessages, []);
});
