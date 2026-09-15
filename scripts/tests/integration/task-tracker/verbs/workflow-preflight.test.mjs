// @story #1627
import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkflowExceptionEnvelope } from '../../../../task-tracker/lib/workflow-policy/exception-record.mjs';
import { computeScopeIdentity } from '../../../../task-tracker/lib/workflow-policy/scope-identity.mjs';
import {
  requirementCatalog,
  WORKFLOW_POLICY_CAPABILITY,
} from '../../../../task-tracker/lib/workflow-policy/catalog.mjs';
import {
  commandByName,
  routeIdentityForCommand,
} from '../../../../task-tracker/lib/command-surface/catalog.mjs';
import { VERB_REFERENCE } from '../../../../task-tracker/verbs/help-data.mjs';
import { PREFLIGHT_MODE } from '../../../../task-tracker/task-tracker.mjs';
import {
  formatWorkflowPreflightReport,
  createWorkflowPreflightRuntime,
  parseWorkflowPreflightArgs,
  runWorkflowPreflight,
} from '../../../../task-tracker/verbs/workflow-preflight.mjs';
import { runWorkflowException } from '../../../../task-tracker/verbs/workflow-exception.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 57;
const body = `## User Story

As an operator
I want a bounded workflow exception
So that the normal workflow stays truthful

## Scope

Deliver only the explicit incident recovery.

## Acceptance Criteria

- [ ] Preserve the audit trail.
`;

function exceptionRecord() {
  return {
    commentNodeId: 'IC_exception_57',
    envelope: createWorkflowExceptionEnvelope({
      repository,
      issue,
      exceptionId: 'incident-57',
      revision: 1,
      scopeIdentity: computeScopeIdentity({ repository, issue, body }),
      requirementIds: [
        'planning.deep-dive',
        'review.design',
        'review.implementation',
        'review.peer',
        'review.semantic-resident',
      ],
      constraints: [{ id: 'provider.managed-execution', effect: 'deny' }],
      reason: 'Use the approved bounded no-plan and no-review policy.',
      authorization: {
        reference: 'codex://sessions/session-57/messages/message-57',
        statement: 'For issue 57, use only the bounded workflow exception.',
        principal: 'operator@example.test',
        recordingActor: 'codex/session:session-57',
        origin: 'codex-session-transcript',
        verificationLevel: 'host-verified-user-message',
      },
      expiresAt: '2026-09-16T00:00:00.000Z',
      operationId: `sha256:${'a'.repeat(64)}`,
      createdAt: '2026-09-14T20:00:00.000Z',
      recordId: '01M2H000000000000000000201',
      grantId: '01M2H000000000000000000202',
    }),
  };
}

function revisedExceptionRecords() {
  const first = exceptionRecord();
  const second = {
    commentNodeId: 'IC_exception_57_revision_2',
    envelope: createWorkflowExceptionEnvelope({
      repository,
      issue,
      exceptionId: 'incident-57',
      revision: 2,
      scopeIdentity: computeScopeIdentity({ repository, issue, body }),
      requirementIds: ['planning.metadata'],
      constraints: [{ id: 'provider.managed-execution', effect: 'deny' }],
      reason: 'Revise the bounded exception without rewriting its history.',
      authorization: first.envelope.payload.approvalEvidence,
      expiresAt: '2026-09-16T00:00:00.000Z',
      operationId: `sha256:${'c'.repeat(64)}`,
      predecessor: first.envelope.recordId,
      supersedes: first.envelope.recordId,
      createdAt: '2026-09-14T21:00:00.000Z',
      recordId: '01M2H000000000000000000203',
      grantId: '01M2H000000000000000000204',
    }),
  };
  return [first, second];
}

