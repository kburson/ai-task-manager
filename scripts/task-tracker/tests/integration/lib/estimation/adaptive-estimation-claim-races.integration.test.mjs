// @story #1091
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildEstimationForecast } from '../../../../lib/estimation/forecast-model.mjs';
import { buildEstimationOutcome } from '../../../../lib/estimation/outcome-builder.mjs';
import { withProcessRecordClaim } from '../../../../lib/estimation/record-claim.mjs';
import { createBootstrapRubric } from '../../../../lib/estimation/rubric-model.mjs';
import {
  createAdaptivePlanRuntime,
  createEstimationOutcomeRuntime,
} from '../../../../lib/estimation/runtime-adapter.mjs';
import {
  createAitmRecordEnvelope,
  renderAitmRecord,
} from '../../../../lib/github-records/record-envelope.mjs';
import { buildPlannedAppendix } from '../../../../lib/refine-estimate-comment.mjs';
import {
  canonicalTestReceiptFixture,
  repeatedVerificationCommand,
} from '../../../fixtures/estimation-verification.mjs';

const repository = 'kburson/ai-task-manager';
const issue = 1091;
const rubricIssue = 9000;
const forecastId = '01J00000000000000000000960';
const outcomeId = '01J00000000000000000000961';
const rubricId = '01J00000000000000000000962';

function planInput() {
  return {
    schema: 'aitm.plan-estimation-input/v1',
    wbs: [
      {
        id: 'implementation',
        description: 'Implement the independently reviewable estimation change',
        baseHumanHours: 8,
        independentlyReviewable: true,
        signals: { modules: ['estimation'], dependencies: ['github-records'] },
      },
    ],
    testImpact: { lanes: ['unit'], isolation: 'test-sandbox', expectedMinutes: 1 },
    risks: ['Concurrent immutable record creation'],
    comparableIssueIds: [],
  };
}

function estimationFixture() {
  const rubric = createBootstrapRubric({ generatedAt: '2026-08-02T14:00:00.000Z' });
  const forecastPayload = buildEstimationForecast({
    issue,
    refine: { size: 'M', humanHours: 8 },
    planInput: planInput(),
    rubric: { recordId: rubricId, payload: rubric },
    comparableOutcomes: [],
  });
  const forecast = {
    recordType: 'estimation-forecast',
    recordId: forecastId,
    issue,
    createdAt: '2026-08-02T14:01:00.000Z',
    payload: forecastPayload,
  };
  const outcomePayload = buildEstimationOutcome({
    issue,
    forecast,
    timing: {
      stagesMs: { plan: 900_000, develop: 3_600_000, test: 900_000, review: 900_000 },
    },
    verification: [repeatedVerificationCommand()],
    diff: {
      filesChanged: 3,
      modules: ['estimation'],
      lanes: ['unit', 'sandbox'],
      dependencyBreadth: 1,
    },
    review: { fixCycles: 0 },
    cost: { avoidableProcessWasteHours: 0, drivers: [] },
  });
  return { rubric, forecast, outcomePayload };
}

function issueClaim({ key: _key, issue: issueNumber }, fn) {
  return withProcessRecordClaim({ key: `issue:${issueNumber}` }, fn);
}

test('two production close runtimes with the same pre-claim snapshot append one outcome', async () => {
  const verification = canonicalTestReceiptFixture({ issue });
  const { forecast } = estimationFixture();
  const records = [{ commentNodeId: 'IC_forecast', envelope: forecast }];
  let outsideReads = 0;
  let releaseOutsideReads;
  const bothOutside = new Promise((resolve) => {
    releaseOutsideReads = resolve;
  });
  let claimDepth = 0;
  let writes = 0;
  const recordIo = {
    withLogicalRecordClaim: async (claim, fn) =>
      issueClaim(claim, async () => {
        claimDepth += 1;
        try {
          return await fn();
        } finally {
          claimDepth -= 1;
        }
      }),
    listIssueRecords: async () => {
      if (claimDepth === 0) {
        outsideReads += 1;
        if (outsideReads === 2) releaseOutsideReads();
        await bothOutside;
      }
      return [...records];
    },
    write: async ({ envelope }) => {
      writes += 1;
      const record = { commentNodeId: `IC_outcome_${writes}`, envelope };
      records.push(record);
      return record;
    },
  };
  const deps = {
    recordIo,
    childOutcomeRecordIds: async () => [],
    readTimingCommentBody: async () => ({
      status: 'found',
      body: [
        '| 2026-08-02 10:00:00 -05:00 | plan:stopped | | | | | | <!-- row-sec: a=900 i=0 -->',
        '| 2026-08-02 10:15:00 -05:00 | develop:stopped | | | | | | <!-- row-sec: a=3600 i=0 -->',
        '| 2026-08-02 11:15:00 -05:00 | test:stopped | | | | | | <!-- row-sec: a=900 i=0 -->',
        '| 2026-08-02 11:30:00 -05:00 | review:stopped | | | | | | <!-- row-sec: a=900 i=0 -->',
      ].join('\n'),
    }),
    readDiffEvidence: async () => ({
      commitSha: verification.fingerprint.commitSha,
      filesChanged: 3,
      modules: ['estimation'],
      lanes: ['unit', 'sandbox'],
      dependencyBreadth: 1,
    }),
    buildVerificationFingerprint: () => verification.fingerprint,
  };
  const runtimes = [1, 2].map(() =>
    createEstimationOutcomeRuntime({ cfg: { repo: repository }, projectDir: '/fake', deps })
  );
  const results = await Promise.all(
    runtimes.map((runtime) =>
      runtime.ensure({ issueNumber: issue, forecastRecordId: forecastId, body: verification.body })
    )
  );

  assert.equal(outsideReads, 2);
  assert.equal(writes, 1);
  assert.deepEqual(results.map((result) => result.status).sort(), ['existing', 'written']);
});

