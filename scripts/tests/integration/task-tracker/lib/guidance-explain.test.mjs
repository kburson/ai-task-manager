// @story #1675
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { parseExplainInvocation, runExplain } from '../../../../task-tracker/verbs/explain.mjs';

const digest = (letter) => `sha256:${letter.repeat(64)}`;
const snapshotCore = {
  state: 'develop',
  head: 'a'.repeat(40),
  startedAt: '2026-09-22T20:00:00.000Z',
  completedAt: '2026-09-22T20:00:01.000Z',
  observations: [
    {
      source: 'issue-body',
      identity: 'issue:1675',
      observedAt: '2026-09-22T20:00:00.500Z',
      digest: digest('c'),
    },
  ],
  normalizationInputs: [],
};
const decision = Object.freeze({
  schema: 'aitm.action-decision/v2',
  issue: 1675,
  actionId: 'promote',
  status: 'ready',
  snapshot: {
    state: 'develop',
    head: 'a'.repeat(40),
    digest: `sha256:${createHash('sha256').update(JSON.stringify(snapshotCore)).digest('hex')}`,
    startedAt: snapshotCore.startedAt,
    completedAt: snapshotCore.completedAt,
    observations: snapshotCore.observations,
  },
  blockers: [],
  normalizations: [],
  warnings: [],
  humanDecision: null,
  guidanceIds: ['action.promote'],
});
const agentIndex = Object.freeze({
  schema: 'aitm.guidance-agent-index/v1',
  byId: {
    'action.promote': {
      id: 'action.promote',
      agentDigest: digest('d'),
      instruction: [{ query: 'promote' }, { execution_revalidates: true }],
    },
  },
});

test('strict parser accepts canonical and mutation-alias explanation forms', () => {
  assert.deepEqual(parseExplainInvocation(['explain', '1675', '--json']), {
    matched: true,
    issue: 1675,
    actionId: 'promote',
    known: [],
    knownSource: null,
    diagnostic: false,
  });
  for (const [verb, actionId] of [
    ['next', 'promote'],
    ['review', 'review'],
    ['close', 'close'],
  ]) {
    assert.equal(parseExplainInvocation([verb, '#1675', '--explain', '--json']).actionId, actionId);
  }
  assert.equal(parseExplainInvocation(['promote', '1675', '--json']).matched, false);
});

test('strict parser rejects missing json, singleton duplication, and malformed shapes', () => {
  for (const argv of [
    ['explain', '1675'],
    ['explain', '1675', '--json', '--json'],
    ['explain', '1675', '--action'],
    ['explain', '1675', '--known'],
    ['explain', 'wat', '--json'],
    ['next', '1675', '--explain'],
    ['review', '1675', '--explain', '--json', '--diagnostic', '--diagnostic'],
  ]) {
    assert.throws(() => parseExplainInvocation(argv), /explain:/);
  }
});

test('one evaluation feeds routine and diagnostic projection without effects', async () => {
  for (const diagnostic of [false, true]) {
    let evaluations = 0;
    let output = '';
    const result = await runExplain(
      {
        issue: 1675,
        actionId: 'promote',
        known: [],
        knownSource: null,
        diagnostic,
      },
      {
        evaluate: async () => {
          evaluations += 1;
          return {
            decision,
            diagnosticMessages: [{ guardId: 'authority-collection', text: 'raw', untrusted: true }],
          };
        },
        loadAgentIndex: () => agentIndex,
        stdout: { write: (value) => (output += value) },
      }
    );
    assert.equal(evaluations, 1);
    assert.equal(output, `${JSON.stringify(result)}\n`);
    assert.equal(result.result.status, 'ready');
    assert.equal(result.guidance[0].status, 'expanded');
    assert.equal(Object.hasOwn(result, 'fullDecision'), diagnostic);
  }
});