function runtimeFixture({ externalProtection = 'unknown', evidence = {} } = {}) {
  const calls = [];
  const forbidden = {
    writeIssue: () => calls.push('writeIssue'),
    writeRepository: () => calls.push('writeRepository'),
    writeCache: () => calls.push('writeCache'),
    mutateBinding: () => calls.push('mutateBinding'),
    mutateTimer: () => calls.push('mutateTimer'),
    spawnProcess: () => calls.push('spawnProcess'),
    requestProvider: () => calls.push('requestProvider'),
  };
  return {
    calls,
    forbidden,
    async readIssue(targetIssue) {
      calls.push('readIssue');
      return {
        number: targetIssue,
        body,
        currentState: 'plan',
        projectFields: { status: 'Plan' },
        evidence,
        conflicts: [
          {
            code: 'dependency-blocked',
            detail: '#56 is unresolved',
            remediation: 'resolve dependency #56 before delivery',
          },
        ],
      };
    },
    async listRecords() {
      calls.push('listRecords');
      return [exceptionRecord()];
    },
    async readRepository() {
      calls.push('readRepository');
      return {
        headSha: 'b'.repeat(40),
        evidence: {
          'delivery.tests': {
            state: 'pending-future-evidence',
            remediation: 'run the declared tests in Test',
          },
          'delivery.verification-evidence': {
            state: 'pending-future-evidence',
            remediation: 'record exact-SHA verification evidence in Test',
          },
          'delivery.ci': {
            state: 'pending-future-evidence',
            remediation: 'wait for required CI on the accepted SHA',
          },
        },
        externalProtection: {
          state: externalProtection,
          reference: 'github://branch-protection',
        },
      };
    },
    async readDependencies() {
      calls.push('readDependencies');
      return [{ issue: 56, state: 'blocked' }];
    },
    async readSessionPolicy() {
      calls.push('readSessionPolicy');
      return { fullAuto: true, source: '.ai-task-manager/task-tracker.json' };
    },
    async readRuntimeCapability() {
      calls.push('readRuntimeCapability');
      return WORKFLOW_POLICY_CAPABILITY;
    },
  };
}

test('arguments require one explicit issue and explicit supported target', () => {
  assert.deepEqual(parseWorkflowPreflightArgs(['#57', '--target', 'done', '--json']), {
    issue: 57,
    target: 'done',
    json: true,
  });
  assert.throws(() => parseWorkflowPreflightArgs(['--target', 'done']), /workflow-preflight:usage/);
  assert.throws(() => parseWorkflowPreflightArgs(['#57']), /workflow-preflight:usage/);
  assert.throws(
    () => parseWorkflowPreflightArgs(['#57', '--target', 'closed']),
    /workflow-preflight:target/
  );
});

test('public command routing stays explicit and bypasses binding preflight', () => {
  assert.deepEqual(routeIdentityForCommand('workflow-preflight'), {
    verb: 'workflow-preflight',
    dispatch: 'verbs/workflow-preflight.mjs',
  });
  const command = commandByName('workflow-preflight');
  assert.equal(command.routing, 'verbs/workflow-preflight.mjs');
  assert.equal(command.group, 'evidence');
  assert.match(command.effects.join(' '), /read-only/i);
  assert.match(VERB_REFERENCE['workflow-preflight'].usage, /--target <state>/);
  assert.ok(VERB_REFERENCE['workflow-preflight'].flags.some(({ flag }) => flag === '--json'));
  assert.equal(PREFLIGHT_MODE['workflow-preflight'], undefined);
});

test('preflight aggregates current blockers, future evidence, external unknowns, and authority provenance', async () => {
  const runtime = runtimeFixture();
  const report = await runWorkflowPreflight({
    repository,
    issue,
    target: 'done',
    now: '2026-09-15T00:00:00.000Z',
    runtime: { ...runtime, ...runtime.forbidden },
  });

  assert.equal(report.schema, 'aitm.workflow-preflight-report/v1');
  assert.equal(report.status, 'blocked');
  assert.equal(report.currentState, 'plan');
  assert.equal(report.targetState, 'done');
  assert.equal(report.capability, WORKFLOW_POLICY_CAPABILITY);
  assert.equal(report.advisory, true);
  assert.equal(report.conditionalOnFutureState, true);
  assert.ok(report.blockers.some(({ code }) => code === 'dependency-blocked'));
  assert.ok(
    report.blockers.some(
      ({ code, requirementId }) =>
        code === 'requirement-missing' && requirementId === 'planning.metadata'
    )
  );
  assert.deepEqual(
    report.pendingFutureEvidence.map(({ requirementId }) => requirementId),
    [
      'delivery.ownership',
      'delivery.dependencies',
      'delivery.issue-binding',
      'delivery.state-contiguity',
      'delivery.tests',
      'delivery.verification-evidence',
      'approval.human-completion',
      'delivery.commit-provenance',
      'delivery.ci',
      'delivery.safe-delivery',
    ]
  );
  assert.deepEqual(report.externalUnknowns, [
    {
      code: 'external-protection-unknown',
      requirementId: 'delivery.external-protection',
      reference: 'github://branch-protection',
      remediation: 'inspect the live hosting-provider protection and required-review state',
    },
  ]);
  assert.deepEqual(report.authorityRevisions, [
    {
      recordId: '01M2H000000000000000000201',
      revision: 1,
      disposition: 'active',
      reference: 'codex://sessions/session-57/messages/message-57',
    },
  ]);
  assert.ok(report.waivers.some(({ id }) => id === 'planning.deep-dive'));
  assert.deepEqual(
    report.prohibitions.map(({ id }) => id),
    ['provider.managed-execution']
  );
  assert.deepEqual(runtime.calls, [
    'readIssue',
    'listRecords',
    'readRepository',
    'readDependencies',
    'readSessionPolicy',
    'readRuntimeCapability',
  ]);
  assert.ok(
    !runtime.calls.some((call) =>
      [
        'writeIssue',
        'writeRepository',
        'writeCache',
        'mutateBinding',
        'mutateTimer',
        'spawnProcess',
        'requestProvider',
      ].includes(call)
    )
  );

  const json = formatWorkflowPreflightReport(report, { json: true });
  assert.deepEqual(JSON.parse(json), report);
  const human = formatWorkflowPreflightReport(report);
  for (const item of [
    report.status,
    report.capability,
    ...report.blockers.map(({ code }) => code),
    ...report.pendingFutureEvidence.map(({ requirementId }) => requirementId),
    ...report.externalUnknowns.map(({ code }) => code),
    ...report.authorityRevisions.map(({ recordId }) => recordId),
  ]) {
    assert.match(human, new RegExp(item.replaceAll('.', '\\.')));
  }
});