test('two production Plan runtimes sharing a stale rubric generation append one successor', async () => {
  const { rubric, forecast, outcomePayload } = estimationFixture();
  const rubricRecords = [
    {
      commentNodeId: 'IC_rubric_root',
      envelope: {
        recordType: 'estimation-rubric',
        recordId: rubricId,
        issue: rubricIssue,
        createdAt: rubric.generatedAt,
        predecessor: null,
        supersedes: null,
        payload: rubric,
      },
    },
  ];
  const corpus = [
    { commentNodeId: 'IC_forecast', envelope: forecast },
    {
      commentNodeId: 'IC_outcome',
      envelope: {
        recordType: 'estimation-outcome',
        recordId: outcomeId,
        issue,
        createdAt: '2026-08-02T15:00:00.000Z',
        payload: outcomePayload,
      },
    },
  ];
  let writes = 0;
  const recordIo = {
    withLogicalRecordClaim: issueClaim,
    graphql: async () => {},
    listIssueRecords: async () => [...rubricRecords],
    write: async ({ envelope }) => {
      writes += 1;
      const record = { commentNodeId: `IC_rubric_${writes}`, envelope };
      rubricRecords.push(record);
      return record;
    },
  };
  const deps = {
    recordIo,
    graphql: recordIo.graphql,
    loadProjectFieldDefs: () => [],
    loadProjectEstimationCorpus: async () => [...corpus],
  };
  const runtimes = [1, 2].map(() =>
    createAdaptivePlanRuntime({
      cfg: { repo: repository, projectId: 'PVT_test', estimationRubricIssue: rubricIssue },
      deps,
    })
  );
  const results = await Promise.all(runtimes.map((runtime) => runtime.loadRubric()));

  assert.equal(writes, 1);
  assert.equal(rubricRecords.length, 2);
  assert.equal(results[0].recordId, results[1].recordId);
});

test('two production Plan authority runtimes with the same initial projection append one forecast', async () => {
  const { forecast } = estimationFixture();
  const forecastEnvelope = createAitmRecordEnvelope({
    recordType: 'estimation-forecast',
    repository,
    issue,
    payload: forecast.payload,
    actor: 'aitm/plan-estimate',
  });
  const cfg = {
    repo: repository,
    projectId: 'PVT_test',
    estimationRubricIssue: rubricIssue,
    kanbanFieldId: 'FIELD_status',
    fieldIds: { size: 'FIELD_size', estimate: 'FIELD_estimate' },
  };
  const plan = forecast.payload.plan;
  const refine = forecast.payload.refine;
  const board = { size: plan.size, estimate: plan.humanHours };
  let issueBody = `<!-- aitm-fields: {"schema":1,"values":{"size":"${plan.size}","estimate":${plan.humanHours}}} -->`;
  const refineBody = [
    '### 🛠 Refine estimate',
    '',
    `<!-- aitm-refined-estimate: ${issue} -->`,
    buildPlannedAppendix({
      current: { size: refine.size, estimate: refine.humanHours },
      planned: { size: plan.size, estimate: plan.humanHours },
      rationale: plan.rationale,
    }),
  ].join('\n');
  const recordComments = [];
  let writes = 0;
  const commentNode = (id, body) => ({
    __typename: 'IssueComment',
    id,
    databaseId: writes + 1,
    body,
    updatedAt: '2026-08-02T15:00:00Z',
    issue: { number: issue, repository: { nameWithOwner: repository } },
  });
  const graphql = async ({ query }) => {
    assert.match(query, /AitmEstimationProjection/);
    return {
      data: {
        repository: {
          issue: {
            body: issueBody,
            comments: {
              nodes: [commentNode('IC_refine', refineBody), ...recordComments],
              pageInfo: { hasNextPage: false },
            },
            projectItems: {
              nodes: [
                {
                  id: 'ITEM_1091',
                  project: { id: cfg.projectId },
                  fieldValues: {
                    nodes: [
                      { name: 'Plan', field: { id: cfg.kanbanFieldId } },
                      { name: board.size, field: { id: cfg.fieldIds.size } },
                      { number: board.estimate, field: { id: cfg.fieldIds.estimate } },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    };
  };
  const recordIo = {
    graphql,
    withLogicalRecordClaim: issueClaim,
    write: async ({ envelope }) => {
      writes += 1;
      const record = { commentNodeId: `IC_forecast_${writes}`, envelope };
      recordComments.push(commentNode(record.commentNodeId, renderAitmRecord({ envelope })));
      return record;
    },
  };
  const deps = {
    graphql,
    recordIo,
    loadProjectFieldDefs: () => [
      { key: 'size', type: 'single_select' },
      { key: 'estimate', type: 'number' },
    ],
    mutateIssueBody: async ({ mutate }) => {
      issueBody = mutate(issueBody);
      return { status: 'ok', body: issueBody };
    },
  };
  const runtimes = [1, 2].map(() => createAdaptivePlanRuntime({ cfg, deps }));
  const results = await Promise.all(
    runtimes.map((runtime) =>
      runtime.applyAuthority({ issueNumber: issue, refine, forecastEnvelope })
    )
  );

  assert.equal(writes, 1);
  assert.equal(results[0].forecastRecordId, results[1].forecastRecordId);
  assert.equal(results[0].forecastRecordId, forecastEnvelope.recordId);
});
