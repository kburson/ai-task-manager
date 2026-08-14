// @story #1091
// @story #1160
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildEstimationForecast } from '../../../../../task-tracker/lib/estimation/forecast-model.mjs';
import { buildEstimationOutcome } from '../../../../../task-tracker/lib/estimation/outcome-builder.mjs';
import { ensureEstimationOutcome } from '../../../../../task-tracker/lib/estimation/outcome-writer.mjs';
import {
  applyPlanEstimateAuthority,
  executeAdaptivePlanEstimate,
} from '../../../../../task-tracker/lib/estimation/plan-estimate-authority.mjs';
import { writeEstimationRecord } from '../../../../../task-tracker/lib/estimation/renderers.mjs';
import { createBootstrapRubric } from '../../../../../task-tracker/lib/estimation/rubric-model.mjs';
import { loadOrRefreshRubric } from '../../../../../task-tracker/lib/estimation/rubric-refresh.mjs';
import {
  createAdaptivePlanRuntime,
  createEstimationOutcomeRuntime,
} from '../../../../../task-tracker/lib/estimation/runtime-adapter.mjs';
import {
  createAitmRecordEnvelope,
  createRecordId,
  renderAitmRecord,
} from '../../../../../task-tracker/lib/github-records/record-envelope.mjs';
import { buildPlannedAppendix } from '../../../../../task-tracker/lib/refine-estimate-comment.mjs';
import {
  canonicalTestReceiptFixture,
  repeatedVerificationCommand,
} from '../../../../fixtures/estimation-verification.mjs';
import { assertPublishedForecastOnHalfHourGrid } from '../../../../fixtures/estimation-grid.mjs';

const repository = 'kburson/ai-task-manager';
const rubricIssue = 9000;
const firstIssue = 1091;
const secondIssue = 1094;
const RANDOM = (length) => Buffer.alloc(length, 0x35);
let idClock = 1_722_604_800_000;
const nextId = () => createRecordId({ nowMs: idClock++, randomBytesFn: RANDOM });
function envelope({ recordType, issue, payload, predecessor = null, supersedes = null, actor }) {
  return createAitmRecordEnvelope({
    recordType,
    repository,
    issue,
    payload,
    predecessor,
    supersedes,
    actor,
    createdAt: new Date(idClock).toISOString(),
    recordId: nextId(),
    grantId: nextId(),
  });
}

function fake1070Transport() {
  const comments = new Map();
  let commentSequence = 0;
  const rest = {
    async createIssueComment({ repository: actualRepository, issue, body }) {
      assert.equal(actualRepository, repository);
      const id = `IC_adaptive_${++commentSequence}`;
      comments.set(id, { id, issue, body });
      return { node_id: id };
    },
  };
  const graphql = async ({ variables }) => ({
    data: {
      nodes: variables.ids.map((id) => {
        const comment = comments.get(id);
        return {
          __typename: 'IssueComment',
          id,
          body: comment.body,
          updatedAt: '2026-08-02T15:00:00Z',
          issue: { number: comment.issue, repository: { nameWithOwner: repository } },
        };
      }),
    },
  });
  return { rest, graphql, comments };
}

function authorityHarness({ issue, transport, recordLog }) {
  const state = {
    lifecycleState: 'plan',
    refineAppendix: null,
    board: { size: 'M', estimate: 8 },
    bodyFields: { size: 'M', estimate: 8 },
    forecasts: [],
    readyForecastRecordId: null,
    frozenForecastRecordId: null,
  };
  return {
    state,
    deps: {
      readProjection: async () => structuredClone(state),
      writeRefineAppendix: async ({ refine, plan }) => {
        state.refineAppendix = { refine, plan };
      },
      writeBoardEstimate: async ({ estimate }) => {
        state.board.estimate = estimate;
      },
      writeBoardSize: async ({ size }) => {
        state.board.size = size;
      },
      writeBodyFields: async ({ estimate, size }) => {
        state.bodyFields = { estimate, size };
      },
      writeForecast: async ({ envelope: recordEnvelope }) => {
        const written = await writeEstimationRecord({
          envelope: recordEnvelope,
          repository,
          issue,
          ...transport,
        });
        recordLog.push(written);
        state.forecasts.push({
          recordId: written.envelope.recordId,
          payloadHash: written.envelope.payloadHash,
          commentNodeId: written.commentNodeId,
          supersededBy: null,
        });
      },
      writeForecastReadyMarker: async ({ recordId }) => {
        state.readyForecastRecordId = recordId;
        state.frozenForecastRecordId = recordId;
      },
    },
  };
}

