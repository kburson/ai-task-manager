// @story #2163 — preserve the existing registered writer's retired forecast path.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cancellationHarness } from './decomposition-cancellation-publication.cases.mjs';
import { runCancelPlan } from '../../../../task-tracker/verbs/cancel-plan.mjs';
import { runInflateEstimate } from '../../../../task-tracker/verbs/inflate-estimate.mjs';
import {
  readDecompositionRecords,
  replaceDecompositionRecords,
} from '../../../../task-tracker/lib/decomposition-records.mjs';
import { canonicalDecompositionJson } from '../../../../task-tracker/lib/decomposition-assessment.mjs';
import { readEstimateBeforeRecord } from '../../../../task-tracker/lib/estimate-writer-publication.mjs';
import { assertInflationRetryAuthority } from '../../../../task-tracker/lib/inflation-intent.mjs';
import { estimateEffectDigest as hash } from '../../../../task-tracker/lib/decomposition-publication.mjs';
import { loadForecastProjection } from '../../../../task-tracker/lib/estimation/runtime-adapter.mjs';
import { parsePreloadedIssueComments } from '../../../../task-tracker/lib/github-records/github-comment-store.mjs';

test('inflation after real forecast retirement retains its history', async () => {
  const f = cancellationHarness({
    hours: 4,
    forecast: true,
    expectedWriterId: ['cancel-plan', 'inflate-estimate'],
  });
  assert.equal((await runCancelPlan(f.args)).status, 'cancelled');
  const base = f.args.deps,
    graphql = base.decomposition.forecast.graphql;
  let captured;
  const deps = {
    ...base,
    ...base.plannedEstimate,
    beforePublicationEffects: async (owner) => {
      const current = await owner.collectCurrent();
      const comments = (await deps.decomposition.forecast.graphql({})).data.repository.issue
        .comments.nodes;
      captured = {
        current,
        publication: current.publication,
        beforeRecord: readEstimateBeforeRecord(f.body),
        beforeBody: f.comment.body,
        commentIdentity: { repository: 'o/r', issue: 1987, restId: 99, graphqlId: 'IC_refine' },
        proposal: { estimate: { basis: 'published', hours: 6, proposalId: null }, size: 'M' },
        forecastEvidence: {
          body: f.body,
          comments,
          projection: await loadForecastProjection({
            cfg: f.args.cfg,
            issueNumber: 1987,
            deps: deps.decomposition.forecast,
          }),
          records: parsePreloadedIssueComments({ nodes: comments, repository: 'o/r', issue: 1987 }),
        },
      };
    },
    listComments: async (args) =>
      (await base.plannedEstimate.listComments(args)).map((c) => ({
        ...c,
        issue_url: 'https://api.github.com/repos/o/r/issues/1987',
      })),
    getIssueBody: async () => f.body,
    projectValuesForIssue: async () => f.board,
    fieldOptionMap: async () => ({}),
    writeProjectFieldValue: async ({ fieldId, value }) =>
      base.restoreBoardFields({
        fields: {
          ...f.board,
          [fieldId === 'EST' ? 'estimate' : 'size']:
            fieldId === 'EST' ? value.number : value.singleSelectOptionName,
        },
      }),
    decomposition: {
      ...base.decomposition,
      forecast: {
        graphql: async (request) => {
          const response = await graphql(request);
          for (const c of response.data.repository.issue.comments.nodes)
            c.databaseId = c.id === 'IC_refine' ? 99 : 100;
          return response;
        },
      },
    },
  };
  const result = await runInflateEstimate(
    {
      issueNumber: 1987,
      size: 'M',
      estimate: '6h',
      reason: 'New integration work.',
      items: ['Validation (~2h)'],
    },
    f.args.cfg,
    deps
  );
  assert.equal(
    result.status,
    'recorded',
    JSON.stringify({
      result,
      publication: readDecompositionRecords(f.body).publication,
      counts: f.counts,
    })
  );
  const final = readDecompositionRecords(f.body);
  assert.equal(final.assessment.inputDigest, final.publication.intendedInputDigest);
  assert.equal(captured.current.sourceObservations.readForecast.status, 'unavailable');
  captured.intendedBody = f.comment.body;
  const saved = structuredClone(captured),
    counts = structuredClone(f.counts);
  assert.equal(await assertInflationRetryAuthority(captured), undefined);
  assert.deepEqual(captured, saved);
  for (const mutate of [
    (a) => {
      a.current.sourceObservations.readForecast.value.publicationTransition.recordId =
        '01J00000000000000000000999';
    },
    (a) => {
      a.current.sourceObservations.readForecast.value.publicationTransition.payloadHash =
        'sha256:' + '0'.repeat(64);
    },
    (a) => {
      delete a.current.sourceObservations.readForecast.value.publicationTransition;
    },
    (a) => {
      a.current.sourceObservations.readForecast.value.extra = true;
    },
    (a) => {
      a.current.sourceObservations.readPolicy.status = 'unavailable';
    },
    (a) => {
      a.current.input.availability.reasons.push('plan-unavailable');
    },
    (a) => {
      a.forecastEvidence.projection.forecast = {
        recordId: a.beforeRecord.forecastBaseline.recordId,
      };
    },
    (a) => {
      a.publication.effects = a.publication.effects.filter((e) => e.id !== 'retired-ready');
    },
    (a) => {
      a.publication.effects.find((e) => e.id === 'retired-forecast').targetIdentity =
        'record:wrong';
    },
    (a) => {
      a.beforeRecord.effects
        .find((e) => e.id === 'retired-ready')
        .permittedDigests.push(hash('unexpected'));
    },
    (a) => {
      a.beforeRecord.fieldBaseline.estimate = 99;
    },
    (a) => {
      a.forecastEvidence.comments[1].body += 'changed record';
    },
    (a) => {
      a.current.sourceObservations.readForecast.value.proposals.push({
        proposalId: 'foreign',
        sourceDigest: hash('changed'),
      });
    },
    (a) => {
      a.forecastEvidence.projection.board.estimate = 99;
    },
  ]) {
    const changed = structuredClone(captured);
    mutate(changed);
    for (const observation of Object.values(changed.current.sourceObservations))
      observation.digest = hash(observation.value);
    const before = structuredClone(changed);
    await assert.rejects(
      () => assertInflationRetryAuthority(changed),
      /inflate-estimate:pending-source-drift/
    );
    assert.deepEqual(changed, before);
    assert.deepEqual(f.counts, counts);
  }
  // Keep metadata internally coherent so each negative reaches the retained
  // effect proof, instead of merely failing an earlier stale-body comparison.
  for (const [mutate, detail] of [
    [
      (a) => {
        a.publication.effects = a.publication.effects.filter((e) => e.id !== 'retired-ready');
      },
      'retired-effects',
    ],
    [
      (a) => {
        a.publication.effects.find((e) => e.id === 'retired-forecast').targetIdentity =
          'record:wrong';
      },
      'retired-seal',
    ],
    [
      (a) => {
        a.beforeRecord.effects
          .find((e) => e.id === 'retired-ready')
          .permittedDigests.push(hash('unexpected'));
      },
      'retired-seal',
    ],
    [
      (a) => {
        a.beforeRecord.fieldBaseline.estimate = 99;
      },
      'retired-before',
    ],
    [
      (a) => {
        a.publication.effects.find((e) => e.id === 'writer-before-values').resource = 'comment';
      },
      'retired-before',
    ],
  ]) {
    const changed = structuredClone(captured),
      oldBefore = canonicalDecompositionJson(changed.beforeRecord);
    mutate(changed);
    changed.publication.effects.find((e) => e.id === 'writer-before-values').intendedDigest = hash(
      changed.beforeRecord
    );
    const body = replaceDecompositionRecords(
      changed.current.sourceObservations.readIssue.value.body.replace(
        Buffer.from(oldBefore).toString('base64url'),
        Buffer.from(canonicalDecompositionJson(changed.beforeRecord)).toString('base64url')
      ),
      {
        assessment: readDecompositionRecords(changed.forecastEvidence.body).assessment,
        publication: changed.publication,
      }
    );
    changed.current.sourceObservations.readIssue.value.body = body;
    changed.current.sourceObservations.readIssue.digest = hash(
      changed.current.sourceObservations.readIssue.value
    );
    changed.forecastEvidence.body = body;
    const copy = structuredClone(changed);
    await assert.rejects(
      () => assertInflationRetryAuthority(changed),
      new RegExp('inflate-estimate:pending-source-drift:' + detail)
    );
    assert.deepEqual(changed, copy);
    assert.deepEqual(f.counts, counts);
  }
});
