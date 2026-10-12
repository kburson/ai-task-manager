// @story #1988 — actual cancellation composition and durable recovery.
import {
  estimationIssueBody,
  estimationPublicationFixture,
  estimationObservation,
} from '../../../fixtures/estimation-publication.mjs';
import { ensureIssueFieldDb, parseIssueFieldDb } from '../../../../task-tracker/issue-field-db.mjs';
import { readDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';
import { collectDecompositionCommentProposals } from '../../../../task-tracker/lib/decomposition-authority.mjs';
import { buildPlannedAppendix } from '../../../../task-tracker/lib/refine-estimate-comment.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { runCancelPlan } from '../../../../task-tracker/verbs/cancel-plan.mjs';
import { stampRefinementSnapshot } from '../../../../task-tracker/lib/refinement-snapshot.mjs';
import { FORECAST_SCHEMA } from '../../../../task-tracker/lib/estimation/forecast-record.mjs';
import {
  createAitmRecordEnvelope,
  renderAitmRecord,
} from '../../../../task-tracker/lib/github-records/record-envelope.mjs';
const TS = '2026-08-12T12:00:00.000Z';

function cancellationHarness({
  hours = 25,
  planSize = 'M',
  forecast = false,
  commentPadding = '',
  bodyPadding = '',
  fail = {},
} = {}) {
  const cfg = {
    repo: 'o/r',
    projectId: 'PVT_a',
    fieldIds: { estimate: 'EST', size: 'SIZE', priority: 'PRIORITY', rank: 'RANK' },
  };
  const definitions = [
    { key: 'estimate', name: 'Estimate', type: 'number' },
    { key: 'size', name: 'Size', type: 'single_select' },
    { key: 'priority', name: 'Priority', type: 'single_select' },
    { key: 'rank', name: 'Rank', type: 'number' },
  ];
  let body = stampRefinementSnapshot(
    estimationIssueBody({ priority: 'P1', estimate: hours, size: 'M', rank: 3 }) +
      '\n<!-- aitm-refinement-rationale: ' +
      JSON.stringify({
        size: 'M',
        estimate: String(hours),
        priority: 'p1',
        rank: 3,
        rationale: 'current scope',
      }) +
      ' -->\n<!-- aitm-last-known-state state="plan" ts="2026-10-11T12:00:00Z" -->\n',
    { labels: ['enhancement'], ts: TS }
  );
  body =
    ensureIssueFieldDb(
      body,
      definitions,
      { estimate: 10, size: planSize },
      { overrideKeys: ['estimate', 'size'] }
    ).body + bodyPadding;
  let state = 'plan',
    board = { priority: 'P1', estimate: 10, size: planSize, rank: 3 },
    comment = {
      id: 99,
      node_id: 'IC_refine',
      body:
        '<!-- aitm-refined-estimate: 1987 -->\n### Refine estimate\n' +
        commentPadding +
        buildPlannedAppendix({
          current: { estimate: hours, size: 'M' },
          planned: { estimate: 10, size: planSize },
          rationale: 'current Plan',
        }),
    };
  let forecastComment = null;
  if (forecast) {
    const payload = {
      schema: FORECAST_SCHEMA,
      issue: 1987,
      lifecycleState: 'plan',
      refine: { size: 'M', humanHours: hours },
      plan: { size: planSize, humanHours: 10, deltaHours: 10 - hours, rationale: 'current Plan' },
      ai: {
        p50EngagedHours: 5,
        p80EngagedHours: 10,
        stages: { plan: 1, develop: 2, test: 1, review: 1 },
      },
      wbs: [
        {
          id: 'delivery',
          description: 'Deliver current plan',
          humanHours: 10,
          signals: ['estimation'],
        },
      ],
      comparableIssues: [],
      rubric: {
        recordId: '01J00000000000000000000703',
        version: 1,
        cohortSize: 0,
        confidence: 0.1,
      },
      testPlan: { impactedLanes: ['unit'], isolation: 'provider fixture', expectedMinutes: 0 },
      risks: [],
      recommendation: { action: 'proceed', reason: 'Current plan' },
      supersedesForecastRecordId: null,
    };
    const envelope = createAitmRecordEnvelope({
      recordType: 'estimation-forecast',
      repository: cfg.repo,
      issue: 1987,
      payload,
      actor: 'aitm/plan-estimate',
      recordId: '01J00000000000000000000702',
      grantId: '01J00000000000000000000704',
      createdAt: '2026-10-11T12:00:00.000Z',
    });
    forecastComment = { id: 100, node_id: 'IC_forecast', body: renderAitmRecord({ envelope }) };
    body += '\n<!-- aitm-estimation-forecast-ready record-id="' + envelope.recordId + '" -->\n';
  }
  const counts = { body: 0, board: 0, patch: 0, move: 0, projection: 0 };
  const subject = {
    repository: 'o/r',
    issue: 1987,
    projectId: 'PVT_a',
    projectItemId: 'ITEM_1987',
  };
  const fixture = estimationPublicationFixture({
    cfg,
    issueNumber: 1987,
    getBody: () => body,
    setBody: (b) => {
      counts.projection++;
      if (fail.completeProjection && readDecompositionRecords(b).publication?.status === 'complete')
        throw new Error('final projection unavailable');
      body = b;
      if (
        fail.foreign &&
        readDecompositionRecords(body).publication?.effects.find((e) => e.id === 'recovery')
          ?.status === 'confirmed'
      ) {
        board.estimate = 99;
        fail.foreign = false;
      }
    },
    getProject: () => board,
    getForecast: () => {
      const parsed = collectDecompositionCommentProposals({
        comments: [{ id: comment.node_id, body: comment.body }],
        subject,
        body,
        published: null,
        board,
        bodyFields: parseIssueFieldDb(body).values,
      });
      return estimationObservation({
        estimate: null,
        size: null,
        recordId: null,
        proposals: parsed.proposals,
        observedProjections: [],
      });
    },
  });
  if (forecast) {
    delete fixture.decomposition.readForecast;
    fixture.decomposition.forecast = {
      graphql: async () => ({
        data: {
          repository: {
            issue: {
              number: 1987,
              repository: { nameWithOwner: cfg.repo },
              body,
              projectItems: {
                nodes: [
                  {
                    id: 'ITEM_1987',
                    project: { id: cfg.projectId },
                    fieldValues: {
                      nodes: [
                        { number: board.estimate, field: { id: 'EST' } },
                        { name: board.size, field: { id: 'SIZE' } },
                      ],
                      pageInfo: { hasNextPage: false },
                    },
                  },
                ],
                pageInfo: { hasNextPage: false },
              },
              comments: {
                nodes: [comment, forecastComment].map((c) => ({
                  __typename: 'IssueComment',
                  id: c.node_id,
                  body: c.body,
                  author: { login: 'fixture' },
                  createdAt: '2026-10-11T12:00:00Z',
                  updatedAt: '2026-10-11T12:00:00Z',
                  issue: { number: 1987, repository: { nameWithOwner: cfg.repo } },
                })),
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      }),
    };
  }
  const assertOwner = () => {
    const pub = readDecompositionRecords(body).publication;
    assert.equal(pub?.status, 'pending');
    assert.equal(pub.writerId, 'cancel-plan');
  };
  const args = {
    cfg,
    issueNumber: 1987,
    reason: 'restart planning',
    now: () => TS,
    deps: {
      ...fixture,
      assertBound: () => {},
      fetchIssueBody: async () => ({ body, labels: ['enhancement'] }),
      getLiveState: async () => state,
      fetchBoardFields: async () => board,
      loadProjectFieldDefs: () => definitions,
      restoreBoardFields: async ({ fields }) => {
        assertOwner();
        counts.board++;
        if (fail.boardParts && fields.estimate === hours) {
          board.size = fields.size;
          fail.body = true;
          throw new Error('Estimate unavailable after Size write');
        }
        board = { ...fields };
        if (fail.board) throw new Error('board outcome unknown');
      },
      plannedEstimate: {
        ...fixture,
        listComments: async () => (forecastComment ? [comment, forecastComment] : [comment]),
        patchComment: async ({ body: next }) => {
          assertOwner();
          counts.patch++;
          if (fail.patch && counts.patch === 2) throw new Error('compensation unavailable');
          comment = { ...comment, body: next };
          if (fail.patch) throw new Error('patch outcome unknown');
        },
      },
      mutateIssueBody: async ({ mutate }) => {
        assertOwner();
        counts.body++;
        const next = mutate(body);
        if (fail.invalidate && next.includes('aitm-plan-cancelled')) {
          fail.body = true;
          throw new Error('invalidation outcome unknown');
        }
        if (fail.body) throw new Error('body unavailable');
        body = next;
        return { status: 'ok' };
      },
      runMoveState: async () => {
        assertOwner();
        counts.move++;
        state = 'ready-for-plan';
        body = body.replace('state="plan"', 'state="ready-for-plan"');
        return 0;
      },
    },
  };
  return {
    args,
    counts,
    fail,
    get body() {
      return body;
    },
    get board() {
      return board;
    },
    get comment() {
      return comment;
    },
    get state() {
      return state;
    },
  };
}
export function registerCancellationPublicationCases() {
  for (const hours of [23, 24, 25])
    test(`actual cancel Plan publishes saved Refine 10→${hours} under one owner before retiring the Plan proposal`, async () => {
      const f = cancellationHarness({ hours }),
        result = await runCancelPlan(f.args);
      assert.equal(result.status, 'cancelled', result.reason ?? result.error ?? result.detail);
      assert.equal(f.state, 'ready-for-plan');
      assert.equal(f.board.estimate, hours);
      assert.equal(parseIssueFieldDb(f.body).values.estimate, hours);
      assert.equal(f.comment.body.includes('### Planned Estimate'), false);
      const r = readDecompositionRecords(f.body);
      assert.equal(r.publication.status, 'complete');
      assert.equal(r.publication.writerId, 'cancel-plan');
      assert.equal(r.assessment.estimate.hours, hours);
    });
  test('cancel Plan exact retry retains its sealed comment after an unknown patch and failed compensation', async () => {
    const f = cancellationHarness({ fail: { patch: true } }),
      first = await runCancelPlan(f.args);
    assert.equal(first.publicationStatus, 'pending');
    assert.equal(readDecompositionRecords(f.body).publication.status, 'pending');
    f.fail.patch = false;
    const result = await runCancelPlan(f.args);
    assert.equal(result.status, 'cancelled', result.reason ?? result.error ?? result.detail);
    assert.equal(f.state, 'ready-for-plan');
    assert.equal(f.board.estimate, 25);
    assert.equal(parseIssueFieldDb(f.body).values.estimate, 25);
    assert.equal(f.comment.body.includes('### Planned Estimate'), false);
    assert.equal(readDecompositionRecords(f.body).publication.status, 'complete');
  });
  test('cancel Plan reconciles its saved intent after body invalidation and compensation are unavailable', async () => {
    const f = cancellationHarness({ fail: { invalidate: true } }),
      first = await runCancelPlan(f.args);
    assert.equal(first.publicationStatus, 'pending');
    assert.equal(f.board.estimate, 25);
    assert.equal(parseIssueFieldDb(f.body).values.estimate, 10);
    f.fail.invalidate = false;
    f.fail.body = false;
    const retry = await runCancelPlan(f.args);
    assert.equal(retry.status, 'cancelled', retry.reason ?? retry.detail);
    assert.equal(readDecompositionRecords(f.body).publication.status, 'complete');
    assert.equal(f.board.estimate, 25);
    assert.equal(parseIssueFieldDb(f.body).values.estimate, 25);
  });
  test('cancel Plan retains an unsupported field edit instead of overwriting or compensating it', async () => {
    const f = cancellationHarness({ fail: { foreign: true } }),
      result = await runCancelPlan(f.args);
    assert.notEqual(result.status, 'cancelled');
    assert.equal(f.board.estimate, 99, 'unsupported edit is retained');
    assert.equal(parseIssueFieldDb(f.body).values.estimate, 10);
    assert.equal(f.counts.patch, 0);
    assert.equal(f.counts.board, 0);
    assert.equal(f.counts.move, 0);
    assert.equal(readDecompositionRecords(f.body).publication.status, 'pending');
  });
  test('cancel Plan resumes its known partial board fields after a failed Size and Estimate sequence', async () => {
    const f = cancellationHarness({ planSize: 'L', fail: { boardParts: true } }),
      first = await runCancelPlan(f.args);
    assert.equal(first.publicationStatus, 'pending');
    assert.equal(f.board.size, 'M');
    assert.equal(f.board.estimate, 10);
    assert.equal(parseIssueFieldDb(f.body).values.size, 'L');
    f.fail.boardParts = false;
    f.fail.body = false;
    const result = await runCancelPlan(f.args);
    assert.equal(result.status, 'cancelled', result.reason ?? 'partial board did not reconcile');
    assert.equal(f.board.estimate, 25);
    assert.equal(f.board.size, 'M');
    assert.equal(readDecompositionRecords(f.body).publication.status, 'complete');
  });
  test('default forecast collector confirms cancellation retirement without resurrecting an earlier Plan estimate', async () => {
    const f = cancellationHarness({ forecast: true }),
      result = await runCancelPlan(f.args);
    assert.equal(result.status, 'cancelled', result.reason ?? 'forecast cancellation refused');
    const r = readDecompositionRecords(f.body);
    assert.equal(r.publication.status, 'complete');
    assert.equal(r.assessment.estimate.hours, 25);
    assert.equal(f.body.includes('aitm-estimation-forecast-ready'), false);
    assert.equal(f.board.estimate, 25);
  });
  test('successful cancellation with unavailable final projection keeps confirmed fields and reports pending', async () => {
    const f = cancellationHarness({ fail: { completeProjection: true } }),
      result = await runCancelPlan(f.args);
    assert.equal(
      result.status,
      'cancelled-publication-pending',
      result.reason ?? 'missing pending outcome'
    );
    assert.equal(result.publicationStatus, 'pending');
    assert.equal(f.state, 'ready-for-plan');
    assert.equal(f.board.estimate, 25);
    assert.equal(parseIssueFieldDb(f.body).values.estimate, 25);
    assert.equal(f.comment.body.includes('### Planned Estimate'), false);
    assert.equal(readDecompositionRecords(f.body).publication.status, 'pending');
  });
  test('cancel Plan resumes confirmed publication after its legal move without moving again', async () => {
    const f = cancellationHarness({ fail: { completeProjection: true } });
    assert.equal((await runCancelPlan(f.args)).status, 'cancelled-publication-pending');
    f.fail.completeProjection = false;
    const result = await runCancelPlan(f.args);
    assert.equal(result.status, 'cancelled', result.reason ?? result.status);
    assert.equal(f.counts.move, 1);
    assert.equal(readDecompositionRecords(f.body).publication.status, 'complete');
    assert.equal(f.board.estimate, 25);
    assert.equal((await runCancelPlan(f.args)).status, 'cancelled');
    assert.equal(f.counts.move, 1);
  });
  test('cancel Plan refuses prospective recovery-body overflow before pending or business writes', async () => {
    const f = cancellationHarness({
      commentPadding: 'Saved rationale.\n'.repeat(1000),
      bodyPadding: 'Historical context.\n'.repeat(2300),
    });
    const result = await runCancelPlan(f.args);
    assert.equal(result.status, 'refused', result.reason);
    assert.match(result.reason, /body-limit/);
    assert.deepEqual(f.counts, { body: 0, board: 0, patch: 0, move: 0, projection: 0 });
    assert.equal(readDecompositionRecords(f.body).publication, null);
  });
}