function planInput() {
  return {
    schema: 'aitm.plan-estimation-input/v1',
    wbs: [
      {
        id: 'implementation',
        description: 'Implement the independently reviewable estimation change',
        baseHumanHours: 10,
        independentlyReviewable: true,
        signals: { modules: ['estimation'], dependencies: ['github-records'] },
      },
    ],
    testImpact: { lanes: ['unit'], isolation: 'test-sandbox', expectedMinutes: 0 },
    risks: ['Bootstrap cohort is initially empty'],
    comparableIssueIds: [firstIssue],
  };
}

test('completed outcome deterministically updates the next rubric and AI forecast through #1070 read-backs', async () => {
  const transport = fake1070Transport();
  const records = [];
  const bootstrapPayload = createBootstrapRubric({ generatedAt: '2026-08-02T14:00:00.000Z' });
  const bootstrapEnvelope = envelope({
    recordType: 'estimation-rubric',
    issue: rubricIssue,
    payload: bootstrapPayload,
    actor: 'aitm/rubric-refresh',
  });
  const bootstrap = await writeEstimationRecord({
    envelope: bootstrapEnvelope,
    repository,
    issue: rubricIssue,
    ...transport,
  });
  records.push(bootstrap);

  const firstAuthority = authorityHarness({ issue: firstIssue, transport, recordLog: records });
  const first = await executeAdaptivePlanEstimate({
    issueNumber: firstIssue,
    planInput: planInput(),
    cfg: { repo: repository, estimationRubricIssue: rubricIssue },
    deps: {
      readRefineEstimate: async () => ({ size: 'M', humanHours: 8 }),
      loadRubric: async () => ({
        recordId: bootstrapEnvelope.recordId,
        payload: bootstrapPayload,
      }),
      listComparableOutcomes: async () => [],
      buildForecast: buildEstimationForecast,
      createForecastEnvelope: ({ issue, payload }) =>
        envelope({
          recordType: 'estimation-forecast',
          issue,
          payload,
          actor: 'aitm/plan-estimate',
        }),
      applyAuthority: (input) =>
        applyPlanEstimateAuthority({ ...input, deps: firstAuthority.deps }),
    },
  });
  const firstForecast = records.find(
    (record) => record.envelope.recordId === first.forecastRecordId
  ).envelope;
  assertPublishedForecastOnHalfHourGrid(firstForecast.payload);
  assert.equal(firstAuthority.state.board.estimate, 11.5);
  assert.equal(firstAuthority.state.bodyFields.estimate, 11.5);
  assert.equal(firstAuthority.state.readyForecastRecordId, firstForecast.recordId);

  const outcomePayload = buildEstimationOutcome({
    issue: firstIssue,
    forecast: firstForecast,
    timing: {
      stagesMs: { plan: 900_000, develop: 9_000_000, test: 900_000, review: 900_000 },
    },
    verification: [repeatedVerificationCommand()],
    diff: {
      filesChanged: 8,
      modules: ['estimation'],
      lanes: ['unit'],
      dependencyBreadth: 1,
    },
    review: { fixCycles: 1 },
    cost: {
      avoidableProcessWasteHours: 0.5,
      drivers: [{ kind: 'redundant-verification', hours: 0.5 }],
    },
  });
  const outcomeResult = await ensureEstimationOutcome({
    issue: firstIssue,
    forecast: firstForecast,
    outcomePayload,
    deps: {
      listOutcomeRecords: async () =>
        records.filter((record) => record.envelope.recordType === 'estimation-outcome'),
      createOutcomeEnvelope: ({ issue, payload }) =>
        envelope({
          recordType: 'estimation-outcome',
          issue,
          payload,
          actor: 'aitm/close',
        }),
      writeOutcome: async ({ issue, envelope: recordEnvelope }) => {
        const written = await writeEstimationRecord({
          envelope: recordEnvelope,
          repository,
          issue,
          ...transport,
        });
        records.push(written);
        return written;
      },
    },
  });
  assert.equal(outcomeResult.status, 'written');
  const outcomeRecord = records.find(
    (record) => record.envelope.recordId === outcomeResult.recordId
  );

  const refreshed = await loadOrRefreshRubric({
    cfg: { repo: repository, estimationRubricIssue: rubricIssue },
    rubricIssueNumber: rubricIssue,
    through: '2026-08-02T16:00:00.000Z',
    deps: {
      listRubricRecords: async () =>
        records.filter((record) => record.envelope.recordType === 'estimation-rubric'),
      listEligibleOutcomes: async () => [
        {
          recordId: outcomeRecord.envelope.recordId,
          createdAt: outcomeRecord.envelope.createdAt,
          payload: outcomeRecord.envelope.payload,
          forecastPayload: firstForecast.payload,
        },
      ],
      writeRubric: async ({ issue, payload, predecessorRecordId }) => {
        const recordEnvelope = envelope({
          recordType: 'estimation-rubric',
          issue,
          payload,
          predecessor: predecessorRecordId,
          supersedes: predecessorRecordId,
          actor: 'aitm/rubric-refresh',
        });
        const written = await writeEstimationRecord({
          envelope: recordEnvelope,
          repository,
          issue,
          ...transport,
        });
        records.push(written);
        return written;
      },
    },
  });
  assert.equal(refreshed.rubric.cohort[0].outcomeRecordId, outcomeResult.recordId);
  assert.equal(refreshed.rubric.workflowDiagnostics.avoidableProcessWasteHours, 0.5);
  assert.equal(refreshed.rubric.accuracy.refineToPlan.maeHours, 3.5);

  const secondForecast = buildEstimationForecast({
    issue: secondIssue,
    refine: { size: 'M', humanHours: 8 },
    planInput: planInput(),
    rubric: {
      recordId: records.at(-1).envelope.recordId,
      payload: refreshed.rubric,
    },
    comparableOutcomes: [
      {
        recordId: outcomeRecord.envelope.recordId,
        payload: outcomeRecord.envelope.payload,
      },
    ],
  });
  assert.ok(
    secondForecast.plan.humanHours <= firstForecast.payload.plan.humanHours,
    'avoidable rerun waste must never inflate the next human Plan estimate'
  );
  assert.notEqual(secondForecast.ai.p50EngagedHours, firstForecast.payload.ai.p50EngagedHours);
  assert.equal(secondForecast.comparableIssues[0].outcomeRecordId, outcomeResult.recordId);
  assert.ok(transport.comments.size >= 4, 'every durable write completed a #1070 read-back');
});