test('external uncertainty is indeterminate while complete evidence is conditionally compatible', async () => {
  const allSatisfied = Object.fromEntries(
    requirementCatalog().map(({ id }) => [
      id,
      { state: 'satisfied', reference: `evidence://${id}` },
    ])
  );
  const unknown = runtimeFixture({ evidence: allSatisfied });
  unknown.readIssue = async () => ({
    number: issue,
    body,
    currentState: 'done',
    projectFields: { status: 'Done' },
    evidence: allSatisfied,
    conflicts: [],
  });
  unknown.listRecords = async () => [];
  const indeterminate = await runWorkflowPreflight({
    repository,
    issue,
    target: 'done',
    now: '2026-09-15T00:00:00.000Z',
    runtime: unknown,
  });
  assert.equal(indeterminate.status, 'indeterminate');

  const compatibleRuntime = runtimeFixture({
    externalProtection: 'satisfied',
    evidence: allSatisfied,
  });
  compatibleRuntime.readIssue = unknown.readIssue;
  compatibleRuntime.listRecords = async () => [];
  compatibleRuntime.readRepository = async () => ({
    headSha: 'b'.repeat(40),
    evidence: allSatisfied,
    externalProtection: {
      state: 'satisfied',
      reference: 'github://branch-protection',
    },
  });
  const compatible = await runWorkflowPreflight({
    repository,
    issue,
    target: 'done',
    now: '2026-09-15T00:00:00.000Z',
    runtime: compatibleRuntime,
  });
  assert.equal(compatible.status, 'policy-compatible');
  assert.equal(compatible.blockers.length, 0);
  assert.equal(compatible.pendingFutureEvidence.length, 0);
  assert.equal(compatible.externalUnknowns.length, 0);
  assert.match(compatible.advisoryNote, /revalidate/i);
});

test('authority revision reporting derives superseded disposition from the validated chain', async () => {
  const runtime = runtimeFixture({ externalProtection: 'satisfied' });
  runtime.listRecords = async () => revisedExceptionRecords();
  const report = await runWorkflowPreflight({
    repository,
    issue,
    target: 'plan',
    now: '2026-09-15T00:00:00.000Z',
    runtime,
  });
  assert.deepEqual(
    report.authorityRevisions.map(({ recordId, disposition }) => ({ recordId, disposition })),
    [
      { recordId: '01M2H000000000000000000201', disposition: 'superseded' },
      { recordId: '01M2H000000000000000000203', disposition: 'active' },
    ]
  );
});

