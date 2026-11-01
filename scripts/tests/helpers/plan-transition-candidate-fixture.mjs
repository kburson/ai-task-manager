// @story #2069
import assert from 'node:assert/strict';
import * as approvals from '../../task-tracker/verbs/plan-approve.mjs';
import { createHash } from 'node:crypto';
import { createStoryFixture } from './story-cache-fixtures.mjs';
import {
  readStorySnapshot,
  createStoryReadBudget,
} from '../../task-tracker/lib/story-cache/snapshot-reader.mjs';
import { resolvePlanTransitionAuthority } from '../../task-tracker/lib/plan-transition-authority.mjs';

import { confirmResourceEffect } from '../../task-tracker/lib/story-cache/provider-adapters.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../task-tracker/lib/scratch-dir.mjs';
import { bundle, envelope, outcome, id } from './local-estimation-evidence-fixture.mjs';
import { calculateLocalEstimate } from '../../task-tracker/lib/estimation/local-runtime.mjs';
import { validateLocalEvidence } from '../../task-tracker/lib/estimation/local-evidence.mjs';
import {
  createAitmRecordEnvelope,
  renderAitmRecord,
} from '../../task-tracker/lib/github-records/record-envelope.mjs';

import {
  renderPlanTransitionCandidateAuthority,
  renderPlanApprovalCandidateAudit,
} from '../../task-tracker/lib/plan-transition-authority.mjs';

export const trunk = 'a'.repeat(40);
export const projectDir = process.cwd();
export const initial = `## User Story

As a release operator
I want to stop partial publication because registry checks can fail
So that consumers receive complete releases

## Scope

Validate the approved publication scope.

## Acceptance Criteria

- [ ] Reject changed publication scope.

## Deep-Dive Analysis

### Story Intent
- **Beneficiary:** release operator
- **Capability:** stop partial publication
- **Need:** registry checks can fail
- **Value or failure prevented:** consumers receive complete releases

<!-- aitm-entered-ready-for-plan ts="2026-10-19T00:00:00Z" -->
`;

export async function approve(mode = 'human', options = {}) {
  let body = options.body ?? initial;
  let currentTrunk = trunk;
  const result = await approvals.runPlanApprove({
    issueNumber: 2039,
    cfg: { repo: 'owner/repo', estimationRubricIssue: 0, ...options.cfg },
    projectDir: options.projectDir ?? projectDir,
    retainCandidateAuthority: true,
    deps: {
      fetchIssueBody: async () => body,
      getBoardState: async () => 'plan',
      fetchEpicChildren: async () => [],
      resolveTrunkSha: async () => currentTrunk,
      readCurrentForecastSelection: options.selection
        ? async () => structuredClone(options.selection)
        : undefined,
      nowIso: () => '2026-10-19T01:00:00Z',
      env: mode === 'full-auto' ? { TT_FULL_AUTO: '1' } : {},
      listComments: async () => [],
      postComment: async () => {},
      mutateIssueBody: async ({ mutate, validateFreshBase }) => {
        if (options.beforeMutate) body = options.beforeMutate(body);
        validateFreshBase(body);
        body = mutate(body);
        return { status: 'ok', body };
      },
    },
  });
  assert.equal(result.status, 'approved', result.message);
  return {
    result,
    get body() {
      return body;
    },
    projectDir: options.projectDir ?? projectDir,
    changeTrunk() {
      currentTrunk = 'b'.repeat(40);
    },
  };
}

export async function verify(s, overrides = {}) {
  assert.equal(
    typeof approvals.verifyRetainedPlanApproval,
    'function',
    'native retained approval verifier is missing'
  );
  return approvals.verifyRetainedPlanApproval(s.result.approvalCapability, {
    body: s.body,
    repository: 'owner/repo',
    issue: 2039,
    projectDir,
    ...overrides,
  });
}

export const transition = {
  id: 'move:11111111-1111-4111-8111-111111111111',
  from: 'plan',
  to: 'develop',
};
export const hash = (body) => createHash('sha256').update(body).digest('hex');
export async function candidateFixture(mode = 'human', options = {}) {
  const s = await approve(mode, options);
  const fixture = createStoryFixture({
    assignees: ['owner'],
    comments: [
      {
        id: 'IC_estimate',
        body:
          options.estimate ??
          '<!-- aitm-refined-estimate: 2039 -->\n### Planned Estimate\n| Field | Refine | Plan | Δ |\n| Size | S | S | — |\n| Estimate (h) | 3 | 3 | 0 |',
      },
      ...(options.comments ?? []),
    ],
    fields: options.fields ?? [],
  });
  fixture.data.issue.body = initial;
  fixture.transport.fields = (options.fields ?? []).map((row) => ({
    fieldId: row.field.id,
    type: row.field.dataType,
  }));
  const baseline = await readStorySnapshot({
    identity: fixture.identity,
    transport: fixture.transport,
    budget: createStoryReadBudget(),
  });
  const record = resolvePlanTransitionAuthority({
    repository: 'owner/repo',
    issue: 2039,
    transitionId: transition.id,
    body: s.body,
    cfg: {},
    sessionPolicy: { gates: { analysisToDevelopment: true } },
    recordedAt: '2026-10-19T01:00:00.000Z',
  });
  const effects = [];
  const confirmationBase = structuredClone(baseline);
  const add = (key, body, id) => {
    const effect = {
      key: 'comment:new:' + key,
      kind: 'comment-create',
      candidate: body,
      intendedDigest: hash(body),
      beforeDigest: null,
      attempted: true,
      target: { identity: fixture.identity, commentNodeId: null, creationIntent: key },
    };
    const value = {
      complete: true,
      identity: fixture.identity,
      node: {
        id,
        lastEditedAt: null,
        includesCreatedEdit: false,
        userContentEdits: { totalCount: 0, nodes: [] },
      },
      body,
      inventory: [
        ...confirmationBase.inventory.map((old) => ({
          id: old,
          body: confirmationBase.resources['comment:' + old].body,
        })),
        { id, body },
      ],
    };
    const confirmed = confirmResourceEffect(effect, value, { baseline: confirmationBase });
    effect.outcome = confirmed.outcome;
    confirmationBase.resources['comment:' + id] = { ...confirmed.observed, ownership: 'owned' };
    confirmationBase.inventory.push(id);
    confirmationBase.inventory.sort();
    effects.push(effect);
  };
  add('authority', renderPlanTransitionCandidateAuthority(record), 'IC_authority');
  if (mode === 'full-auto') {
    add(
      'audit',
      renderPlanApprovalCandidateAudit({ issueNumber: 2039, ts: s.result.ts }),
      'IC_audit'
    );
  }
  return {
    s,
    baseline,
    effects,
    input: {
      candidate: {
        approvalCapability: s.result.approvalCapability,
        body: s.body,
        repository: 'owner/repo',
        issue: 2039,
        projectDir: s.projectDir,
        transition,
        phase: 'pre-status',
      },
      baselineEquality: { baseline, current: structuredClone(baseline) },
      confirmedEffects: effects,
    },
  };
}