test('default close runtime builds and read-backs the frozen forecast outcome before Done', async () => {
  const verification = canonicalTestReceiptFixture({ issue: firstIssue });
  const rubricPayload = createBootstrapRubric({ generatedAt: '2026-08-02T14:00:00.000Z' });
  const rubricRecordId = nextId();
  const forecastPayload = buildEstimationForecast({
    issue: firstIssue,
    refine: { size: 'M', humanHours: 8 },
    planInput: planInput(),
    rubric: { recordId: rubricRecordId, payload: rubricPayload },
    comparableOutcomes: [],
  });
  const forecastEnvelope = envelope({
    recordType: 'estimation-forecast',
    issue: firstIssue,
    payload: forecastPayload,
    actor: 'aitm/plan-estimate',
  });
  const written = [];
  let insideOutcomeClaim = false;
  const outcomeReadLocations = [];
  const runtime = createEstimationOutcomeRuntime({
    cfg: { repo: repository },
    projectDir: '/tmp/fake-adaptive-project',
    deps: {
      recordIo: {
        withLogicalRecordClaim: async (_claim, fn) => {
          insideOutcomeClaim = true;
          try {
            return await fn();
          } finally {
            insideOutcomeClaim = false;
          }
        },
        listIssueRecords: async () => {
          outcomeReadLocations.push(insideOutcomeClaim);
          return [{ commentNodeId: 'IC_frozen_forecast', envelope: forecastEnvelope }, ...written];
        },
        write: async ({ envelope: outcomeEnvelope }) => {
          const record = { commentNodeId: 'IC_close_outcome', envelope: outcomeEnvelope };
          written.push(record);
          return record;
        },
      },
      readTimingCommentBody: async () => ({
        status: 'found',
        body: [
          '| 2026-08-02 10:00:00 -05:00 | plan:stopped | | | | | | <!-- row-sec: a=1800 i=0 -->',
          '| 2026-08-02 10:30:00 -05:00 | develop:stopped | | | | | | <!-- row-sec: a=3600 i=0 -->',
          '| 2026-08-02 11:30:00 -05:00 | test:stopped | | | | | | <!-- row-sec: a=900 i=0 -->',
          '| 2026-08-02 11:45:00 -05:00 | review:stopped | | | | | | <!-- row-sec: a=600 i=0 -->',
        ].join('\n'),
      }),
      readDiffEvidence: async () => ({
        commitSha: 'd'.repeat(40),
        verificationSha: verification.fingerprint.commitSha,
        filesChanged: 7,
        modules: ['estimation'],
        lanes: ['unit', 'integration'],
        dependencyBreadth: 2,
      }),
      buildVerificationFingerprint: () => verification.fingerprint,
      childOutcomeRecordIds: async () => [],
    },
  });

  const result = await runtime.ensure({
    issueNumber: firstIssue,
    forecastRecordId: forecastEnvelope.recordId,
    body: verification.body,
  });
  assert.equal(result.status, 'written');
  assert.equal(result.commentNodeId, 'IC_close_outcome');
  assert.equal(written[0].envelope.payload.forecastRecordId, forecastEnvelope.recordId);
  assert.equal(written[0].envelope.payload.actual.engagedHours, 1.9167);
  assert.equal(written[0].envelope.payload.costClassification.necessaryHours, 0);
  assert.equal(written[0].envelope.payload.costClassification.unclassifiedHours, 1.9167);
  assert.deepEqual(outcomeReadLocations, [false, true]);
});