test('snapshot read failures retain the complete indeterminate report schema in both views', async () => {
  const report = await runWorkflowPreflight({
    repository,
    issue,
    target: 'done',
    now: '2026-09-15T00:00:00.000Z',
    runtime: {
      async readIssue() {
        throw new Error('provider read unavailable');
      },
    },
  });
  assert.equal(report.schema, 'aitm.workflow-preflight-report/v1');
  assert.equal(report.status, 'indeterminate');
  assert.equal(report.currentState, null);
  assert.equal(report.blockers.length, 0);
  assert.deepEqual(report.externalUnknowns, [
    {
      code: 'snapshot-read-indeterminate',
      requirementId: null,
      reference: 'provider read unavailable',
      remediation: 'restore the required read-only repository and issue inspection capability',
    },
  ]);
  assert.match(formatWorkflowPreflightReport(report), /snapshot-read-indeterminate/);
  assert.deepEqual(JSON.parse(formatWorkflowPreflightReport(report, { json: true })), report);
});

test('an empty dependency snapshot satisfies the current dependency invariant', async () => {
  const runtime = runtimeFixture({ externalProtection: 'satisfied' });
  runtime.readIssue = async () => ({
    number: issue,
    body,
    currentState: 'develop',
    projectFields: { status: 'Develop' },
    evidence: {
      'planning.deep-dive': { state: 'satisfied', reference: 'issue://deep-dive' },
      'planning.metadata': { state: 'satisfied', reference: 'issue://metadata' },
      'planning.planned-estimate': { state: 'satisfied', reference: 'issue://estimate' },
      'planning.forecast': { state: 'satisfied', reference: 'issue://forecast' },
      'approval.plan': { state: 'satisfied', reference: 'issue://plan-approval' },
      'delivery.ownership': { state: 'satisfied', reference: 'github://assignee' },
      'delivery.issue-binding': { state: 'satisfied', reference: 'session://binding' },
      'delivery.state-contiguity': { state: 'satisfied', reference: 'issue://state' },
    },
    conflicts: [],
  });
  runtime.listRecords = async () => [];
  runtime.readDependencies = async () => [];
  const report = await runWorkflowPreflight({
    repository,
    issue,
    target: 'develop',
    now: '2026-09-15T00:00:00.000Z',
    runtime,
  });
  assert.equal(report.status, 'policy-compatible');
  assert.equal(
    report.requirements.find(({ id }) => id === 'delivery.dependencies').outcome,
    'satisfied'
  );
});

test('production runtime derives ownership, binding, and state-contiguity evidence read-only', async () => {
  const calls = [];
  const runtime = createWorkflowPreflightRuntime(
    {
      cfg: { repo: repository, projectId: 'project-1', gateReviewToDone: true },
      projectDir: '/repo',
      statePath: '/repo/.tmp/aitm/state/task-tracker-state.json',
      pexec: async (file, args) => {
        calls.push([file, ...args]);
        return { stdout: args[0] === 'rev-parse' ? `${'b'.repeat(40)}\n` : '' };
      },
    },
    {
      readState: () => ({ active: '#57' }),
      graphql: async (query) => {
        calls.push(['graphql', query.includes('WorkflowPreflightIssue') ? 'issue' : 'other']);
        return {
          repository: {
            issue: {
              number: issue,
              body: '<!-- aitm-last-known-state state="develop" ts="2026-09-15T00:00:00.000Z" -->',
              assignees: { nodes: [{ login: 'operator' }] },
              projectItems: {
                nodes: [
                  {
                    project: { id: 'project-1' },
                    fieldValueByName: { name: 'Develop' },
                  },
                ],
              },
            },
          },
        };
      },
    }
  );
  const snapshot = await runtime.readIssue(issue);
  assert.equal(snapshot.evidence['delivery.ownership'].state, 'satisfied');
  assert.equal(snapshot.evidence['delivery.issue-binding'].state, 'satisfied');
  assert.equal(snapshot.evidence['delivery.state-contiguity'].state, 'satisfied');
  assert.deepEqual(calls, [['graphql', 'issue']]);
});

test('workflow exception show remains read-only and does not resolve or append authority', async () => {
  const calls = [];
  const result = await runWorkflowException({
    action: 'show',
    issues: [issue],
    repository,
    now: '2026-09-15T00:00:00.000Z',
    runtime: {
      async fetchIssue() {
        calls.push('fetchIssue');
        return { number: issue, body };
      },
      async listRecords() {
        calls.push('listRecords');
        return [exceptionRecord()];
      },
      async resolveAuthority() {
        calls.push('resolveAuthority');
        throw new Error('show must not resolve authority');
      },
      async appendRecord() {
        calls.push('appendRecord');
        throw new Error('show must not append');
      },
    },
  });
  assert.equal(result.status, 'shown');
  assert.deepEqual(calls, ['fetchIssue', 'listRecords']);
});