export async function enabledFixture(t) {
  const root = fs.mkdtempSync(path.join(projectScratchDir('tests'), '2069-candidate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const evidence = bundle([
    { record: envelope(), provenance: 'imported-local' },
    {
      record: envelope({ recordId: id(10), payload: outcome(1068), issue: 1068 }),
      provenance: 'imported-local',
    },
  ]);
  evidence.planBytes = Buffer.from(
    '# Candidate plan\n\n### Task 1: Candidate approval\n\n' +
      initial
        .slice(initial.indexOf('### Story Intent'), initial.indexOf('<!-- aitm-entered'))
        .replace('### Story Intent', '#### Story Intent')
  );
  evidence.manifest.issue = 2039;
  evidence.manifest.plan.section = '### Task 1: Candidate approval';
  evidence.manifest.plan.digest = hash(evidence.planBytes);
  evidence.manifest.modelPolicy = {
    modelVersion: 'aitm.forecast-model/v2',
    policyVersion: 'aitm.local-estimation/v1',
  };
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, evidence.manifest.plan.path), evidence.planBytes);
  const {
    inputs: _inputs,
    schema: _schema,
    canonicalizationVersion: _canon,
    ...selectionFields
  } = evidence.manifest;
  const selection = structuredClone(selectionFields);
  const input = JSON.parse(
    fs.readFileSync(new URL('../fixtures/estimation/plan-input.json', import.meta.url))
  );
  const calculated = calculateLocalEstimate({
    mode: { mode: 'local' },
    evidence,
    planInput: { selection, input },
  });
  assert.equal(calculated.status, 'estimated');
  const forecast = {
    ...calculated.forecast,
    schema: 'aitm.estimation-forecast/v3',
    localEvidence: calculated.localEvidence,
  };
  const forecastId = id(30);
  const record = createAitmRecordEnvelope({
    recordId: forecastId,
    recordType: 'estimation-forecast',
    repository: 'owner/repo',
    issue: 2039,
    payload: forecast,
    predecessor: null,
    supersedes: null,
    createdAt: '2026-10-19T00:00:00.000Z',
    actor: 'fixture',
    grantId: id(99),
  });
  const comments = [{ id: 'IC_forecast', body: renderAitmRecord({ envelope: record }) }];
  const fields = [
    {
      id: 'FV_estimate',
      __typename: 'ProjectV2ItemFieldNumberValue',
      number: forecast.plan.humanHours,
      field: { id: 'F_estimate', dataType: 'NUMBER', project: { id: 'P_test' } },
    },
    {
      id: 'FV_size',
      __typename: 'ProjectV2ItemFieldSingleSelectValue',
      name: forecast.plan.size,
      optionId: 'OPT_size',
      field: { id: 'F_size', dataType: 'SINGLE_SELECT', project: { id: 'P_test' } },
    },
  ];
  const body =
    initial +
    `\n## Plan Metadata\n\n- **Implementation-plan**: docs/selected-plan.md\n- **Source-plan-commit**: ${'a'.repeat(40)}\n- **Source-plan-section**: ### Task 1: Candidate approval\n` +
    `\n<!-- aitm-estimation-forecast-ready record-id="${forecastId}" -->\n` +
    `<!-- aitm-fields: ${JSON.stringify({ schema: 1, values: { size: forecast.plan.size, estimate: forecast.plan.humanHours } })} -->`;
  const estimate = `<!-- aitm-refined-estimate: 2039 -->\n### Planned Estimate\n| Field | Refine | Plan | Δ |\n| Size | ${forecast.refine.size} | ${forecast.plan.size} | — |\n| Estimate (h) | ${forecast.refine.humanHours} | ${forecast.plan.humanHours} | 0 |`;
  const f = await candidateFixture('human', {
    body,
    projectDir: root,
    selection,
    comments,
    fields,
    estimate,
    cfg: {
      projectId: 'P_test',
      estimationRubricIssue: 1001,
      fieldIds: { size: 'F_size', estimate: 'F_estimate' },
    },
  });
  f.input.candidate.evidenceStore = { read: () => validateLocalEvidence(evidence) };
  return { ...f, evidence, root, forecast, selection };
}