test('close rejects a ready forecast that a later active forecast superseded', async () => {
  const rubricPayload = createBootstrapRubric({ generatedAt: '2026-08-02T14:00:00.000Z' });
  const priorPayload = buildEstimationForecast({
    issue: firstIssue,
    refine: { size: 'M', humanHours: 8 },
    planInput: planInput(),
    rubric: { recordId: nextId(), payload: rubricPayload },
    comparableOutcomes: [],
  });
  const prior = envelope({
    recordType: 'estimation-forecast',
    issue: firstIssue,
    payload: priorPayload,
    actor: 'aitm/plan-estimate',
  });
  const successor = envelope({
    recordType: 'estimation-forecast',
    issue: firstIssue,
    payload: { ...priorPayload, supersedesForecastRecordId: prior.recordId },
    predecessor: prior.recordId,
    supersedes: prior.recordId,
    actor: 'aitm/plan-estimate',
  });
  const runtime = createEstimationOutcomeRuntime({
    cfg: { repo: repository },
    projectDir: '/tmp/fake-adaptive-project',
    deps: {
      recordIo: {
        listIssueRecords: async () => [
          { commentNodeId: 'IC_prior', envelope: prior },
          { commentNodeId: 'IC_successor', envelope: successor },
        ],
      },
      childOutcomeRecordIds: async () => [],
    },
  });

  await assert.rejects(
    runtime.ensure({ issueNumber: firstIssue, forecastRecordId: prior.recordId, body: '' }),
    /estimation-runtime:forecast-lineage/
  );
});