test('matching receipt suppresses only agent expansion while evaluation remains fresh', async () => {
  let evaluations = 0;
  const result = await runExplain(
    {
      issue: 1675,
      actionId: 'promote',
      known: [`action.promote@${digest('d')}`],
      knownSource: null,
      diagnostic: false,
    },
    {
      evaluate: async () => {
        evaluations += 1;
        return { decision, diagnosticMessages: [] };
      },
      loadAgentIndex: () => agentIndex,
      stdout: { write: () => {} },
    }
  );
  assert.equal(evaluations, 1);
  assert.deepEqual(result.guidance, [
    { id: 'action.promote', digest: digest('d'), status: 'not-modified' },
  ]);
});

test('actual command-core traffic covers receipt, source, reset, blocked, and diagnostic lanes', async () => {
  const sourceDigest = digest('e');
  const sourceWarning = {
    code: 'guidance-source-diverged',
    args: { source: '.ai-task-manager/aitm-guidance.yml', digest: sourceDigest },
  };
  const blockedDecision = {
    ...decision,
    status: 'blocked',
    blockers: [
      {
        guardId: 'plan-exit-plan-approved',
        code: 'plan-approval-missing',
        args: {},
        remediation: { id: 'record-plan-approval', args: { issue: 1675 } },
      },
    ],
    humanDecision: {
      requests: [
        {
          kind: 'plan-approval',
          actor: 'configured-approver',
          subject: { issue: 1675, actionId: 'promote' },
          args: {},
        },
      ],
    },
  };
  const changedAgentIndex = structuredClone(agentIndex);
  changedAgentIndex.byId['action.promote'].agentDigest = digest('f');
  const rows = [];
  const capture = async ({
    name,
    known = [],
    knownSource = null,
    diagnostic = false,
    selectedDecision = decision,
    selectedAgentIndex = agentIndex,
    admissionWarnings = [],
  }) => {
    let stdout = '';
    const envelope = await runExplain(
      { issue: 1675, actionId: 'promote', known, knownSource, diagnostic },
      {
        evaluate: async () => ({
          selected: true,
          decision: selectedDecision,
          diagnosticMessages: [],
        }),
        loadAgentIndex: () => selectedAgentIndex,
        admissionWarnings,
        stdout: { write: (value) => (stdout += value) },
      }
    );
    rows.push({
      name,
      argv: ['explain', '1675', ...(diagnostic ? ['--diagnostic'] : []), '--json'],
      stdout,
      stderr: '',
      status: envelope.result.status,
      guidanceStatus: envelope.guidance[0].status,
      proxyTokens: Math.ceil(Buffer.byteLength(stdout) / 4),
    });
    return envelope;
  };
  await capture({ name: 'first-load' });
  await capture({ name: 'matching-repeat', known: [`action.promote@${digest('d')}`] });
  await capture({
    name: 'agent-change',
    known: [`action.promote@${digest('d')}`],
    selectedAgentIndex: changedAgentIndex,
  });
  const source = await capture({ name: 'source-only-change', admissionWarnings: [sourceWarning] });
  await capture({ name: 'compaction-reset' });
  await capture({ name: 'blocked', selectedDecision: blockedDecision });
  await capture({ name: 'diagnostic', diagnostic: true });
  assert.equal(source.sourceReceipt, `aitm-guidance-source:project-owned-diverged:${sourceDigest}`);
  assert.deepEqual(
    rows.map(({ name, guidanceStatus, status }) => ({ name, guidanceStatus, status })),
    [
      { name: 'first-load', guidanceStatus: 'expanded', status: 'ready' },
      { name: 'matching-repeat', guidanceStatus: 'not-modified', status: 'ready' },
      { name: 'agent-change', guidanceStatus: 'expanded', status: 'ready' },
      { name: 'source-only-change', guidanceStatus: 'expanded', status: 'ready' },
      { name: 'compaction-reset', guidanceStatus: 'expanded', status: 'ready' },
      { name: 'blocked', guidanceStatus: 'expanded', status: 'blocked' },
      { name: 'diagnostic', guidanceStatus: 'expanded', status: 'ready' },
    ]
  );
  for (const row of rows.filter(({ name }) => name !== 'diagnostic')) {
    assert.ok(
      row.proxyTokens <= (row.status === 'ready' ? 240 : 400),
      `${row.name}: ${row.proxyTokens}`
    );
    assert.equal(row.stderr, '');
  }
});