test('default close runtime emits a child-referencing epic outcome without using a legacy parent forecast', async () => {
  const written = [];
  const legacyParentForecastId = '01J00000000000000000000803';
  const runtime = createEstimationOutcomeRuntime({
    cfg: { repo: repository },
    projectDir: '/tmp/fake-adaptive-project',
    deps: {
      recordIo: {
        listIssueRecords: async () => [
          {
            commentNodeId: 'IC_legacy_parent_forecast',
            envelope: {
              recordType: 'estimation-forecast',
              recordId: legacyParentForecastId,
              payload: { issue: 1067 },
            },
          },
        ],
        write: async ({ envelope: outcomeEnvelope }) => {
          const record = { commentNodeId: 'IC_epic_outcome', envelope: outcomeEnvelope };
          written.push(record);
          return record;
        },
      },
      readTimingCommentBody: async () => ({
        status: 'found',
        body: [
          '| 2026-08-02 10:00:00 -05:00 | plan:stopped | | | | | | <!-- row-sec: a=1800 i=0 -->',
          '| 2026-08-02 10:30:00 -05:00 | develop:stopped | | | | | | <!-- row-sec: a=1800 i=0 -->',
          '| 2026-08-02 11:00:00 -05:00 | test:stopped | | | | | | <!-- row-sec: a=300 i=0 -->',
          '| 2026-08-02 11:05:00 -05:00 | review:stopped | | | | | | <!-- row-sec: a=300 i=0 -->',
        ].join('\n'),
      }),
      readDiffEvidence: async () => ({
        filesChanged: 0,
        modules: ['epic-orchestration'],
        lanes: [],
        dependencyBreadth: 0,
      }),
      childOutcomeRecordIds: async () => [
        '01J00000000000000000000801',
        '01J00000000000000000000802',
      ],
    },
  });

  const result = await runtime.ensure({
    issueNumber: 1067,
    forecastRecordId: legacyParentForecastId,
    body: 'epic body',
  });
  assert.equal(result.status, 'written');
  assert.equal(written[0].envelope.payload.kind, 'epic-orchestration');
  assert.equal(written[0].envelope.payload.forecastRecordId, null);
  assert.deepEqual(written[0].envelope.payload.landscape.childOutcomeRecordIds, [
    '01J00000000000000000000801',
    '01J00000000000000000000802',
  ]);
});

test('production Plan runtime converges board, body, history, forecast, and ready marker with fake GitHub', async () => {
  const cfg = {
    repo: repository,
    projectId: 'PVT_adaptive',
    estimationRubricIssue: rubricIssue,
    kanbanFieldId: 'FIELD_status',
    fieldIds: { size: 'FIELD_size', estimate: 'FIELD_estimate' },
  };
  const board = { size: 'M', estimate: 8 };
  let issueBody =
    '## Story\n\n<!-- aitm-fields: {"schema":1,"values":{"size":"M","estimate":8}} -->\n';
  let refineBody =
    '### 🛠 Refine estimate\n\n<!-- aitm-refined-estimate: 1091 -->\n\n| Field | Value | Rationale |\n|---|---|---|\n| Size | M | Provisional scope |\n| Estimate | 8h | Provisional scope |\n';
  const recordComments = [];
  const parsedRecords = [];
  let insideRecordClaim = false;
  const rubricReadLocations = [];
  const corpusReadLocations = [];
  const commentNode = (id, issue, body) => ({
    __typename: 'IssueComment',
    id,
    databaseId: Number(id.replace(/\D/g, '')) || 1,
    body,
    updatedAt: '2026-08-02T15:00:00Z',
    issue: { number: issue, repository: { nameWithOwner: repository } },
  });
  const graphql = async ({ query }) => {
    if (query.includes('AitmEstimationCorpus')) {
      corpusReadLocations.push(insideRecordClaim);
      return {
        data: {
          node: {
            items: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
          },
        },
      };
    }
    if (query.includes('AitmEstimationProjection')) {
      return {
        data: {
          repository: {
            issue: {
              body: issueBody,
              comments: {
                nodes: [
                  commentNode('IC_refine_1', firstIssue, refineBody),
                  ...recordComments.filter((comment) => comment.issue.number === firstIssue),
                ],
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
    }
    throw new Error('unexpected GraphQL query');
  };
  const recordIo = {
    graphql,
    withLogicalRecordClaim: async (_claim, fn) => {
      insideRecordClaim = true;
      try {
        return await fn();
      } finally {
        insideRecordClaim = false;
      }
    },
    listIssueRecords: async ({ issue }) => {
      if (issue === rubricIssue) rubricReadLocations.push(insideRecordClaim);
      return parsedRecords.filter((record) => record.envelope.issue === issue);
    },
    write: async ({ envelope: recordEnvelope }) => {
      const commentNodeId = `IC_record_${parsedRecords.length + 1}`;
      const record = { commentNodeId, envelope: recordEnvelope };
      parsedRecords.push(record);
      recordComments.push(
        commentNode(
          commentNodeId,
          recordEnvelope.issue,
          renderAitmRecord({ envelope: recordEnvelope })
        )
      );
      return record;
    },
  };
  const runtime = createAdaptivePlanRuntime({
    cfg,
    deps: {
      recordIo,
      graphql,
      loadProjectFieldDefs: () => [
        { key: 'size', type: 'single_select' },
        { key: 'estimate', type: 'number' },
      ],
      upsertPlannedEstimate: async ({ refine, plan, rationale }) => {
        refineBody = `${refineBody.trimEnd()}${buildPlannedAppendix({
          current: refine,
          planned: plan,
          rationale,
        })}\n`;
        return { status: 'updated' };
      },
      fieldOptionMap: async () => ({ FIELD_size: { XS: 'XS', S: 'S', M: 'M', L: 'L', XL: 'XL' } }),
      writeProjectFieldValue: async ({ fieldId, value }) => {
        if (fieldId === cfg.fieldIds.size) board.size = value.singleSelectOptionName;
        if (fieldId === cfg.fieldIds.estimate) board.estimate = value.number;
        return true;
      },
      mutateIssueBody: async ({ mutate }) => {
        issueBody = mutate(issueBody);
        return { status: 'ok', body: issueBody };
      },
    },
  });

  const result = await executeAdaptivePlanEstimate({
    issueNumber: firstIssue,
    planInput: planInput(),
    cfg,
    deps: runtime,
  });

  assert.equal(result.status, 'converged');
  assert.equal(board.estimate, 11.5);
  assert.match(refineBody, /\| Estimate \(h\) \| 8 \| 11\.5 \|/);
  assert.match(issueBody, /"estimate":11\.5/);
  assert.match(issueBody, new RegExp(result.forecastRecordId));
  const forecastRecord = parsedRecords.find(
    (record) => record.envelope.recordType === 'estimation-forecast'
  );
  assertPublishedForecastOnHalfHourGrid(forecastRecord.envelope.payload);
  assert.equal(
    parsedRecords.filter((r) => r.envelope.recordType === 'estimation-rubric').length,
    1
  );
  assert.equal(
    parsedRecords.filter((r) => r.envelope.recordType === 'estimation-forecast').length,
    1
  );
  assert.deepEqual(corpusReadLocations, [true]);
  assert.deepEqual(rubricReadLocations, [true]);
});

test('production Plan projection paginates raw comments so an older Refine baseline remains readable', async () => {
  const cfg = {
    repo: repository,
    projectId: 'PVT_pagination',
    estimationRubricIssue: rubricIssue,
    kanbanFieldId: 'FIELD_status',
    fieldIds: { size: 'FIELD_size', estimate: 'FIELD_estimate' },
  };
  const refineBody = [
    '### 🛠 Refine estimate',
    '',
    '<!-- aitm-refined-estimate: 1091 -->',
    '',
    '### Planned Estimate',
    '',
    '| Field | Refine | Plan | Δ |',
    '|---|---|---|---|',
    '| Size | M | L | changed |',
    '| Estimate (h) | 8 | 12 | +4 |',
  ].join('\n');
  const node = (id, body) => ({
    __typename: 'IssueComment',
    id,
    databaseId: 1,
    body,
    updatedAt: '2026-08-02T15:00:00Z',
    issue: { number: firstIssue, repository: { nameWithOwner: repository } },
  });
  const graphql = async ({ query, variables }) => {
    if (query.includes('AitmEstimationProjectionComments')) {
      assert.equal(variables.after, 'CURSOR_1');
      return {
        data: {
          repository: {
            issue: {
              number: firstIssue,
              repository: { nameWithOwner: repository },
              comments: {
                nodes: [node('IC_page_2', refineBody)],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      };
    }
    if (query.includes('AitmEstimationProjection')) {
      return {
        data: {
          repository: {
            issue: {
              body: '<!-- aitm-fields: {"schema":1,"values":{"size":"M","estimate":8}} -->',
              comments: {
                nodes: [node('IC_page_1', 'ordinary newer comment')],
                pageInfo: { hasNextPage: true, endCursor: 'CURSOR_1' },
              },
              projectItems: {
                nodes: [
                  {
                    id: 'ITEM_1091',
                    project: { id: cfg.projectId },
                    fieldValues: {
                      nodes: [
                        { name: 'Plan', field: { id: cfg.kanbanFieldId } },
                        { name: 'M', field: { id: cfg.fieldIds.size } },
                        { number: 8, field: { id: cfg.fieldIds.estimate } },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      };
    }
    throw new Error(`unexpected query: ${query}`);
  };
  const runtime = createAdaptivePlanRuntime({
    cfg,
    deps: {
      graphql,
      recordIo: { graphql, listIssueRecords: async () => [] },
      loadProjectFieldDefs: () => [],
    },
  });

  assert.deepEqual(await runtime.readRefineEstimate({ issueNumber: firstIssue }), {
    size: 'M',
    humanHours: 8,
  });
});

test('a new Plan process reuses an equivalent active forecast left before the ready marker', async () => {
  const cfg = {
    repo: repository,
    projectId: 'PVT_retry',
    estimationRubricIssue: rubricIssue,
    kanbanFieldId: 'FIELD_status',
    fieldIds: { size: 'FIELD_size', estimate: 'FIELD_estimate' },
  };
  const rubric = createBootstrapRubric({ generatedAt: '2026-08-02T14:00:00.000Z' });
  const forecastPayload = buildEstimationForecast({
    issue: firstIssue,
    refine: { size: 'M', humanHours: 8 },
    planInput: planInput(),
    rubric: { recordId: '01J00000000000000000000900', payload: rubric },
    comparableOutcomes: [],
  });
  const existing = envelope({
    recordType: 'estimation-forecast',
    issue: firstIssue,
    payload: forecastPayload,
    actor: 'aitm/plan-estimate',
  });
  const comment = {
    __typename: 'IssueComment',
    id: 'IC_existing_forecast',
    databaseId: 1,
    body: renderAitmRecord({ envelope: existing }),
    updatedAt: '2026-08-02T15:00:00Z',
    issue: { number: firstIssue, repository: { nameWithOwner: repository } },
  };
  const graphql = async ({ query }) => {
    assert.match(query, /AitmEstimationProjection/);
    return {
      data: {
        repository: {
          issue: {
            body: '<!-- aitm-fields: {"schema":1,"values":{"size":"M","estimate":8}} -->',
            comments: { nodes: [comment], pageInfo: { hasNextPage: false, endCursor: null } },
            projectItems: {
              nodes: [
                {
                  id: 'ITEM_1091',
                  project: { id: cfg.projectId },
                  fieldValues: {
                    nodes: [
                      { name: 'Plan', field: { id: cfg.kanbanFieldId } },
                      { name: 'M', field: { id: cfg.fieldIds.size } },
                      { number: 8, field: { id: cfg.fieldIds.estimate } },
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
  const runtime = createAdaptivePlanRuntime({
    cfg,
    deps: {
      graphql,
      recordIo: { graphql, listIssueRecords: async () => [] },
      loadProjectFieldDefs: () => [],
    },
  });

  await runtime.readRefineEstimate({ issueNumber: firstIssue });
  const resumed = runtime.createForecastEnvelope({
    repository,
    issue: firstIssue,
    payload: forecastPayload,
  });
  assert.equal(resumed.recordId, existing.recordId);
  assert.equal(resumed.payloadHash, existing.payloadHash);
});
